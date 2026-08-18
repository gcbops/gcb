import { AppUtils } from "../utils";

const integrationsConfigurationPage = (() => {
  let bound = false;

  const MODAL_ID = "#app-modal";

  const INTEGRATIONS = {
    gmail: {
      title: "Gmail",
      description:
        "Configure the email address used by the application for notifications.",
      field: {
        name: "notifEmail",
        label: "Notification Email",
        type: "email",
        placeholder: "Enter notification email",
      },
      logo: "https://s13.gifyu.com/images/bnmHx.png",
    },
    discord: {
      title: "Discord",
      description:
        "Send application notifications and updates to a Discord channel.",
      field: {
        name: "notifDiscord",
        label: "Discord Webhook",
        type: "url",
        placeholder: "Enter Discord webhook URL",
      },
      logo: "https://s13.gifyu.com/images/bnmHv.png",
    },
    sheets: {
      title: "Google Sheets",
      description: "Connect the application to your Google Spreadsheet.",
      field: {
        name: "spreadsheetId",
        label: "Google Spreadsheet ID",
        type: "text",
        placeholder: "Enter Google Spreadsheet ID",
      },
      logo: "https://s13.gifyu.com/images/bnmHH.png",
    },
    drive: {
      title: "Google Drive",
      description:
        "Configure the Google Drive folder used to store generated reports.",
      field: {
        name: "reportFolderId",
        label: "Report Folder ID",
        type: "text",
        placeholder: "Enter Google Drive folder ID",
      },
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

  const loadData = () => {
    google.script.run
      .withSuccessHandler(updateIntegrationStatus)
      .withFailureHandler((err) => {
        console.error("getIntegrationStatus failed:", err);

        AppUtils.showDashboardToast(
          "Failed to load integration status.",
          "error",
        );
      })
      .getIntegrationStatus();
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
      return;
    }

    Object.entries(data).forEach(([integration, config]) => {
      const statusEl = document.getElementById(
        `${integration}IntegrationStatus`,
      );
      if (!statusEl) {
        return;
      }

      const configured = Boolean(config?.configured);

      statusEl.classList.toggle("is-inactive", !configured);

      statusEl.textContent = configured
        ? `✓ Configured${config.masked ? ` — ${config.masked}` : ""}`
        : "Not configured";
    });
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
      body: buildBodyHtml(config),
      footer: buildFooterHtml(),

      onOpen($modal) {
        $modal
          .off(ns)
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          .on(`click${ns}`, ".btn-save", () => {
            const $btn = $(this);
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
    const title = escapeHtml(config.title);

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
    const description = escapeHtml(config.description);
    const fieldLabel = escapeHtml(config.field.label);
    const fieldType = config.field.type;
    const fieldName = escapeHtml(config.field.name);
    const placeholder = escapeHtml(config.field.placeholder || "");

    return `
      <div class="integration-modal-description mb-4">
        ${description}
      </div>
      <form id="integrationConfigForm">
        <div class="position-relative form-group">
          <label for="integrationConfigValue">${fieldLabel}</label>
          <input
            type="${fieldType}"
            id="integrationConfigValue"
            name="${fieldName}"
            class="form-control"
            placeholder="${placeholder}"
            autocomplete="off"
          >
          <small id="integrationConfigHelp" class="form-text text-muted">
            Leave blank to keep the current configuration.
          </small>
        </div>
      </form>
    `;
  }

  function buildFooterHtml() {
    return `
      <button type="button" class="btn btn-secondary btn-cancel">Cancel</button>
      <button type="button" class="btn btn-primary btn-save">Save Changes</button>
    `;
  }

  function loadIntegrationConfigStatus(integration, $modal) {
    const $input = $modal.find("#integrationConfigValue");
    const $help = $modal.find("#integrationConfigHelp");

    google.script.run
      .withSuccessHandler((data) => {
        if (!data?.configured) {
          $input.attr("placeholder", "Not configured");
          $help
            .removeClass("is-configured")
            .text(
              "No configuration has been saved yet. Enter a value to configure this integration.",
            );
          return;
        }

        $input.attr("placeholder", `Current: ${data.masked}`);
        $help
          .addClass("is-configured")
          .text(
            "Currently configured. Enter a new value to replace it, or leave blank to keep the current configuration.",
          );
      })
      .withFailureHandler((err) => {
        console.error("getIntegrationConfigStatus failed:", err);

        $input.attr("placeholder", "Unable to check current configuration");
        $help
          .removeClass("is-configured")
          .text("Unable to check the current configuration.");
      })
      .getIntegrationConfigStatus(integration);
  }

  function saveIntegration(integration, $modal, $btn) {
    const $input = $modal.find("#integrationConfigValue");
    const value = $input.val().trim();

    if (!value) {
      AppUtils.showDashboardToast("Please enter a value.", "error");
      return;
    }

    const loading = AppUtils.setButtonLoading($btn[0], "Saving...");

    const config = getIntegrationConfig(integration);
    const title = config?.title || "Integration";

    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast(
          `${title} configuration saved successfully!`,
          "success",
        );

        AppUtils.closeModal(MODAL_ID);

        // Assuming loadData() is in outer scope; if not, expose it or pass it in.
        if (typeof loadData === "function") {
          loadData();
        }

        loading.restore();
      })
      .withFailureHandler((err) => {
        console.error("saveIntegration failed:", err);

        AppUtils.showDashboardToast(
          err?.message || "Failed to save integration configuration.",
          "error",
        );

        loading.restore();
      })
      .saveIntegration(integration, value);
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) {
      return "";
    }

    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    init,
    destroy,
  };
})();

export { integrationsConfigurationPage };
