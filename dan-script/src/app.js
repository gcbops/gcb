import { RouterModule } from "./routers.js";
import { ActionRouterModule } from "./action-router.js";
import { GcbAuthModule } from "./auth/auth.js";
import { GcbLoginModule } from "./auth/login.js";
import { AuthorizationUIModule } from "./auth/authorization-ui.js";
import { setInvalidSessionUIHandler } from "./auth/auth-error-handler.js";
import { RequestWidget } from "./requests/request-widget.js";
import "./requests/request-handlers.js";
import { LoaderModule } from "./components/loader.js";

setInvalidSessionUIHandler(() => {
  GcbLoginModule.show();
});

document.addEventListener("DOMContentLoaded", async () => {
  LoaderModule.start("loading");

  GcbLoginModule.init();

  const authenticated = await GcbAuthModule.init();

  if (!authenticated) {
    LoaderModule.restart("login");

    GcbLoginModule.show();

    return;
  }

  GcbLoginModule.hide();
  
  AuthorizationUIModule.applyNavigationPermissions();

  RequestWidget.init();

  RouterModule.init();

  ActionRouterModule.init();
});