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

    toggleBtn = dropdownGroup.querySelector(
      '[data-bs-toggle="dropdown"] > span',
    );

    menu = dropdownGroup.querySelector(".dropdown-menu");

    if (!toggleBtn || !menu) {
      return;
    }

    items = Array.from(menu.querySelectorAll(".dropdown-item"));

    if (!items.length) {
      return;
    }

    function setSelected(value) {
      toggleBtn.textContent = value;

      items.forEach((item) => {
        const text = item.textContent.trim();
        const isSelected = text === value;

        item.classList.toggle("disabled", isSelected);

        if (isSelected) {
          item.setAttribute("aria-disabled", "true");
        } else {
          item.removeAttribute("aria-disabled");
        }
      });

      applyStatusFilter(tableId, value);
    }

    filterHandler = (e) => {
      const item = e.target.closest(".dropdown-item");

      if (!item || item.classList.contains("disabled")) {
        return;
      }

      const value = item.textContent.trim();

      // Prevent Bootstrap aria-hidden/focus warning
      item.blur();

      setSelected(value);
    };

    menu.addEventListener("click", filterHandler);

    filterInitialized = true;

    // Apply initial state
    setSelected(defaultValue);
  }

  function destroyStatusFilter() {
    if (menu && filterHandler) {
      menu.removeEventListener("click", filterHandler);
    }

    filterHandler = null;

    resetDropdownState();

    filterInitialized = false;
    dropdownGroup = null;
    menu = null;
    items = [];
    toggleBtn = null;
  }

  return {
    applyStatusFilter,
    initStatusFilter,
    destroyStatusFilter,
  };
})();

export { ClientTableService };
