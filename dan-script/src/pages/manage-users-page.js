import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { DataTableModule } from "../components/data-table.js";
import { AppUtils } from "../utils/utils.js";

const manageUsersPage = (() => {
  const ROOT_ID = "manage-users-page";
  const TABLE_ID = "#manage-users-table";
  const TABLE_BODY_ID = "manage-users-table-body";
  const MODAL_ID = "#app-modal";

  const CACHE_KEY = "manageUsersData";
  const REFRESH_INTERVAL = 10000;
  const MODAL_NS = ".manageUsers";

  let initialized = false;
  let refreshTimer = null;
  let isRefreshing = false;
  let users = [];
  let options = { roles: [], capabilities: [] };
  let savingEmails = new Set();

  const $ = window.jQuery;

  function escapeHtml(value) {
    return AppUtils.escapeHtml(String(value ?? ""));
  }

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function showMessage(message, type = "info") {
    const element = document.getElementById("manage-users-message");
    if (!element) {return;}

    element.innerHTML = message
      ? `<div class="alert alert-${escapeHtml(type)} py-2 mb-0">${escapeHtml(message)}</div>`
      : "";
  }

  function setSummary(summary = {}) {
    const values = {
      "manage-users-total": summary.total,
      "manage-users-enabled": summary.enabled,
      "manage-users-disabled": summary.disabled,
      "manage-users-online": summary.online,
    };

    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {element.textContent = value ?? 0;}
    });
  }

  function enabledBadge(enabled) {
    return enabled
      ? '<span class="badge bg-success">Enabled</span>'
      : '<span class="badge bg-secondary">Disabled</span>';
  }

  function statusBadge(online) {
    return online
      ? '<span class="badge bg-success">Online</span>'
      : '<span class="badge bg-secondary">Offline</span>';
  }

  function renderDisplayRow(user) {
    return `
    <tr>
      <td>${statusBadge(user.online)}</td>
      <td class="text-break">${escapeHtml(user.email)}</td>
      <td>${enabledBadge(user.enabled)}</td>
      <td>${escapeHtml(user.role || "—")}</td>
      <td class="text-break">
        ${renderCapabilitiesCell(user.capabilities)}
      </td>
      <td class="text-break">${escapeHtml(user.notes || "—")}</td>
      <td class="action-btn-group" role="cell">
        <button
          type="button"
          class="p-0 btn border-0"
          data-manage-action="edit"
          data-email="${escapeHtml(user.email)}"
          title="Edit user"
        >
          <i class="pe-7s-edit"></i>
        </button>
      </td>
    </tr>
  `;
  }

  function renderUsers() {
    const tbody = document.getElementById(TABLE_BODY_ID);
    if (!tbody) {return;}

    DataTableModule.hideTableOverlay(TABLE_ID);
    DataTableModule.destroy(TABLE_ID);
    tbody.innerHTML = "";


    if (!users.length) {
      DataTableModule.showEmpty(TABLE_ID, "No users found.");
      return;
    }

    users.forEach((user) => {
      tbody.insertAdjacentHTML("beforeend", renderDisplayRow(user));
    });

    DataTableModule.init("Manage Users", TABLE_ID, false, {
      paging: false,
      scrollY: "420px",
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: ["info"],
        bottomEnd: ["search"],
      },
    });
  }

  function renderCapabilitiesCell(capabilities) {
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return "—";
    }

    const count = capabilities.length;

    const details = capabilities
      .map((capability) => escapeHtml(capability))
      .join("\n");

    return `
    <span
      class="badge bg-primary"
      title="${details}"
    >
      ${count} capabilit${count === 1 ? "y" : "ies"}
    </span>
  `;
  }

  function updateView(data, forceRender = false) {
    const nextUsers = Array.isArray(data?.users) ? data.users : [];
    const nextData = JSON.stringify({
      users: nextUsers,
      summary: data?.summary || {},
    });

    const currentData = JSON.stringify({
      users,
      summary: getCurrentSummary(),
    });

    users = nextUsers;
    setSummary(data?.summary);

    if (forceRender || nextData !== currentData) {
      renderUsers();
    }
  }

  function getCurrentSummary() {
    return {
      total:
        Number(document.getElementById("manage-users-total")?.textContent) || 0,
      enabled:
        Number(document.getElementById("manage-users-enabled")?.textContent) ||
        0,
      disabled:
        Number(document.getElementById("manage-users-disabled")?.textContent) ||
        0,
      online:
        Number(document.getElementById("manage-users-online")?.textContent) ||
        0,
    };
  }

  async function getAuth() {
    const authArgs = await getAuthArgs();

    if (!Array.isArray(authArgs) || authArgs.length !== 2) {
      throw new Error("Authentication required.");
    }

    return authArgs;
  }

  function handleError(error, fallback) {
    if (handleInvalidSessionError(error)) {return;}

    AppUtils.showError(error?.message || fallback);
  }

  async function loadOptions() {
    try {
      const [sessionId, signature] = await getAuth();

      AppUtils.gScriptRun({
        gscriptFunc: "getAdminAuthorizedUserOptions",
        args: [sessionId, signature],

        onSuccess: (result) => {
          options = {
            roles: Array.isArray(result?.roles) ? result.roles : [],
            capabilities: Array.isArray(result?.capabilities)
              ? result.capabilities
              : [],
          };

          // Options are required before opening the edit modal.
        },

        onError: (error) => {
          handleError(error, "Unable to load user-management options.");
        },
      });
    } catch (error) {
      handleError(error, "Unable to retrieve authentication details.");
    }
  }

  /*
   * Render cache immediately, then fetch current server data.
   */
  function loadUsers() {
    const cached = AppUtils.cacheGet(CACHE_KEY);

    if (cached && Array.isArray(cached.users)) {
      users = cached.users;
      setSummary(cached.summary);
      renderUsers();
    } else {
      DataTableModule.showLoader(TABLE_ID);
    }

    refreshUsers(true);
  }

  /*
   * Refresh user data and online status.
   * Update cache and rebuild the table only when data changes.
   */
  async function refreshUsers(force = false) {
    if (!getRoot() || (isRefreshing && !force)) {return;}

    isRefreshing = true;

    try {
      const [sessionId, signature] = await getAuth();

      AppUtils.gScriptRun({
        gscriptFunc: "getAdminAuthorizedUsers",
        args: [sessionId, signature],

        onSuccess: (result) => {
          isRefreshing = false;

          if (!result || !Array.isArray(result.users)) {
            console.error("[ManageUsers] Invalid server response.");
            scheduleRefresh();
            return;
          }

          AppUtils.cacheSet(CACHE_KEY, result);

          const cached = AppUtils.cacheGet(CACHE_KEY);
          updateView(cached || result);

          scheduleRefresh();
        },

        onError: (error) => {
          isRefreshing = false;
          console.error("[ManageUsers] Refresh failed:", error);

          if (!users.length) {
            DataTableModule.showError(TABLE_ID, "Unable to load users.");
          }

          if (!handleInvalidSessionError(error)) {
            console.warn(error?.message || error);
          }

          scheduleRefresh();
        },
      });
    } catch (error) {
      isRefreshing = false;

      if (!handleInvalidSessionError(error)) {
        console.error("[ManageUsers] Authentication failed:", error);

        if (!users.length) {
          DataTableModule.showError(TABLE_ID, "Unable to load users.");
        }
      }

      scheduleRefresh();
    }
  }

  function scheduleRefresh() {
    stopRefresh();

    if (!initialized) {return;}

    refreshTimer = setTimeout(() => {
      refreshUsers();
    }, REFRESH_INTERVAL);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }
  
  function openEditModal(email) {
    const user = users.find(
      (item) => item.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (!user) {
      return;
    }

    const roleOptions = options.roles
      .map(
        (role) => `
        <option value="${escapeHtml(role)}"
          ${role === user.role ? "selected" : ""}>
          ${escapeHtml(role)}
        </option>
      `,
      )
      .join("");

    const capabilityOptions = options.capabilities
      .map(
        (capability) => `
        <option value="${escapeHtml(capability)}"
          ${(user.capabilities || []).includes(capability) ? "selected" : ""}>
          ${escapeHtml(capability)}
        </option>
      `,
      )
      .join("");

    const isEnabled = normalizeEnabled(user.enabled);

    function getEditedUserData($modal) {
      return {
        enabled: $modal.find('[data-field="enabled"]').val() === "true",

        role: $modal.find('[data-field="role"]').val() || "",

        capabilities: $modal.find('[data-field="capabilities"]').val() || [],

        notes: String($modal.find('[data-field="notes"]').val() ?? "").trim(),
      };
    }

    function renderUserReview($modal, updated) {
      const currentCapabilities = user.capabilities || [];
      const updatedCapabilities = updated.capabilities;

      const escape = (value) => escapeHtml(String(value ?? ""));

      const renderValue = (value) => {
        const normalized = String(value ?? "").trim();

        return normalized
          ? escape(normalized)
          : '<span class="text-muted">None</span>';
      };

      const renderCapabilities = (items) => {
        if (!items.length) {
          return '<span class="text-muted">None</span>';
        }

        return items
          .map(
            (capability) =>
              `<span class="badge bg-light text-dark border me-1 mb-1">${escape(capability)}</span>`,
          )
          .join("");
      };

      const rows = [
        {
          label: "Account status",
          current: isEnabled ? "Enabled" : "Disabled",
          updated: updated.enabled ? "Enabled" : "Disabled",
        },
        {
          label: "Role",
          current: user.role,
          updated: updated.role,
        },
        {
          label: "Capabilities",
          current: renderCapabilities(currentCapabilities),
          updated: renderCapabilities(updatedCapabilities),
          html: true,
        },
        {
          label: "Notes",
          current: renderValue(user.notes),
          updated: renderValue(updated.notes),
          html: true,
        },
      ];

      $modal.find("#manage-user-review-content").html(`
      <div class="mb-3">
        <div class="small text-muted">User</div>
        <strong>${escape(user.email)}</strong>
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-0">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Current</th>
              <th>Updated</th>
            </tr>
          </thead>

          <tbody>
            ${rows
              .map((row) => {
                const current = row.html
                  ? row.current
                  : renderValue(row.current);

                const next = row.html ? row.updated : renderValue(row.updated);

                return `
                  <tr>
                    <th scope="row">${escape(row.label)}</th>
                    <td>${current}</td>
                    <td>${next}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `);
    }

    AppUtils.openModal(MODAL_ID, {
      size: "lg",
      placement: "center",
      scrollable: true,

      header: `
      <strong>Manage User</strong>
      <div class="small text-muted ms-2">
        <i class="fa fa-user"></i>
        ${escapeHtml(user.email)}
      </div>
    `,

      body: `
      <!-- MAIN EDIT FORM -->
      <form id="manage-user-edit-form">

        <div id="manage-user-edit-body">
          <div class="row g-3 mb-3">

            <div class="col-12 col-md-6">
              <label class="form-label" for="manage-user-enabled">
                Account status
              </label>

              <select
                id="manage-user-enabled"
                class="custom-select js-select2"
                data-field="enabled"
              >
                <option value="true" ${isEnabled ? "selected" : ""}>
                  Enabled
                </option>

                <option value="false" ${!isEnabled ? "selected" : ""}>
                  Disabled
                </option>
              </select>
            </div>

            <div class="col-12 col-md-6">
              <label class="form-label" for="manage-user-role">
                Role
              </label>

              <select
                id="manage-user-role"
                class="custom-select js-select2"
                data-field="role"
              >
                ${roleOptions}
              </select>
            </div>

          </div>

          <div class="mb-3">
            <label class="form-label" for="manage-user-capabilities">
              Capabilities
            </label>

            <select
              id="manage-user-capabilities"
              class="custom-select js-select2"
              data-field="capabilities"
              multiple
            >
              ${capabilityOptions}
            </select>

            <div class="form-text">
              Select the capabilities assigned to this user.
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label" for="manage-user-notes">
              Notes
            </label>

            <textarea
              id="manage-user-notes"
              class="form-control"
              data-field="notes"
              rows="2"
              maxlength="1000"
            >${escapeHtml(user.notes || "")}</textarea>
          </div>
        </div>

      </form>

      <!-- REVIEW -->
      <div id="manage-user-review-body" class="d-none">
        <h5 class="mb-2">
          <strong>Review User Changes</strong>
        </h5>

        <p class="text-muted small">
          Review the updated account settings before saving.
        </p>

        <div id="manage-user-review-content"></div>

        <div class="alert alert-warning mt-3 mb-0">
          <i class="fa fa-shield-halved me-1"></i>
          These changes will update this user's account settings and access permissions.
        </div>
      </div>
    `,

      footer: `
      <!-- APP-MODAL-MAIN-ACTIONS -->
      <div id="manage-user-edit-footer" class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary"
          data-manage-modal-action="cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-gc btn-review-user"
        >
          Review Changes
        </button>
      </div>

      <!-- APP-MODAL-REVIEW-ACTIONS -->
      <div id="manage-user-review-footer" class="d-none gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary btn-modal-back"
        >
          Back
        </button>

        <button
          type="button"
          class="btn btn-gc btn-proceed"
        >
          <i class="fa fa-check me-1"></i>
          Confirm & Save
        </button>
      </div>
    `,

      review: {
        enabled: true,

        selectors: {
          main: "#manage-user-edit-body, #manage-user-edit-footer",
          review: "#manage-user-review-body, #manage-user-review-footer",
          trigger: ".btn-review-user",
          back: ".btn-modal-back",
          proceed: ".btn-proceed",
        },

        getData($modal) {
          return getEditedUserData($modal);
        },

        onReview($modal, updated) {
          renderUserReview($modal, updated);
        },

        onProceed($modal, data, $button, controls) {
          return saveUser(user.email, data, $button, controls);
        },
      },

      onOpen($modal) {
        $modal.off(MODAL_NS);

        const $enabled = $modal.find('[data-field="enabled"]');
        const $role = $modal.find('[data-field="role"]');
        const $capabilities = $modal.find('[data-field="capabilities"]');
        const $notes = $modal.find('[data-field="notes"]');

        // Synchronize form values with the selected user.
        $enabled.val(String(isEnabled));
        $role.val(user.role ?? "");

        $capabilities.val(
          Array.isArray(user.capabilities) ? user.capabilities : [],
        );

        $notes.val(user.notes ?? "");

        $enabled.add($role).add($capabilities).trigger("change.select2");

        $modal.on(
          `click${MODAL_NS}`,
          '[data-manage-modal-action="cancel"]',
          () => {
            AppUtils.closeModal(MODAL_ID);
          },
        );
      },

      onClose($modal) {
        $modal.off(MODAL_NS);
      },
    });
  }

  async function saveUser(email, reviewedData, $saveButton, controls = {}) {
    const user = users.find(
      (item) => item.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (!user || savingEmails.has(user.email)) {
      controls.release?.();
      return false;
    }

    if (!reviewedData || !$saveButton?.length) {
      controls.release?.();
      return false;
    }

    const payload = {
      email: user.email,
      enabled: reviewedData.enabled,
      role: reviewedData.role,
      capabilities: reviewedData.capabilities,
      notes: reviewedData.notes,
    };

    savingEmails.add(user.email);

    const loading = AppUtils.setButtonLoading($saveButton[0], false, true);

    try {
      const [sessionId, signature] = await getAuth();

      AppUtils.gScriptRun({
        gscriptFunc: "updateAdminAuthorizedUser",
        args: [sessionId, signature, payload],

        onSuccess: (result) => {
          savingEmails.delete(user.email);
          loading.restore();

          if (!result?.success) {
            controls.release?.();

            showMessage(
              result?.message || "The server did not confirm the update.",
              "danger",
            );

            return;
          }

          AppUtils.closeModal(MODAL_ID);

          showMessage(result.message || "User updated.", "success");

          // Invalidate stale data and refresh the user list.
          AppUtils.cacheClear(CACHE_KEY);
          refreshUsers(true);
        },

        onError: (error) => {
          savingEmails.delete(user.email);
          loading.restore();

          controls.release?.();

          handleError(error, "Unable to update the user.");
        },
      });

      return true;
    } catch (error) {
      savingEmails.delete(user.email);
      loading.restore();

      controls.release?.();

      handleError(error, "Unable to retrieve authentication details.");

      return false;
    }
  }

  function normalizeEnabled(value) {
    return (
      value === true ||
      value === 1 ||
      ["true", "1", "enabled", "active"].includes(
        String(value ?? "")
          .trim()
          .toLowerCase(),
      )
    );
  }

  function openCreateModal() {
    const roleOptions = options.roles
      .map(
        (role) => `
        <option value="${escapeHtml(role)}">
          ${escapeHtml(role)}
        </option>
      `,
      )
      .join("");

    const capabilityOptions = options.capabilities
      .map(
        (capability) => `
        <option value="${escapeHtml(capability)}">
          ${escapeHtml(capability)}
        </option>
      `,
      )
      .join("");

    AppUtils.openModal(MODAL_ID, {
      size: "lg",
      placement: "center",
      scrollable: true,

      header: `
      <strong>Create Authorized User</strong>
      <div class="small text-muted ms-2">
        <i class="fa fa-user-plus"></i>
        New account
      </div>
    `,

      body: `
      <form id="manage-user-create-form">
        <div class="mb-3">
          <label class="form-label" for="manage-user-create-email">
            Email address
          </label>
          <input
            type="email"
            id="manage-user-create-email"
            class="form-control"
            data-field="email"
            placeholder="user@example.com"
            maxlength="254"
            required
          >
          <div class="form-text">
            The user must sign in with this Google account.
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-12 col-md-6">
            <label class="form-label" for="manage-user-create-enabled">
              Account status
            </label>
            <select
              id="manage-user-create-enabled"
              class="custom-select js-select2"
              data-field="enabled"
            >
              <option value="true" selected>Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>

          <div class="col-12 col-md-6">
            <label class="form-label" for="manage-user-create-role">
              Role
            </label>
            <select
              id="manage-user-create-role"
              class="custom-select js-select2"
              data-field="role"
              required
            >
              <option value="">Select role</option>
              ${roleOptions}
            </select>
          </div>

          <div class="col-12">
            <div
              class="form-group"
              id="create-manager-name-group"
              style="display: none;"
            >
              <label class="form-label" for="create-manager-name">
                Manager Name <span class="text-danger">*</span>
              </label>

              <input
                type="text"
                class="form-control"
                id="create-manager-name"
                name="managerName"
                maxlength="100"
                placeholder="Enter manager name"
                autocomplete="off"
              >
            </div>
          </div>
        </div>

        <div class="mb-3">
          <label
            class="form-label"
            for="manage-user-create-capabilities"
          >
            Capabilities
          </label>
          <select
            id="manage-user-create-capabilities"
            class="custom-select js-select2"
            data-field="capabilities"
            multiple
          >
            ${capabilityOptions}
          </select>
          <div class="form-text">
            Select the permissions assigned to this account.
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label" for="manage-user-create-notes">
            Notes
          </label>
          <textarea
            id="manage-user-create-notes"
            class="form-control"
            data-field="notes"
            rows="2"
            maxlength="1000"
          ></textarea>
        </div>

        <div class="alert alert-info mb-0">
          <i class="fa fa-info-circle me-1"></i>
          The Google identity will be linked automatically when this user
          signs in for the first time.
        </div>
      </form>

      <div id="manage-user-create-review-body" style="display: none;">
        <div class="alert alert-info">
          <i class="fa fa-info-circle me-1"></i>
          Review the new authorized user details before creating the account.
        </div>

        <div id="manage-user-create-review-content"></div>
      </div>
    `,

      footer: `
      <!-- APP-MODAL-MAIN-ACTIONS -->
      <div id="manage-user-create-footer" class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary"
          data-create-user-action="cancel"
        >
          Cancel
        </button>

        <button type="button" class="btn btn-gc btn-review-user">
          <i class="pe-7s-check me-1"></i>
          Review User
        </button>
      </div>

      <!-- APP-MODAL-REVIEW-ACTIONS -->
      <div id="manage-user-create-review-footer" class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-modal-back">
          Back
        </button>

        <button type="button" class="btn btn-gc btn-proceed">
          <i class="pe-7s-plus me-1"></i>
          Create User
        </button>
      </div>
    `,

      review: {
        enabled: true,

        selectors: {
          main: "#manage-user-create-form, #manage-user-create-footer",
          review:
            "#manage-user-create-review-body, #manage-user-create-review-footer",
          trigger: ".btn-review-user",
          back: ".btn-modal-back",
          proceed: ".btn-proceed",
        },

        getData: ($modal) => {
          const form = $modal.find("#manage-user-create-form")[0];

          if (!form) {return null;}

          const emailField = form.querySelector('[data-field="email"]');
          const enabledField = form.querySelector('[data-field="enabled"]');
          const roleField = form.querySelector('[data-field="role"]');
          const capabilitiesField = form.querySelector(
            '[data-field="capabilities"]',
          );
          const notesField = form.querySelector('[data-field="notes"]');
          const managerNameField = form.querySelector("#create-manager-name");

          if (!form.reportValidity()) {return null;}

          const email = emailField.value.trim().toLowerCase();
          const role = roleField.value;
          const managerName = managerNameField?.value.trim() || "";

          if (users.some((user) => user.email.toLowerCase() === email)) {
            showMessage(
              "An account with this email already exists.",
              "warning",
            );
            emailField.focus();
            return null;
          }

          if (role === "manager" && !managerName) {
            showMessage("Please enter the Manager Name.", "warning");
            managerNameField?.focus();
            return null;
          }

          return {
            email,
            enabled: enabledField.value === "true",
            role,
            capabilities: Array.from(
              capabilitiesField.selectedOptions,
              (option) => option.value,
            ),
            notes: notesField.value.trim(),
            ...(role === "manager" ? { managerName } : {}),
          };
        },

        onReview: ($modal, data) => {
          renderCreateUserReview($modal, data);
        },

        onProceed: ($modal, data, $button, controls) => {
          return createUser($modal, data, $button, controls);
        },
      },

      onOpen: ($modal) => {
        $modal.off(MODAL_NS);

        $modal.on(
          `click${MODAL_NS}`,
          '[data-create-user-action="cancel"]',
          () => AppUtils.closeModal(MODAL_ID),
        );

        const $roleField = $modal.find("#manage-user-create-role");
        const $managerNameGroup = $modal.find("#create-manager-name-group");
        const $managerNameField = $modal.find("#create-manager-name");

        const toggleManagerNameField = () => {
          const isManager = $roleField.val() === "manager";

          $managerNameGroup.toggle(isManager);
          $managerNameField.prop("required", isManager);

          if (!isManager) {
            $managerNameField.val("");
          }
        };

        $roleField
          .off(`change${MODAL_NS}`)
          .on(`change${MODAL_NS}`, toggleManagerNameField);

        toggleManagerNameField();
      },

      onClose: () => {
        $(MODAL_ID).off(MODAL_NS);
      },
    });
  }

  function renderCreateUserReview($modal, data) {
    const $container = $modal.find("#manage-user-create-review-content");

    const addRow = (label, value) => {
      const $row = $("<div>").addClass(
        "d-flex justify-content-between align-items-start gap-3 py-2 border-bottom",
      );

      $("<div>")
        .addClass("text-muted flex-shrink-0")
        .text(label)
        .appendTo($row);

      $("<div>")
        .addClass("text-end fw-medium text-break")
        .text(value || "Not provided")
        .appendTo($row);

      $container.append($row);
    };

    $container.empty();

    addRow("Email address", data.email);
    addRow("Account status", data.enabled ? "Enabled" : "Disabled");
    addRow("Role", data.role);

    if (data.role === "manager") {
      addRow("Manager name", data.managerName);
    }

    const $capabilities = $("<div>").addClass("py-2 border-bottom");

    $("<div>")
      .addClass("text-muted mb-2")
      .text("Capabilities")
      .appendTo($capabilities);

    const $badges = $("<div>").addClass("d-flex flex-wrap gap-1");

    if (data.capabilities.length) {
      data.capabilities.forEach((capability) => {
        $("<span>")
          .addClass("badge bg-light text-dark border")
          .text(capability)
          .appendTo($badges);
      });
    } else {
      $("<span>")
        .addClass("text-muted")
        .text("No capabilities assigned")
        .appendTo($badges);
    }

    $capabilities.append($badges);
    $container.append($capabilities);

    addRow("Notes", data.notes);
  }

  async function createUser(
    $modal,
    reviewedData,
    $submitButton,
    controls = {},
  ) {
    const email = reviewedData?.email;

    if (!email || !reviewedData) {
      return false;
    }

    if (users.some((user) => user.email.toLowerCase() === email)) {
      showMessage("An account with this email already exists.", "warning");
      return false;
    }

    if (savingEmails.has(email)) {
      return false;
    }

    savingEmails.add(email);

    const loading = AppUtils.setButtonLoading($submitButton[0], false, true);

    const restoreSubmission = () => {
      savingEmails.delete(email);
      loading.restore();
    };

    try {
      const [sessionId, signature] = await getAuth();

      AppUtils.gScriptRun({
        gscriptFunc: "createAdminAuthorizedUser",
        args: [sessionId, signature, reviewedData],

        onSuccess: (result) => {
          restoreSubmission();

          if (!result?.success) {
            controls.release?.();

            showMessage(
              result?.message || "The server did not confirm account creation.",
              "danger",
            );

            return;
          }

          AppUtils.closeModal(MODAL_ID);

          showMessage(
            result.message || "Authorized user created.",
            result.auditWarning ? "warning" : "success",
          );

          AppUtils.cacheClear(CACHE_KEY);
          refreshUsers(true);
        },

        onError: (error) => {
          restoreSubmission();
          controls.release?.();

          handleError(error, "Unable to create the authorized user.");
        },
      });

      // Request successfully dispatched. Keep the review modal locked
      // until the server callback succeeds or releases it on failure.
      return true;
    } catch (error) {
      restoreSubmission();
      controls.release?.();

      handleError(error, "Unable to retrieve authentication details.");

      return false;
    }
  }

  function onClick(event) {
    const createButton = event.target.closest("#manage-users-create");

    if (createButton) {
      if (!options.roles.length) {
        showMessage(
          "User-management options are still loading. Please try again.",
          "info",
        );
        return;
      }

      openCreateModal();
      return;
    }

    const button = event.target.closest("[data-manage-action]");
    if (!button) {return;}

    if (button.dataset.manageAction === "edit") {
      openEditModal(button.dataset.email);
    }
  }

  function init() {
    if (initialized || !getRoot()) {return;}

    initialized = true;
    savingEmails = new Set();

    getRoot().addEventListener("click", onClick);

    loadOptions();
    loadUsers();
  }

  function destroy() {
    if (!initialized) {return;}

    stopRefresh();
    getRoot()?.removeEventListener("click", onClick);
    $(MODAL_ID).off(MODAL_NS);

    DataTableModule.destroy(TABLE_ID);

    initialized = false;
    isRefreshing = false;
    users = [];
    savingEmails.clear();
  }

  return {
    init,
    destroy,
    stopRefresh,
  };
})();

export { manageUsersPage };
