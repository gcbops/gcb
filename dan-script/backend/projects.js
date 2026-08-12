function getProjects() {
  const sheet = getSheetSafe("Projects");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, 3).getValues();
}

function getTopProjects() {
  const sheet = getSheetSafe("Projects");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  return data.filter((row) => row[0] && row[1]);
}

function pullClientProjects() {
  const ss = getActiveSpreadsheet();

  const clientsSheet = ss.getSheetByName("Client Names");
  const projectsSheet = ss.getSheetByName("Projects");

  if (!clientsSheet || !projectsSheet) {
    return;
  }

  const lastRow = clientsSheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const clientNames = clientsSheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .flat()
    .filter(isNonEmptyString);

  const aggregated = [];

  clientNames.forEach((clientName) => {
    try {
      const clientSheet = ss.getSheetByName(clientName);

      if (!clientSheet) {
        return;
      }

      const lastClientRow = clientSheet.getLastRow();
      const rangeEnd = Math.max(41, lastClientRow);

      const data = clientSheet.getRange(`B41:C${rangeEnd}`).getValues();

      const projectMap = {};

      data.forEach(([projectValue, hours]) => {
        if (!projectValue) {
          return;
        }

        const projectName = String(projectValue).split(" - ")[0].trim();

        const projectHours = Number(hours) || 0;

        projectMap[projectName] = (projectMap[projectName] || 0) + projectHours;
      });

      Object.entries(projectMap).forEach(([project, hours]) => {
        aggregated.push([project, hours, clientName]);
      });
    } catch (err) {
      logResponse(`Skipped ${clientName}: ${err}`);
    }
  });

  // Clear existing project data.
  const maxRows = projectsSheet.getMaxRows();

  if (maxRows >= 2) {
    projectsSheet.getRange(2, 1, maxRows - 1, 3).clearContent();
  }

  // Write new project data.
  if (aggregated.length) {
    projectsSheet.getRange(2, 1, aggregated.length, 3).setValues(aggregated);
  }
}