const TableFilterService = (() => {
  const filters = new Map();

  function init(
    dropdownId,
    tableId,
    columnIndex,
    dataAttribute,
    defaultValue = "all",
  ) {
    const dropdownGroup = document.getElementById(dropdownId);

    const tableElement = document.getElementById(tableId);

    if (!dropdownGroup || !tableElement) {
      return;
    }

    const toggleBtn = dropdownGroup.querySelector(
      '[data-bs-toggle="dropdown"] > span',
    );

    const items = Array.from(
      document.querySelectorAll(`.dropdown-item[data-${dataAttribute}]`),
    );

    if (!items.length) {
      return;
    }

    const table = $(tableElement).DataTable();

    const setSelected = (value) => {
      if (toggleBtn) {
        const selectedItem = items.find(
          (item) =>
            (item.dataset[toDatasetKey(dataAttribute)] || "").toLowerCase() ===
            value.toLowerCase(),
        );

        toggleBtn.textContent = selectedItem?.textContent.trim() || value;
      }

      items.forEach((item) => {
        const rawValue = item.dataset[toDatasetKey(dataAttribute)] || "";

        const isSelected = rawValue.toLowerCase() === value.toLowerCase();

        item.classList.toggle("disabled", isSelected);

        if (isSelected) {
          item.setAttribute("aria-disabled", "true");
        } else {
          item.removeAttribute("aria-disabled");
        }
      });

      if (value.toLowerCase() === "all") {
        table.column(columnIndex).search("");
      } else {
        table.column(columnIndex).search(value, false, false);
      }

      table.draw();
    };

    const handler = (e) => {
      const item = e.target.closest(`.dropdown-item[data-${dataAttribute}]`);

      if (!item) {
        return;
      }

      if (item.classList.contains("disabled")) {
        return;
      }

      item.blur();

      const rawValue = item.dataset[toDatasetKey(dataAttribute)] || "";

      setSelected(rawValue || "all");

      const dropdownMenu = item.closest(".dropdown-menu");

      if (dropdownMenu) {
        const dropdown = dropdownMenu.closest(".dropdown");

        const button = dropdown?.querySelector('[data-bs-toggle="dropdown"]');

        if (button) {
          bootstrap.Dropdown.getInstance(button)?.hide();
        }
      }
    };

    const previous = filters.get(dropdownId);

    if (previous) {
      document.removeEventListener("click", previous.handler);
    }

    document.addEventListener("click", handler);

    filters.set(dropdownId, {
      handler,
      setSelected,
    });

    setSelected(defaultValue);
  }

  function destroy(dropdownId) {
    const filter = filters.get(dropdownId);

    if (!filter) {
      return;
    }

    document.removeEventListener("click", filter.handler);

    filters.delete(dropdownId);
  }

  function toDatasetKey(attribute) {
    return attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  return {
    init,
    destroy,
  };
})();

export { TableFilterService };
