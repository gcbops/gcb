const Select2Module = (() => {
  const SELECT2_SELECTOR = "select.js-select2, select.js-select2-dynamic";

  const DRAWER_SELECTOR = ".drawer";

  function isAvailable() {
    return Boolean(window.jQuery && $.fn && $.fn.select2);
  }

  function isInsideDrawer($select) {
    return $select.closest(DRAWER_SELECTOR).length > 0;
  }

  function createPrioritizedMatcher() {
    return function (params, data) {
      const term = (params.term || "").trim().toLowerCase();

      if (!term) {
        return data;
      }

      const text = (data.text || "").trim().toLowerCase();

      if (!text) {
        return null;
      }

      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const startsWith = text.startsWith(term);

      const wordStartMatch = new RegExp(`\\b${escapedTerm}`).test(text);

      const contains = text.includes(term);

      if (!startsWith && !wordStartMatch && !contains) {
        return null;
      }

      return {
        ...data,
        _matchPriority: startsWith ? 0 : wordStartMatch ? 1 : 2,
      };
    };
  }

  function sortResults(results) {
    return [...results].sort((a, b) => {
      const priorityA = a._matchPriority ?? 3;
      const priorityB = b._matchPriority ?? 3;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return 0;
    });
  }

  function init(parent, options = {}) {
    if (!isAvailable()) {
      console.warn("[Select2Module] jQuery Select2 is not available.");

      return;
    }

    const $parent = parent ? $(parent) : $(document.body);

    if (!$parent.length) {
      return;
    }

    const $selects = $parent.is("select") ? $parent : $parent.find("select");

    $selects.each(function () {
      const $el = $(this);

      if (!$el.hasClass("js-select2") && !$el.hasClass("js-select2-dynamic")) {
        return;
      }

      if ($el.hasClass("select2-hidden-accessible")) {
        $el.select2("destroy");
      }

      const isMultiple = $el.is("[multiple]");

      const emptyOptionText = $el
        .find('option[value=""]')
        .first()
        .text()
        .trim();

      const selectOptions = {
        width: "100%",
        placeholder:
          $el.data("placeholder") ||
          (isMultiple
            ? "Select options"
            : emptyOptionText || "Select an option"),
        allowClear: false,
        closeOnSelect: !isMultiple,
        matcher: createPrioritizedMatcher(),
        sorter: sortResults,
        ...options,
      };

      if ($el.hasClass("js-select2-dynamic")) {
        selectOptions.tags = true;
      }

      if ($parent.is(".modal")) {
        selectOptions.dropdownParent = $parent;
      }

      $el.select2(selectOptions);
    });
  }

  function destroy(parent) {
    if (!isAvailable()) {
      return;
    }

    const $parent = parent ? $(parent) : $(document.body);

    if (!$parent.length) {
      return;
    }

    $parent.find(SELECT2_SELECTOR).each(function () {
      const $select = $(this);

      /*
       * Preserve Select2 fields inside drawers.
       */
      if (isInsideDrawer($select)) {
        return;
      }

      if ($select.hasClass("select2-hidden-accessible")) {
        $select.select2("destroy");
      }
    });
  }

  function destroyAll() {
    if (!isAvailable()) {
      return;
    }

    $(SELECT2_SELECTOR).each(function () {
      const $select = $(this);

      /*
       * Preserve Select2 fields inside drawers.
       */
      if (isInsideDrawer($select)) {
        return;
      }

      if ($select.hasClass("select2-hidden-accessible")) {
        $select.select2("destroy");
      }
    });
  }

  return {
    init,
    destroy,
    destroyAll,
  };
})();

export { Select2Module };
