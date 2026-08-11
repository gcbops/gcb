import { RouterModule } from "./routers.js";
import { ActionRouterModule } from "./action-router.js";
import { AppUI } from "./app-ui.js";

document.addEventListener("DOMContentLoaded", () => {
  RouterModule.init();
  ActionRouterModule.init();
  AppUI.init();
  
  RouterModule.go(RouterModule.getCurrentPage());
});
