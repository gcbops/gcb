function doGet() {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Go Crayons GS")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function loadSubPage(name) {
  const possiblePaths = [
    name,
    "backend/" + name,
    "frontend/js/" + name,
    "frontend/css/" + name,
    "frontend/" + name,
    "frontend/old/" + name,
    "frontend/components/" + name,
  ];

  for (let path of possiblePaths) {
    try {
      return HtmlService.createHtmlOutputFromFile(path).getContent();
    } catch (e) {}
  }

  throw new Error('HTML file "' + name + '" not found in any folder.');
}

function include(filename) {
  const possiblePaths = [
    filename,
    "backend/" + filename,
    "frontend/js/" + filename,
    "frontend/css/" + filename,
    "frontend/" + filename,
    "frontend/old/" + filename,
    "frontend/components/" + filename,
  ];

  for (let path of possiblePaths) {
    try {
      return HtmlService.createHtmlOutputFromFile(path).getContent();
    } catch (e) {}
  }

  throw new Error('Include file "' + filename + '" not found in any folder.');
}

function loadHtmlFile(file) {
  const possiblePaths = [
    file,
    `backend/${file}`,
    `frontend/${file}`,
    `frontend/old/${file}`,
  ];

  for (const path of possiblePaths) {
    try {
      return HtmlService.createTemplateFromFile(path);
    } catch (err) {
      // Try next path.
    }
  }

  throw new Error(`HTML file "${file}" not found in any folder`);
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
  const config = DIALOG_STATUS_CONFIG[status];

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


















