function doGet(e) {
  const requestedPage = e?.parameter?.page || "home";
  const requestedClient = e?.parameter?.client || "";
  const isGitHubEmbedded = e?.parameter?.wrapper === "github";

  Logger.log(
    "[doGet] Request: %s",
    JSON.stringify({
      parameter: e?.parameter,
      queryString: e?.queryString || "",
      requestedPage,
      requestedClient,
      isGitHubEmbedded,
    }),
  );

  const template = HtmlService.createTemplateFromFile("index");

  template.initialPage = requestedPage;
  template.initialClient = requestedClient;
  template.isGitHubEmbedded = isGitHubEmbedded;

  Logger.log(
    "[doGet] Template: %s",
    JSON.stringify({
      initialPage: template.initialPage,
      initialClient: template.initialClient,
      isGitHubEmbedded: template.isGitHubEmbedded,
    }),
  );

  return template
    .evaluate()
    .setTitle("Go Crayons GS")
    .addMetaTag(
      "viewport",
      "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no",
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resolveHtmlPath(name) {
  const attemptedPaths = [];

  for (const folder of CONFIG.HTML.PATHS) {
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
    resolveHtmlPath(name),
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
