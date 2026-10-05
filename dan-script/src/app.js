import { RouterModule } from "./routers.js";
import { ActionRouterModule } from "./action-router.js";
import { GcbAuthModule } from "./auth/auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const authenticated = await GcbAuthModule.init();

  if (!authenticated) {
    console.warn("[GCB Auth] Authentication required.");

    return;
  }

  RouterModule.init();

  ActionRouterModule.init();
});

