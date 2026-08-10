import { RouterModule } from "./routers.js";
import { ActionRouterModule } from "./action-router.js";
import { PageModules } from "./page-modules.js";

// DOMContentLoaded

document.addEventListener("DOMContentLoaded", () => {
  RouterModule.init();

  const page = RouterModule.getCurrentPage();
  RouterModule.go(page, PageModules[page] || null);

  ActionRouterModule.init();

  const sidebarEl = document.querySelector(".scrollbar-sidebar");
  if (sidebarEl) {new PerfectScrollbar(sidebarEl);}

  document
    .querySelectorAll(".scrollbar-container")
    .forEach(el => new PerfectScrollbar(el));

  setTimeout(() => {
      
      document.body.classList.add("loaded");

      document.querySelectorAll(".drawer").forEach(drawer => {
        drawer.classList.add("reg");
      });

      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.classList.remove("loading");
        appContainer.classList.add("closed-sidebar");
      }
  }, 5000);
  
});
