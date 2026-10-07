function doGet(e) {
  if (e?.parameter?.code) {
    return handleGcbOAuthCallback(e);
  }

  const requestedPage = e?.parameter?.page || "home";
  const requestedClient = e?.parameter?.client || "";
  const isGitHubEmbedded = e?.parameter?.wrapper === "github";

  const template = HtmlService.createTemplateFromFile("index");

  const authTicket = String(e?.parameter?.auth_ticket || "").trim();

  template.initialPage = requestedPage;
  template.initialClient = requestedClient;
  template.isGitHubEmbedded = isGitHubEmbedded;
  template.authTicket = authTicket;

  return template
    .evaluate()
    .setTitle("Go Crayons GS")
    .addMetaTag(
      "viewport",
      "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no",
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resolveHtmlPath(name, paths = CONFIG.HTML.PATHS) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Invalid HTML file name.");
  }

  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid HTML file path.");
  }

  const attemptedPaths = [];

  for (const folder of paths) {
    const path = `${folder}${name}`;

    attemptedPaths.push(path);

    try {
      HtmlService.createHtmlOutputFromFile(path);
      return path;
    } catch (e) {
      // Try next path.
    }
  }

  throw new Error(
    `HTML file "${name}" not found. Tried:\n${attemptedPaths.join("\n")}`,
  );
}

function loadHtmlComponent(name) {
  return HtmlService.createHtmlOutputFromFile(
    resolveHtmlPath(name, ["frontend/components/", "frontend/pages/"]),
  ).getContent();
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(
    resolveHtmlPath(name),
  ).getContent();
}

function loadHtmlFile(name) {
  return HtmlService.createTemplateFromFile(resolveHtmlPath(name));
}
