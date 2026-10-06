import { GcbAuthModule } from "../auth/auth";
import { AppUtils } from "../utils";

const integrationsConfigurationPage = (() => {
  let bound = false;

  const MODAL_ID = "#app-modal";

  const INTEGRATIONS = {
    gmail: {
      title: "Gmail",
      description:
        "Configure the email address used by the application for notifications.",
      fields: [
        {
          name: "notifEmail",
          label: "Notification Email",
          type: "email",
          placeholder: "Enter notification email",
        },
      ],
      logo: "https://s13.gifyu.com/images/bnmHx.png",
    },
    discord: {
      title: "Discord",
      description:
        "Send application notifications and updates to a Discord channel.",
      fields: [
        {
          name: "notifDiscord",
          label: "Discord Webhook",
          type: "url",
          placeholder: "Enter Discord webhook URL",
        },
      ],
      logo: "https://s13.gifyu.com/images/bnmHv.png",
    },
    sheets: {
      title: "Google Sheets",
      description:
        "Connect the application to its Google Sheets and external sheet template.",
      fields: [
        {
          name: "spreadsheetId",
          label: "Google Spreadsheet ID",
          type: "text",
          placeholder: "Enter Google Spreadsheet ID",
          help: "Main Google Spreadsheet used by the application.",
        },
        {
          name: "externalSheetTemplateId",
          label: "External Sheet Template ID",
          type: "text",
          placeholder: "Enter external sheet template ID",
          help: "Google Sheet template cloned when creating external client sheets.",
        },
      ],
      logo: "https://s13.gifyu.com/images/bnmHH.png",
    },
    drive: {
      title: "Google Drive",
      description:
        "Configure the Google Drive folders used by the application.",
      fields: [
        {
          name: "reportFolderId",
          label: "Report Folder ID",
          type: "text",
          placeholder: "Enter Google Drive report folder ID",
          help: "Folder used to store generated reports.",
        },
        {
          name: "backupFolderId",
          label: "Backup Folder ID",
          type: "text",
          placeholder: "Enter Google Drive backup folder ID",
          help: "Folder used to store backups of application sheets.",
        },
        {
          name: "mainSheetsFolderId",
          label: "Main Sheets Folder ID",
          type: "text",
          placeholder: "Enter main sheets folder ID",
          help: "Folder containing the application's main Google Sheets.",
        },
      ],
      logo: "https://s13.gifyu.com/images/bnmHK.png",
    },
  };

  const init = () => {
    if (bound) {
      return;
    }

    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {
      return;
    }

    bound = false;

    $(document).off("click.integrationPage", "[data-integration-configure]");
  };

  const bindActions = () => {
    $(document)
      .off("click.integrationPage")
      .on(
        "click.integrationPage",
        "[data-integration-configure]",
        handleConfigure,
      );
  };

  const handleConfigure = (e) => {
    e.preventDefault();

    const integration = $(e.currentTarget).data("integration");

    if (!integration) {
      return;
    }

    openIntegrationModal(integration);
  };

  const loadData = async () => {
    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();
      AppUtils.gScriptRun({
        gscriptFunc: "getIntegrationStatus",
        args: [sessionId, signature],

        onSuccess: updateIntegrationStatus,

        onError: (err) => {
          console.error("getIntegrationStatus failed:", err);

          AppUtils.showDashboardToast(
            "Failed to load integration status.",
            "error",
          );
        },
      });
    } catch (error) {
      console.error("Authentication required for integration status:", error);

      AppUtils.showDashboardToast(
        error?.message || "Authentication required.",
        "error",
      );
    }
  };

  function getIntegrationConfig(integration) {
    return INTEGRATIONS[integration] || null;
  }

  function getIntegrationLogo(integration) {
    const config = getIntegrationConfig(integration);
    return config?.logo || "";
  }

  function updateIntegrationStatus(data) {
    if (!data || typeof data !== "object") {
      console.warn("Invalid integration status:", data);
      return;
    }

    Object.entries(INTEGRATIONS).forEach(([integration, config]) => {
      const statusEl = document.getElementById(
        `${integration}IntegrationStatus`,
      );

      if (!statusEl) {
        return;
      }

      const fields = config.fields || [];

      const configuredCount = fields.reduce((count, field) => {
        return count + (data[field.name]?.configured ? 1 : 0);
      }, 0);

      const totalFields = fields.length;

      let statusText = "Not configured";

      if (configuredCount === totalFields) {
        statusText = "Configured";
      } else if (configuredCount > 0) {
        statusText = `${configuredCount} of ${totalFields} configured`;
      }

      statusEl.classList.toggle("is-inactive", configuredCount === 0);

      statusEl.classList.toggle(
        "is-partial",
        configuredCount > 0 && configuredCount < totalFields,
      );

      statusEl.textContent = statusText;
    });

    const selected = AppUtils.cacheGet("selectedIntegration");

    if (selected) {
      openIntegrationModal(selected);
      AppUtils.cacheClear("selectedIntegration");
    }
  }

  function openIntegrationModal(integration) {
    const config = getIntegrationConfig(integration);
    if (!config) {
      return;
    }

    const ns = `.integrationConfig-${integration}`;

    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: buildHeaderHtml(integration, config),

      body: `
      <!-- CONFIGURATION FORM ENTRY -->
      <div id="main-modal-body">
        ${buildBodyHtml(config)}
      </div>

      <!-- REVIEW / CONFIRMATION ALERT -->
      <div id="review-modal-body" class="d-none">
        <h5 class="modal-title mb-2"><strong>Do you want to proceed?</strong></h5>
        <p>Please review the integration settings before applying the updates.</p>
      </div>
    `,

      footer: `
      <!-- INITIAL SUBMIT FOOTER -->
      <div id="main-modal-footer" class="d-flex gap-2">
        ${buildFooterHtml()}
      </div>

      <!-- REVIEW ACTION FOOTER -->
      <div id="review-modal-footer" class="d-flex gap-2 d-none">
        <button type="button" class="btn btn-secondary btn-modal-back">
          Back
        </button>
        <button type="button" class="btn btn-success btn-proceed">
          Proceed
        </button>
      </div>
    `,

      onOpen($modal) {
        $modal
          .off(ns)
          // Cancel Click -> Dismisses modal layout context
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          // Save Click -> Toggles UI to confirmation step
          .on(`click${ns}`, ".btn-save", (e) => {
            $modal
              .find("#main-modal-body, #main-modal-footer")
              .addClass("d-none");
            $modal
              .find("#review-modal-body, #review-modal-footer")
              .removeClass("d-none");
          })
          // Back Click -> Returns view back to configuration form fields
          .on(`click${ns}`, ".btn-back", () => {
            $modal
              .find("#review-modal-body, #review-modal-footer")
              .addClass("d-none");
            $modal
              .find("#main-modal-body, #main-modal-footer")
              .removeClass("d-none");
          })
          // Proceed Click -> Runs original integration submission engine
          .on(`click${ns}`, ".btn-proceed", () => {
            const $btn = $modal.find(".btn-proceed");

            AppUtils.lockModal(MODAL_ID);
            saveIntegration(integration, $modal, $btn);
          });

        loadIntegrationConfigStatus(integration, $modal);
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function buildHeaderHtml(integration, config) {
    const logoSrc = getIntegrationLogo(integration);
    const title = AppUtils.escapeHtml(config.title);

    return `
      <div class="integration-modal-header">
        <div class="integration-modal-logo">
          <img src="${logoSrc}" alt="${title}">
        </div>
        <div><strong>${title}</strong></div>
      </div>
    `;
  }

  function buildBodyHtml(config) {
    const description = AppUtils.escapeHtml(config.description);

    const fields = config.fields || [config.field];

    return `
    <div class="integration-modal-description mb-4">
      ${description}
    </div>

    <form id="integrationConfigForm">
      ${fields
        .map((field) => {
          const fieldLabel = AppUtils.escapeHtml(field.label);
          const fieldType = field.type;
          const fieldName = AppUtils.escapeHtml(field.name);
          const placeholder = AppUtils.escapeHtml(field.placeholder || "");
          const help = AppUtils.escapeHtml(
            field.help || "Leave blank to keep the current configuration.",
          );

          return `
            <div class="position-relative form-group mb-3">
              <label for="integrationConfigValue-${fieldName}">
                ${fieldLabel}
              </label>

              <input
                type="${fieldType}"
                id="integrationConfigValue-${fieldName}"
                name="${fieldName}"
                class="form-control"
                placeholder="${placeholder}"
                autocomplete="off"
              >

              <small
                id="integrationConfigHelp-${fieldName}"
                class="form-text text-muted"
              >
                ${help}
              </small>

              <div
                id="${fieldName}IntegrationStatus"
                class="integration-config-status mt-1"
              ></div>
            </div>
          `;
        })
        .join("")}
    </form>
  `;
  }

  function buildFooterHtml() {
    return `
      <button type="button" class="btn btn-secondary btn-cancel">Cancel</button>
      <button type="button" class="btn btn-primary btn-save">Save Changes</button>
    `;
  }

  async function loadIntegrationConfigStatus(integration, $modal) {
    const config = getIntegrationConfig(integration);

    if (!config) {
      return;
    }

    const fields = config.fields || [];

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getIntegrationConfigStatus",
        args: [sessionId, signature, integration],

        onSuccess: (data) => {
          fields.forEach((field) => {
            const fieldData = data?.fields?.[field.name];

            const $input = $modal.find(`#integrationConfigValue-${field.name}`);

            const $help = $modal.find(`#integrationConfigHelp-${field.name}`);

            if (!$input.length || !$help.length) {
              return;
            }

            if (!fieldData?.configured) {
              $input.attr("placeholder", "Not configured");

              $help
                .removeClass("is-configured")
                .text(
                  field.help ||
                    "No configuration has been saved yet. Enter a value to configure this integration.",
                );

              return;
            }

            $input.attr("placeholder", `Current: ${fieldData.masked}`);

            $help
              .addClass("is-configured")
              .text(
                "Currently configured. Leave blank to keep the current value.",
              );
          });
        },

        onError: (err) => {
          console.error("getIntegrationConfigStatus failed:", err);

          fields.forEach((field) => {
            const $input = $modal.find(`#integrationConfigValue-${field.name}`);

            const $help = $modal.find(`#integrationConfigHelp-${field.name}`);

            if (!$input.length || !$help.length) {
              return;
            }

            $input.attr("placeholder", "Unable to check current configuration");

            $help
              .removeClass("is-configured")
              .text("Unable to check the current configuration.");
          });
        },
      });
    } catch (error) {
      console.error(
        "Authentication required for integration config status:",
        error,
      );

      AppUtils.showDashboardToast(
        error?.message || "Authentication required.",
        "error",
      );
    }
  }

  async function saveIntegration(integration, $modal, $btn) {
    const config = getIntegrationConfig(integration);

    const title = config?.title || "Integration";

    if (!config) {
      return;
    }

    const value = {};

    config.fields.forEach((field) => {
      value[field.name] = String(
        $modal.find(`#integrationConfigValue-${field.name}`).val() || "",
      ).trim();
    });

    const hasValue = Object.values(value).some(
      (item) => String(item || "").trim() !== "",
    );

    if (!hasValue) {
      AppUtils.showDashboardToast("Please enter at least one value.", "error");

      return;
    }

    /*
     * Single-field integrations still send a scalar value
     * because the existing backend expects:
     *
     *   gmail   -> string
     *   discord -> string
     *
     * Multi-field integrations send the full object:
     *
     *   sheets -> { spreadsheetId, externalSheetTemplateId }
     *   drive  -> { reportFolderId, backupFolderId, mainSheetsFolderId }
     */
    const payload =
      config.fields.length === 1 ? value[config.fields[0].name] : value;

    const loading = AppUtils.setButtonLoading($btn[0], "Saving");

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "saveIntegration",
        args: [sessionId, signature, integration, payload],

        onSuccess: () => {
          loading.setSuccess("Configuration Saved");

          AppUtils.closeModal(MODAL_ID);

          AppUtils.showDashboardToast(
            `${title} configuration saved successfully!`,
            "success",
          );

          AppUtils.gScriptRun({
            gscriptFunc: "getIntegrationStatus",
            args: [sessionId, signature],

            onSuccess: (status) => {
              updateIntegrationStatus(status);
            },

            onError: (err) => {
              console.error("Failed to refresh integration status:", err);
            },
          });

          loadData();
        },

        onError: (err) => {
          console.error("saveIntegration failed:", err);

          AppUtils.showDashboardToast(
            err?.message || "Failed to save integration configuration.",
            "error",
          );

          loading.restore();
        },
      });
    } catch (error) {
      console.error("Authentication required for saveIntegration:", error);

      AppUtils.showDashboardToast(
        error?.message || "Authentication required.",
        "error",
      );

      loading.restore();
    }
  }

  return {
    init,
    destroy,
  };
})();

export { integrationsConfigurationPage };
