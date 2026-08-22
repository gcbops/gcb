function doGet() {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Go Crayons GS")
    .addMetaTag("viewport", "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no")
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