import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { AuthorizationUIModule } from "../auth/authorization-ui.js";
import { RouterModule } from "../routers.js";
import { TableModule } from "../tables/tables.js";
import { AppUtils } from "../utils/utils.js";

const ProfilePopoverModule = (() => {
  let popover = null;

  let showTimer = null;
  let hideTimer = null;

  let clientData = new Map();
  let profileBuilder = null;

  let activeTrigger = null;

  const SHOW_DELAY = 180;
  const HIDE_DELAY = 180;

  function init() {
    if (document.documentElement.dataset.profilePopoverInitialized) {
      return;
    }

    document.documentElement.dataset.profilePopoverInitialized = "true";

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleActionClick);
  }

  function handleActionClick(event) {
    const profileButton = event.target.closest("[data-profile-action]");

    if (profileButton) {
      handleProfileAction(profileButton);
      return;
    }

    const button = event.target.closest("[data-profile-client-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.profileClientAction;
    const clientName = button.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    if (action === "add-hours") {
      openAddHours(clientName);
      return;
    }

    if (action === "open-sheet") {
      openClientSheet(clientName);
    }

    if (action === "view-asana") {
      const taskUrl = button.dataset.asanaUrl;

      if (!taskUrl) {
        AppUtils.showDashboardToast("Asana task URL not found.", "warning");
        return;
      }

      openAsanaModal(taskUrl);
      hide();
      return;
    }
  }

  function handleProfileAction(button) {
    const clientName = button.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    openClientDetails(clientName);
  }

  function openClientDetails(clientName) {
    sessionStorage.setItem("clientDetailsName", clientName);

    const container = document.getElementById("app-main-inner-container");

    if (container) {
      container.classList.add("opacity-0");
    }

    hide();

    RouterModule.go("clientDetails", true, {
      client: clientName,
    });
  }

  function openAddHours(clientName) {
    hide();

    const $taskForm = $("#taskForm");
    const $drawer = $taskForm.parents(".drawer-content");
    const $firstGroup = $taskForm.find(".form-group").first();
    if (!$drawer.hasClass("drawer-grid-5")) {
      $drawer.addClass("drawer-grid-5").removeClass("drawer-grid-4");
      $firstGroup.removeClass("element-hidden");
    }

    TableModule.addClientHours(clientName);
  }

  async function openClientSheet(clientName) {
    const client = getClientData(clientName);

    const externalUrl = String(client?.externalUrl || "").trim();

    if (externalUrl) {
      AppUtils.showDashboardToast(
        "Redirecting to external client sheet!",
        "info",
      );

      window.open(externalUrl, "_blank");

      return;
    }

    AppUtils.showDashboardToast("Redirecting to sheet!", "info");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "goToPresentClient",
        args: [sessionId, signature, clientName],

        onSuccess: (url) => {
          const clientUrl = String(url || "").trim();

          if (clientUrl.startsWith("http")) {
            window.open(clientUrl, "_blank");
            return;
          }

          AppUtils.showError(url);
        },

        onError: (error) => {
          console.error("[ProfilePopover] Failed to open client sheet:", error);

          AppUtils.showError(error?.message || error);
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Unable to redirect to sheet.");
    }
  }

  function openAsanaModal(url) {
    if (!url) {return;}

    let parsedUrl;

    try {
      parsedUrl = new URL(url);

      if (
        parsedUrl.protocol !== "https:" ||
        !(
          parsedUrl.hostname === "asana.com" ||
          parsedUrl.hostname.endsWith(".asana.com")
        )
      ) {
        AppUtils.showError("Invalid Asana link.");
        return;
      }
    } catch (error) {
      AppUtils.showError("Invalid Asana link.", error);
      return;
    }

    const ns = ".profilePopoverAsana";

    AppUtils.openModal("#app-modal", {
      size: "lg",
      placement: "center",

      header: `
        <div class="d-flex align-items-center gap-2">
          <i class="pe-7s-comment"></i>
          <strong>Asana Conversation</strong>
          <span class="badge bg-light text-dark ms-1">
            Last 7 days
          </span>
        </div>
      `,

      body: `
        <div class="asana-comments-container">
          <div class="asana-comments-loading text-center py-5">
            <div class="bar-loader">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div class="small text-muted mt-3">
              Fetching recent comments and replies...
            </div>
          </div>
        </div>
      `,

      footer: `
        <div class="d-flex gap-2 w-100">
          <button
            type="button"
            class="btn btn-secondary btn-close-asana"
          >
            Close
          </button>

          <a
            href="${AppUtils.escapeHtml(parsedUrl.href)}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-gc flex-grow-1"
          >
            <i class="pe-7s-share me-1"></i>
            Open in Asana
          </a>
        </div>
      `,

      onOpen($modal) {
        $modal.off(ns);

        $modal.on(`click${ns}`, ".btn-close-asana", () => {
          AppUtils.closeModal("#app-modal");
        });

        $modal.on(`click${ns}`, "[data-asana-day-toggle]", function () {
          const $button = $(this);
          const target = $button.attr("data-asana-day-toggle");
          const $content = $modal.find(`[data-asana-day-content="${target}"]`);

          const isExpanded = $button.attr("aria-expanded") === "true";

          $button.attr("aria-expanded", String(!isExpanded));
          $content.stop(true, true).slideToggle(180);
          $button
            .find(".asana-day-chevron")
            .toggleClass("is-expanded", !isExpanded);
        });

        loadAsanaComments(parsedUrl.href, $modal);
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  async function loadAsanaComments(url, $modal) {
    const $container = $modal.find(".asana-comments-container");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getAsanaTaskComments",
        args: [sessionId, signature, url],

        onSuccess: (response) => {
          if (!$modal.is(":visible")) {return;}

          if (!response?.success) {
            renderAsanaCommentError(
              $container,
              "Unable to load Asana comments.",
            );
            return;
          }

          renderAsanaCommentTimeline($container, response);
        },

        onError: (error) => {
          if (handleInvalidSessionError(error)) {return;}

          console.error(
            "[ProfilePopover] Failed to load Asana comments:",
            error,
          );

          renderAsanaCommentError(
            $container,
            error?.message || "Unable to load Asana comments.",
          );
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {return;}

      renderAsanaCommentError(
        $container,
        error?.message || "Unable to load Asana comments.",
      );
    }
  }
  
  function renderAsanaCommentMessage(comment) {
    const htmlText = String(comment?.htmlText || "").trim();
    const plainText = String(comment?.text || "");

    const allowedTags = new Set([
      "P",
      "BR",
      "STRONG",
      "B",
      "EM",
      "I",
      "U",
      "S",
      "UL",
      "OL",
      "LI",
      "BLOCKQUOTE",
      "CODE",
      "PRE",
      "A",
    ]);

    const escape = (value) => AppUtils.escapeHtml(String(value || ""));

    const renderNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escape(node.textContent);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const tag = node.tagName;
      const children = Array.from(node.childNodes).map(renderNode).join("");

      if (!allowedTags.has(tag)) {
        return children;
      }

      if (tag === "BR") {
        return "<br>";
      }

      if (tag === "A") {
        const href = String(node.getAttribute("href") || "").trim();

        try {
          const parsedUrl = new URL(href);

          if (!["https:", "http:", "mailto:"].includes(parsedUrl.protocol)) {
            return children;
          }

          return `<a href="${escape(parsedUrl.href)}" target="_blank" rel="noopener noreferrer">${children}</a>`;
        } catch (error) {
          console.error(error);
          return children;
        }
      }

      return `<${tag.toLowerCase()}>${children}</${tag.toLowerCase()}>`;
    };

    // Prefer Asana's formatted HTML.
    if (htmlText) {
      const parser = new DOMParser();
      const parsedDocument = parser.parseFromString(htmlText, "text/html");

      const hasStructuredFormatting = parsedDocument.body.querySelector(
        "p, div, ul, ol, li, blockquote, pre",
      );

      const safeHtml = Array.from(parsedDocument.body.childNodes)
        .map(renderNode)
        .join("");

      // Preserve existing structured formatting.
      if (hasStructuredFormatting) {
        return safeHtml;
      }

      // Convert plain HTML text and line breaks without splitting anchor tags.
      const lines = [];
      let currentLine = "";

      const collectLines = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const parts = (node.textContent || "").split(/\r\n?|\n/);

          parts.forEach((part, index) => {
            currentLine += escape(part);

            if (index < parts.length - 1) {
              lines.push(currentLine);
              currentLine = "";
            }
          });

          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        if (node.tagName === "BR") {
          lines.push(currentLine);
          currentLine = "";
          return;
        }

        const rendered = renderNode(node);
        currentLine += rendered;
      };

      Array.from(parsedDocument.body.childNodes).forEach(collectLines);
      lines.push(currentLine);

      return lines
        .map((line) => line.trim())
        .reduce((output, line) => {
          if (!line) {
            return output + "<br>";
          }

          return (
            output + (output && !output.endsWith("<br>") ? "<br>" : "") + line
          );
        }, "");
    }

    // Fallback: preserve plain-text comments and linkify URLs.
    const linkify = (value) => {
      const escaped = escape(value);

      return escaped.replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
        let cleanUrl = url;
        let trailing = "";

        while (/[.,!?;:)]+$/.test(cleanUrl)) {
          trailing = cleanUrl.slice(-1) + trailing;
          cleanUrl = cleanUrl.slice(0, -1);
        }

        try {
          const parsedUrl = new URL(cleanUrl);

          if (!["https:", "http:"].includes(parsedUrl.protocol)) {
            return url;
          }

          return `<a href="${escape(parsedUrl.href)}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
        } catch (error) {
          console.error(error);
          return url;
        }
      });
    };

    return plainText
      .split(/\r\n?|\n/)
      .map((line) => linkify(line))
      .join("<br>");
  }

  function renderAsanaCommentTimeline($container, response) {
    const comments = Array.isArray(response.comments) ? response.comments : [];

    if (!comments.length) {
      $container.html(`
      <div class="asana-empty-state text-center py-5">
        <div class="asana-empty-icon mb-3">
          <i class="pe-7s-chat"></i>
        </div>

        <h6 class="mb-1">No recent conversations</h6>

        <p class="text-muted small mb-0">
          No comments or replies were found in the last 7 days.
        </p>
      </div>
    `);

      return;
    }

    const taskGid = String(response.taskGid || "");
    const commentGids = new Set(
      comments.map((comment) => comment.commentGid).filter(Boolean),
    );

    const repliesByParent = {};
    const topLevelComments = [];

    comments.forEach((comment) => {
      const parentGid = comment.anchorGid;

      if (parentGid && parentGid !== taskGid && commentGids.has(parentGid)) {
        if (!repliesByParent[parentGid]) {
          repliesByParent[parentGid] = [];
        }

        repliesByParent[parentGid].push(comment);
      } else {
        // Also keeps a recent reply visible if its parent comment
        // is older than the seven-day window.
        topLevelComments.push(comment);
      }
    });

    const dateKey = (value) => {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "unknown";
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    const todayKey = dateKey(new Date());

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayKey = dateKey(yesterday);

    const groups = {};

    topLevelComments.forEach((comment) => {
      const key = dateKey(comment.createdAt);

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(comment);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    const formatDay = (key) => {
      if (key === todayKey) {return "Today";}
      if (key === yesterdayKey) {return "Yesterday";}

      if (key === "unknown") {return "Other";}

      const date = new Date(`${key}T00:00:00`);

      return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    };

    const formatTime = (value) => {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {return "";}

      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const escape = (value) => AppUtils.escapeHtml(String(value || ""));

    const renderComment = (comment, isReply = false) => {
      const replies = isReply ? [] : repliesByParent[comment.commentGid] || [];

      const sortedReplies = replies
        .slice()
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      const messageHtml = renderAsanaCommentMessage(comment);

      return `
      <div class="asana-comment ${isReply ? "is-reply" : ""}">
        <div class="asana-comment-avatar">
          ${escape((comment.author || "?").charAt(0).toUpperCase())}
        </div>

        <div class="asana-comment-content">
          <div class="asana-comment-meta">
            <strong>${escape(comment.author)}</strong>
            <span>${escape(formatTime(comment.createdAt))}</span>
          </div>

          <div class="asana-comment-message">
            ${messageHtml || '<span class="text-muted">No text available.</span>'}
          </div>

          ${
            sortedReplies.length
              ? `
                <div class="asana-replies">
                  ${sortedReplies
                    .map((reply) => renderComment(reply, true))
                    .join("")}
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;
    };

    const timelineHtml = sortedDates
      .map((key, index) => {
        const dayComments = groups[key]
          .slice()
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        const totalCount = dayComments.reduce(
          (total, comment) =>
            total + 1 + (repliesByParent[comment.commentGid] || []).length,
          0,
        );

        const expanded =
          key === todayKey ||
          (index === 0 && key !== "unknown" && !groups[todayKey]);

        const sectionId = `asana-day-${index}`;

        return `
      <section class="asana-day-group">
        <button
          type="button"
          class="asana-day-toggle"
          data-asana-day-toggle="${sectionId}"
          aria-expanded="${expanded}"
        >
          <span class="asana-day-heading">
            <i class="pe-7s-angle-right asana-day-chevron ${
              expanded ? "is-expanded" : ""
            }"></i>

            <span>${escape(formatDay(key))}</span>

            <span class="asana-day-count">${totalCount}</span>
          </span>
        </button>

        <div
          class="asana-day-content"
          data-asana-day-content="${sectionId}"
          style="${expanded ? "" : "display:none;"}"
        >
          ${dayComments.map((comment) => renderComment(comment)).join("")}
        </div>
      </section>
    `;
      })
      .join("");

    $container.html(`
    <div class="asana-conversation-summary">
      <div>
        <div class="asana-summary-title">Recent activity</div>
        <div class="asana-summary-subtitle">
          Comments and replies from the last 7 days
        </div>
      </div>

      <div class="asana-summary-count">
        <strong>${comments.length}</strong>
        <span>messages</span>
      </div>
    </div>

    <div class="asana-timeline">
      ${timelineHtml}
    </div>

    ${
      response.hasMore
        ? `
          <div class="small text-muted text-center pt-3">
            Some older results within this period may not be displayed.
          </div>
        `
        : ""
    }
  `);
  }

  function renderAsanaCommentError($container, message) {
    $container.html(`
    <div class="asana-empty-state text-center py-5">
      <div class="asana-empty-icon text-danger mb-3">
        <i class="pe-7s-attention"></i>
      </div>

      <h6 class="mb-1">Unable to load conversation</h6>

      <p class="text-muted small mb-0">
        ${AppUtils.escapeHtml(message)}
      </p>
    </div>
  `);
  }

  function setClientData(data = []) {
    clientData = new Map();

    (data || []).forEach((client) => {
      const name = String(client?.name || "").trim();

      if (!name) {
        return;
      }

      clientData.set(name.toLowerCase(), client);
    });
  }

  function getClientData(name) {
    const key = String(name || "")
      .trim()
      .toLowerCase();

    if (!key) {
      return null;
    }

    return clientData.get(key) || null;
  }

  function setProfileBuilder(builder) {
    profileBuilder = typeof builder === "function" ? builder : null;
  }

  function handleMouseOver(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (!trigger) {
      return;
    }

    if (event.relatedTarget && trigger.contains(event.relatedTarget)) {
      return;
    }

    show(trigger);
  }

  function handleMouseOut(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (
      trigger &&
      event.relatedTarget &&
      trigger.contains(event.relatedTarget)
    ) {
      return;
    }

    if (
      popover &&
      event.relatedTarget &&
      popover.contains(event.relatedTarget)
    ) {
      return;
    }

    scheduleHide();
  }

  function handleFocusIn(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (!trigger) {
      return;
    }

    show(trigger);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      hide();
    }
  }

  function toggle(trigger, options = {}) {
    if (!trigger) {
      return;
    }

    if (activeTrigger === trigger) {
      hide();
      return;
    }

    activeTrigger = trigger;
    show(trigger, options);
  }

  function show(trigger, options = {}) {
    clearTimers();

    activeTrigger = trigger;

    showTimer = setTimeout(() => {
      render(trigger, options);
    }, SHOW_DELAY);

    AuthorizationUIModule.applyActionPermissions();
  }

  function render(trigger, options = {}) {
    const clientName = trigger.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    const client = getClientData(clientName);

    if (!client && !options.name) {
      return;
    }

    const builderOptions =
      profileBuilder && (client || options.name)
        ? profileBuilder({
            ...(client || {}),
            ...options,
            name: options.name || client?.name || clientName,
          })
        : {};

    const data = {
      ...(client || {}),
      ...(builderOptions || {}),
      ...options,

      name: options.name || client?.name || clientName,

      showDetails: options.showDetails ?? false,
      profileButton: options.profileButton ?? true,
    };

    if (!popover) {
      createPopover();
    }

    popover.innerHTML = createMarkup(data);

    position(trigger);

    requestAnimationFrame(() => {
      popover.classList.add("is-visible");
    });
  }

  function createPopover() {
    popover = document.createElement("div");

    popover.className = "app-profile-popover";

    popover.addEventListener("mouseenter", clearHideTimer);

    popover.addEventListener("mouseleave", scheduleHide);

    document.body.appendChild(popover);
  }

  function createMarkup(data) {
    const initials = getInitials(data.name);

    return `
    <div class="app-profile-popover-banner bg-vicious-stance">

      <div class="app-profile-popover-banner-content">

        <div class="app-profile-popover-avatar bg-light">
          ${escapeHtml(initials)}
        </div>

        ${
          data.profileButton
            ? `
              <button
                type="button"
                class="btn btn-gc app-profile-popover-profile-btn"
                data-profile-action="profile"
                data-client-name="${escapeHtml(data.name)}"
              >
                Profile
              </button>
            `
            : ""
        }

      </div>

    </div>

    <div class="app-profile-popover-body">

      <h6 class="app-profile-popover-name">
        ${escapeHtml(data.name)}
      </h6>

      <div class="app-profile-popover-role">
        ${escapeHtml(data.role || "—")}
      </div>

      ${
        data.showDetails
          ? `
            <div class="app-profile-popover-details">

              ${createDetail("Projects", data.projects)}

              ${createDetail("Hours", formatNumber(data.hours))}

              ${createDetail("Paid", formatNumber(data.paid))}

              ${createDetail("Owed", formatNumber(data.owed))}

            </div>
          `
          : ""
      }

      ${
        data.content
          ? `
            <div class="app-profile-popover-divider"></div>

            <div class="app-profile-popover-content">
              ${data.content}
            </div>
          `
          : ""
      }

    </div>

    ${
      data.actions
        ? `
          <div class="app-profile-popover-footer">

            <div class="app-profile-popover-actions">
              ${data.actions}
            </div>

          </div>
        `
        : ""
    }
  `;
  }

  function createDetail(label, value) {
    return `
      <div>

        <div class="app-profile-popover-detail-label">
          ${escapeHtml(label)}
        </div>

        <div class="app-profile-popover-detail-value">
          ${escapeHtml(String(value ?? "—"))}
        </div>

      </div>
    `;
  }

  function position(trigger) {
    if (!popover) {
      return;
    }

    const rect = trigger.getBoundingClientRect();

    const gap = 10;
    const padding = 12;

    let left = rect.left + rect.width / 2 - popover.offsetWidth / 2;

    let top = rect.bottom + gap;

    const maxLeft = window.innerWidth - popover.offsetWidth - padding;

    left = Math.max(padding, Math.min(left, maxLeft));

    if (top + popover.offsetHeight > window.innerHeight - padding) {
      top = rect.top - popover.offsetHeight - gap;
    }

    popover.style.left = `${left}px`;

    popover.style.top = `${top}px`;
  }

  function scheduleHide() {
    clearHideTimer();

    hideTimer = setTimeout(() => {
      hide();
    }, HIDE_DELAY);
  }

  function clearHideTimer() {
    clearTimeout(hideTimer);
  }

  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }

  function hide() {
    clearTimers();

    activeTrigger = null;

    if (!popover) {
      return;
    }

    popover.classList.remove("is-visible");
  }

  function getInitials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;
  }

  return {
    init,
    toggle,
    show,
    hide,
    setClientData,
    getClientData,
    setProfileBuilder,
    openClientDetails,
    openAsanaModal,
  };
})();

export { ProfilePopoverModule };
