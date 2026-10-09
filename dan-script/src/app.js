import { RouterModule } from "./routers.js";
import { ActionRouterModule } from "./action-router.js";
import { GcbAuthModule } from "./auth/auth.js";
import { GcbLoginModule } from "./auth/login.js";
import { AuthorizationUIModule } from "./auth/authorization-ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  GcbLoginModule.init();

  const authenticated = await GcbAuthModule.init();

  if (!authenticated) {
    console.warn("[GCB Auth] Authentication required.");
    GcbLoginModule.show();

    return;
  }

  GcbLoginModule.hide();
  AuthorizationUIModule.applyNavigationPermissions();

  RouterModule.init();

  ActionRouterModule.init();
});
