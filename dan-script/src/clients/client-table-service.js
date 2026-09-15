const ClientTableService = (() => {
  let filterInitialized = false;
  let dropdownGroup = null;
  let menu = null;
  let items = [];
  let toggleBtn = null;
  let filterHandler = null;

  function applyStatusFilter(tableId, selectedValue) {
    const table = document.getElementById(tableId);

    if (!table) {
      return;
    }

    const rows = table.querySelectorAll("tbody tr");
    let visibleIndex = 1;

    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");

      if (!cells.length) {
        return;
      }

      // Status is always the last column
      const statusCell = cells[cells.length - 1];
      const status = statusCell.textContent.trim();

      const shouldShow =
        selectedValue === "Show All" ||
        status.toLowerCase() === selectedValue.toLowerCase();

      row.style.display = shouldShow ? "" : "none";

      // Column 1 = row number
      if (shouldShow) {
        cells[0].textContent = visibleIndex++;
      }
    });
  }

  function resetDropdownState() {
    if (!toggleBtn || !items.length) {
      return;
    }

    toggleBtn.textContent = "Show All";

    items.forEach((item) => {
      item.classList.remove("disabled");
      item.removeAttribute("aria-disabled");
      item.removeAttribute("disabled");
    });
  }

  function initStatusFilter(dropdownId, tableId, defaultValue = "Show All") {
    if (filterInitialized) {
      return;
    }

    dropdownGroup = document.getElementById(dropdownId);

    if (!dropdownGroup) {
      return;
    }

    /*
     * Desktop dropdown label.
     */
    toggleBtn = dropdownGroup.querySelector(
      '[data-bs-toggle="dropdown"] > span',
    );

    menu = dropdownGroup.querySelector(".dropdown-menu");

    if (!toggleBtn || !menu) {
      return;
    }

    /*
     * Find status items from both desktop and mobile.
     */
    items = Array.from(
      document.querySelectorAll(".dropdown-item[data-client-status]"),
    );

    if (!items.length) {
      return;
    }

    function setSelected(value) {
      /*
       * Update desktop label.
       */
      if (toggleBtn) {
        toggleBtn.textContent = value;
      }

      /*
       * Update selected state
       * on desktop + mobile items.
       */
      items.forEach((item) => {
        const rawValue = item.dataset.clientStatus || "";

        const itemValue =
          rawValue === "all" ? "Show All" : item.textContent.trim();

        const isSelected = itemValue.toLowerCase() === value.toLowerCase();

        item.classList.toggle("disabled", isSelected);

        if (isSelected) {
          item.setAttribute("aria-disabled", "true");
        } else {
          item.removeAttribute("aria-disabled");
        }
      });

      /*
       * Apply table filter.
       */
      applyStatusFilter(tableId, value);
    }

    /*
     * Handle desktop + mobile.
     */
    filterHandler = (e) => {
      const item = e.target.closest(".dropdown-item[data-client-status]");

      if (!item) {
        return;
      }

      if (item.classList.contains("disabled")) {
        return;
      }

      /*
       * Make sure this belongs to
       * this status filter.
       */
      const belongsToDesktop = dropdownGroup.contains(item);

      const belongsToMobile = item.closest(".responsive-mobile-actions");

      if (!belongsToDesktop && !belongsToMobile) {
        return;
      }

      const rawValue = item.dataset.clientStatus || "";

      const value = rawValue === "all" ? "Show All" : item.textContent.trim();

      /*
       * Prevent Bootstrap focus /
       * aria-hidden warning.
       */
      item.blur();

      setSelected(value);

      /*
       * Close whichever dropdown
       * was used.
       */
      const dropdownMenu = item.closest(".dropdown-menu");

      if (dropdownMenu) {
        const dropdown = dropdownMenu.closest(".dropdown");

        if (dropdown) {
          const dropdownButton = dropdown.querySelector(
            '[data-bs-toggle="dropdown"]',
          );

          if (dropdownButton) {
            const instance = bootstrap.Dropdown.getInstance(dropdownButton);

            if (instance) {
              instance.hide();
            }
          }
        }
      }
    };

    /*
     * Bind globally so both
     * desktop + mobile work.
     */
    document.addEventListener("click", filterHandler);

    filterInitialized = true;

    /*
     * Apply initial state.
     */
    setSelected(defaultValue);
  }

  function destroyStatusFilter() {
    if (filterHandler) {
      document.removeEventListener("click", filterHandler);
    }

    filterHandler = null;

    resetDropdownState();

    filterInitialized = false;
    dropdownGroup = null;
    menu = null;
    items = [];
    toggleBtn = null;
  }

  function initCategoryFilter(
    dropdownId,
    tableId,
    categoryColumn = 6,
    defaultValue = "All",
  ) {
    const dropdownGroup = document.getElementById(dropdownId);

    if (!dropdownGroup) {
      return;
    }

    const tableElement = document.getElementById(tableId);

    if (!tableElement) {
      return;
    }

    const table = $(tableElement).DataTable();

    /*
     * Desktop dropdown label.
     */
    const toggleBtn = dropdownGroup.querySelector(
      '[data-bs-toggle="dropdown"] > span',
    );

    /*
     * Find category buttons from both desktop and mobile.
     *
     * Desktop items are inside dropdownGroup.
     * Mobile items may be outside dropdownGroup.
     */
    const items = Array.from(
      document.querySelectorAll(".dropdown-item[data-client-category]"),
    );

    if (!items.length) {
      return;
    }

    /*
     * Set selected category.
     */
    function setSelected(value) {
      /*
       * Update desktop dropdown label.
       */
      if (toggleBtn) {
        toggleBtn.textContent = value;
      }

      /*
       * Update selected/disabled state
       * for desktop + mobile items.
       */
      items.forEach((item) => {
        const itemValue = item.dataset.clientCategory || "";

        const selectedValue =
          itemValue === "all" ? "All" : item.textContent.trim();

        const isSelected = selectedValue.toLowerCase() === value.toLowerCase();

        item.classList.toggle("disabled", isSelected);

        if (isSelected) {
          item.setAttribute("aria-disabled", "true");
        } else {
          item.removeAttribute("aria-disabled");
        }
      });

      /*
       * Apply DataTable filter.
       */
      if (value === "All") {
        table.column(categoryColumn).search("");
      } else {
        table.column(categoryColumn).search(value, {
          exact: true,
        });
      }

      table.draw();
    }

    /*
     * Handle category selection.
     *
     * Listen on document because desktop and mobile
     * dropdowns may be separate elements.
     */
    const handler = (e) => {
      const item = e.target.closest(".dropdown-item[data-client-category]");

      if (!item) {
        return;
      }

      if (item.classList.contains("disabled")) {
        return;
      }

      /*
       * Make sure this category belongs to this filter.
       *
       * If you have multiple category filters elsewhere,
       * this prevents them from interfering.
       */
      const belongsToDesktopDropdown = dropdownGroup.contains(item);

      const belongsToMobileClientControls = item.closest(
        ".responsive-mobile-actions",
      );

      if (!belongsToDesktopDropdown && !belongsToMobileClientControls) {
        return;
      }

      const rawValue = item.dataset.clientCategory || "";

      const selectedValue =
        rawValue === "all" ? "All" : item.textContent.trim();

      /*
       * Prevent Bootstrap focus/aria-hidden warning.
       */
      item.blur();

      setSelected(selectedValue);

      /*
       * Close whichever dropdown was used.
       */
      const dropdownMenu = item.closest(".dropdown-menu");

      if (dropdownMenu) {
        const dropdown = dropdownMenu.closest(".dropdown");

        if (dropdown) {
          const dropdownButton = dropdown.querySelector(
            '[data-bs-toggle="dropdown"]',
          );

          if (dropdownButton) {
            const instance = bootstrap.Dropdown.getInstance(dropdownButton);

            if (instance) {
              instance.hide();
            }
          }
        }
      }
    };

    /*
     * Remove previous handler if this filter
     * was initialized before.
     */
    if (dropdownGroup._categoryFilterHandler) {
      document.removeEventListener(
        "click",
        dropdownGroup._categoryFilterHandler,
      );
    }

    document.addEventListener("click", handler);

    /*
     * Store handler for cleanup.
     */
    dropdownGroup._categoryFilterHandler = handler;

    /*
     * Apply initial state.
     */
    setSelected(defaultValue);
  }

  function destroyCategoryFilter(dropdownId) {
    const dropdownGroup = document.getElementById(dropdownId);

    if (!dropdownGroup) {
      return;
    }

    /*
     * Remove shared category handler.
     */
    if (dropdownGroup._categoryFilterHandler) {
      document.removeEventListener(
        "click",
        dropdownGroup._categoryFilterHandler,
      );

      dropdownGroup._categoryFilterHandler = null;
    }

    /*
     * Reset desktop label.
     */
    const toggleBtn = dropdownGroup.querySelector(
      '[data-bs-toggle="dropdown"] > span',
    );

    if (toggleBtn) {
      toggleBtn.textContent = "All";
    }

    /*
     * Reset desktop + mobile category items.
     */
    document
      .querySelectorAll(".dropdown-item[data-client-category]")
      .forEach((item) => {
        item.classList.remove("disabled");
        item.removeAttribute("aria-disabled");
      });
  }

  return {
    applyStatusFilter,
    initStatusFilter,
    destroyStatusFilter,

    initCategoryFilter,
    destroyCategoryFilter,
  };
})();

export { ClientTableService };
