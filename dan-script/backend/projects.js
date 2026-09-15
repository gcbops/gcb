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

function syncClientProjects() {
  const clientsSheet = getSheetSafe("Client Names");
  const projectsSheet = getSheetSafe("Projects");

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
      const clientSheet = getSheetSafe(clientName);

      if (!clientSheet) {
        return;
      }

      const lastClientRow = clientSheet.getLastRow();
      const rangeEnd = Math.max(51, lastClientRow);

      // T=20, U=21, V=22, W=23, X=24
      // T = Project
      // U = Total Hours
      // V = Active (This Year)
      // W = Active (This Month)
      // X = Start Date
      const data = clientSheet.getRange(`T51:X${rangeEnd}`).getValues();

      const projectMap = {};

      data.forEach(
        ([projectValue, hours, activeYear, activeMonth, startDate]) => {
          if (!projectValue) {
            return;
          }

          const projectName = String(projectValue).split(" - ")[0].trim();

          const projectHours = Number(hours) || 0;
          const projActiveYear = String(activeYear || "").trim();
          const projActiveMonth = String(activeMonth || "").trim();

          if (!projectMap[projectName]) {
            projectMap[projectName] = {
              hours: 0,
              activeYear: projActiveYear || "No",
              activeMonth: projActiveMonth || "No",
              startDate: startDate || "",
            };
          }

          projectMap[projectName].hours += projectHours;

          // If any row says Yes, keep it Yes.
          if (projActiveYear === "Yes") {
            projectMap[projectName].activeYear = "Yes";
          }

          if (projActiveMonth === "Yes") {
            projectMap[projectName].activeMonth = "Yes";
          }

          // Keep the earliest non-empty start date.
          if (startDate) {
            const currentStartDate = projectMap[projectName].startDate;

            if (!currentStartDate || startDate < currentStartDate) {
              projectMap[projectName].startDate = startDate;
            }
          }
        },
      );

      Object.entries(projectMap).forEach(([project, obj]) => {
        aggregated.push([
          project,
          obj.hours,
          obj.activeYear,
          obj.activeMonth,
          clientName,
          obj.startDate,
        ]);
      });
    } catch (err) {
      logResponse(`Skipped ${clientName}: ${err}`);
    }
  });

  // Clear existing project data.
  // Projects now uses 6 columns:
  // A = Project
  // B = Total Hours
  // C = Active (This Year)
  // D = Active (This Month)
  // E = Client
  // F = Start Date
  const maxRows = projectsSheet.getMaxRows();

  if (maxRows >= 2) {
    projectsSheet.getRange(2, 1, maxRows - 1, 6).clearContent();
  }

  // Write new project data.
  if (aggregated.length) {
    projectsSheet.getRange(2, 1, aggregated.length, 6).setValues(aggregated);
  }
}