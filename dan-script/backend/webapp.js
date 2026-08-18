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

function showDialog(
  file,
  title = "Dialog",
  height = 500,
  width = 400,
  data = {},
) {
  try {
    const html = loadHtmlFile(file);

    html.data = data;

    SpreadsheetApp.getUi().showModalDialog(
      html.evaluate().setWidth(width).setHeight(height),
      title,
    );
  } catch (err) {
    logResponse(`Failed to open dialog: ${err.message}`, "Error");
  }
}

function showDialogByStatus(
  status,
  title,
  height = 600,
  width = 900,
  customSheet,
) {
  const config = CONFIG.DIALOGS.STATUS[status];

  if (!config) {
    return logResponse("⚠️ Invalid status requested.");
  }

  const template = loadHtmlFile("DailyNotificationBoardDialog");

  Object.assign(template, {
    title: config.header,
    headerTexts: config.headers,
    status,
    sheetName: customSheet || config.sheet,
  });

  SpreadsheetApp.getUi().showModalDialog(
    template.evaluate().setWidth(width).setHeight(height),
    title,
  );
}

function showOutstandingAccounts() {
  showDialogByStatus("Outstanding Accounts", "Outstanding Accounts");
}

function showActiveClients() {
  showDialogByStatus("Active Clients", "Active Clients");
}

function showTopPaid() {
  showDialogByStatus("Top Paid", "Top Paid");
}

function showDailyActivity() {
  showDialogByStatus("Activity Today", "Activity Today", 600, 950);
}
