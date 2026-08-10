const NavigationModule = (() => {
  function activate(pageName) {
    $(".drawer").removeClass("drawer-open");

    $(".app-sidebar__inner li a, .dropdown-quick-actions .dropdown-item")
      .removeClass("mm-active")
      .filter(`[data-page="${pageName}"]`)
      .addClass("mm-active");
  }

  return {
    activate,
  };
})();

export { NavigationModule };