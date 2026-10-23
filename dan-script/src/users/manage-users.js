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
        <td class="text-break">${escapeHtml(user.email)}</td>
        <td>${enabledBadge(user.enabled)}</td>
        <td>${escapeHtml(user.role || "—")}</td>
        <td class="text-break">
        ${renderCapabilitiesCell(user.capabilities)}
        </td>
        <td>${statusBadge(user.online)}</td>
        <td class="text-break">${escapeHtml(user.notes || "—")}</td>
        <td class="action-btn-group" role="cell">
          <button type="button"
            class="p-0 btn border-0"
            data-manage-action="edit"
            data-email="${escapeHtml(user.email)}">
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
        gscriptFunc: "getManageUserOptions",
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
        gscriptFunc: "getManageUsersData",
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

    if (!user) {return;}

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
                  const current = row.html ? row.current : renderValue(row.current);

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

    function showUserModalStep($modal, step) {
      const isReview = step === "review";

      $modal
        .find("#manage-user-edit-body, #manage-user-edit-footer")
        .toggleClass("d-none", isReview);

      $modal.find("#manage-user-review-body").toggleClass("d-none", !isReview);

      $modal
        .find("#manage-user-review-footer")
        .toggleClass("d-none", !isReview)
        .toggleClass("d-flex", isReview);
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

    AppUtils.openModal(MODAL_ID, {
      size: "lg",
      placement: "center",
      scrollable: true,

      header: `
        <strong>Manage User</strong>
        <div class="small text-muted ms-2"><i class="fa fa-user"></i>${escapeHtml(user.email)}</div>
      `,

      body: `
        <form id="manage-user-edit-form">
          <!-- STEP 1: MAIN FORM BODY -->
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
              <label class="form-label" for="manage-user-capabilities">Capabilities</label>
              <select id="manage-user-capabilities"
                class="custom-select js-select2"
                data-field="capabilities"
                multiple>
                ${capabilityOptions}
              </select>
              <div class="form-text">
                Select the capabilities assigned to this user.
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label" for="manage-user-notes">Notes</label>
              <textarea id="manage-user-notes"
                class="form-control"
                data-field="notes"
                rows="2"
                maxlength="1000">${escapeHtml(user.notes || "")}</textarea>
            </div>
          </div>

          <!-- STEP 2: REVIEW / CONFIRMATION BODY -->
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

        </form>
      `,

      footer: `
        <!-- STEP 1: EDIT FOOTER -->
        <div id="manage-user-edit-footer" class="d-flex gap-2">
          <button type="button"
            class="btn btn-outline-secondary"
            data-manage-modal-action="cancel">
            Cancel
          </button>

          <button type="button"
            class="btn btn-gc"
            data-manage-modal-action="review">
            Submit
          </button>
        </div>

        <!-- STEP 2: REVIEW FOOTER -->
        <div id="manage-user-review-footer" class="d-none gap-2">
          <button type="button"
            class="btn btn-outline-secondary"
            data-manage-modal-action="back">
            Back
          </button>

          <button type="button"
            class="btn btn-gc"
            data-manage-modal-action="proceed">
            <i class="fa fa-check me-1"></i>
            Confirm & Save
          </button>
        </div>
      `,

      onOpen: ($modal) => {
        $modal.off(MODAL_NS);

        const $enabled = $modal.find('[data-field="enabled"]');
        const $role = $modal.find('[data-field="role"]');
        const $capabilities = $modal.find('[data-field="capabilities"]');
        const $notes = $modal.find('[data-field="notes"]');

        // Explicitly synchronize form values with the selected user.
        // This also updates Select2's displayed selection.
        $enabled.val(String(normalizeEnabled(user.enabled)));
        $role.val(user.role ?? "");
        $capabilities.val(
          Array.isArray(user.capabilities) ? user.capabilities : [],
        );
        $notes.val(user.notes ?? "");

        $enabled.add($role).add($capabilities).trigger("change.select2");

        $modal
          .on(`click${MODAL_NS}`, '[data-manage-modal-action="cancel"]', () =>
            AppUtils.closeModal(MODAL_ID),
          )
          .on(`click${MODAL_NS}`, '[data-manage-modal-action="review"]', () => {
            const updated = getEditedUserData($modal);

            renderUserReview($modal, updated);
            showUserModalStep($modal, "review");
          })
          .on(`click${MODAL_NS}`, '[data-manage-modal-action="back"]', () =>
            showUserModalStep($modal, "edit"),
          )
          .on(`click${MODAL_NS}`, '[data-manage-modal-action="proceed"]', () =>
            saveUser(user.email),
          );
      },

      onClose: () => {
        const $modal = $(MODAL_ID);
        $modal.off(MODAL_NS);
      },
    });
  }

  async function saveUser(email) {
    const user = users.find(
      (item) => item.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (!user || savingEmails.has(user.email)) {return;}

    const modal = document.querySelector(`${MODAL_ID} .modal-content`);
    if (!modal) {return;}

    const enabledField = modal.querySelector('[data-field="enabled"]');
    const roleField = modal.querySelector('[data-field="role"]');
    const capabilitiesField = modal.querySelector(
      '[data-field="capabilities"]',
    );
    const notesField = modal.querySelector('[data-field="notes"]');
    const saveButton = modal.querySelector('[data-manage-modal-action="save"]');

    if (!enabledField || !roleField || !capabilitiesField || !notesField) {
      showMessage("Unable to read the edited fields.", "danger");
      return;
    }

    const payload = {
      email: user.email,
      enabled: enabledField.value === "true",
      role: roleField.value,
      capabilities: Array.from(capabilitiesField.selectedOptions).map(
        (option) => option.value,
      ),
      notes: notesField.value.trim(),
    };

    savingEmails.add(user.email);

    const loading = AppUtils.setButtonLoading(saveButton, false, true);

    try {
      const [sessionId, signature] = await getAuth();

      AppUtils.gScriptRun({
        gscriptFunc: "updateManagedUser",
        args: [sessionId, signature, payload],

        onSuccess: (result) => {
          savingEmails.delete(user.email);
          loading.restore();

          if (!result?.success) {
            showMessage(
              result?.message || "The server did not confirm the update.",
              "danger",
            );
            return;
          }

          AppUtils.closeModal(MODAL_ID);
          showMessage(result.message || "User updated.", "success");

          // Invalidate stale data, then immediately reload the summary and table.
          AppUtils.cacheClear(CACHE_KEY);
          refreshUsers(true);
        },

        onError: (error) => {
          savingEmails.delete(user.email);
          loading.restore();
          handleError(error, "Unable to update the user.");
        },
      });
    } catch (error) {
      savingEmails.delete(user.email);
      loading.restore();
      handleError(error, "Unable to retrieve authentication details.");
    }
  }

  function onClick(event) {
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
