function getProjects() {
  const sheet = getSheetSafe("Projects");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  return data
    .filter((row) => row[0])
    .map((row) => [
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
      row[5] ? formatDateSafe(row[5], "MM/dd/yyyy") : "",
    ]);
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

function getProjectRankings() {
  try {
    const sheet = getSheetSafe("Projects");

    if (!sheet) {
      throw new Error('Sheet "Projects" not found.');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        summary: {
          total: 0,
          activeYear: 0,
          activeMonth: 0,
          newYear: 0,
        },
        topProjects: [],
        recentProjects: [],
        activity: {
          activeYear: 0,
          inactiveYear: 0,
          activeMonth: 0,
          inactiveMonth: 0,
          totalHours: 0,
          averageHours: 0,
        },
        clientSummary: [],
      };
    }

    const values = sheet
      .getRange(2, 1, lastRow - 1, 6)
      .getValues()
      .filter((row) => row[0]);

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    const projects = values.map((row) => ({
      name: String(row[0] || "").trim(),

      hours: Number(row[1]) || 0,

      activeYear:
        String(row[2] || "")
          .trim()
          .toLowerCase() === "yes",

      activeMonth:
        String(row[3] || "")
          .trim()
          .toLowerCase() === "yes",

      client: String(row[4] || "").trim(),

      startedDate: row[5] || "",
    }));

    /*
     * Summary
     *
     * Existing sheet metrics:
     * I3  = Number of Projects
     * I6  = Active Projects This Year
     * I9  = Active Projects This Month
     * I12 = New Projects This Year
     */
    const calculatedTotal = projects.length;

    const calculatedActiveYear = projects.filter(
      (project) => project.activeYear,
    ).length;

    const calculatedActiveMonth = projects.filter(
      (project) => project.activeMonth,
    ).length;

    const calculatedNewYear = projects.filter((project) => {
      return isDateInYear(project.startedDate, currentYear);
    }).length;

    const summary = {
      total:
        sheet.getRange("I3").getValue() !== ""
          ? Number(sheet.getRange("I3").getValue()) || 0
          : calculatedTotal,

      activeYear:
        sheet.getRange("I6").getValue() !== ""
          ? Number(sheet.getRange("I6").getValue()) || 0
          : calculatedActiveYear,

      activeMonth:
        sheet.getRange("I9").getValue() !== ""
          ? Number(sheet.getRange("I9").getValue()) || 0
          : calculatedActiveMonth,

      newYear:
        sheet.getRange("I12").getValue() !== ""
          ? Number(sheet.getRange("I12").getValue()) || 0
          : calculatedNewYear,
    };

    /*
     * Top projects by hours
     */
    const topProjects = [...projects]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)
      .map((project) => ({
        name: project.name,
        client: project.client,
        hours: project.hours,
      }));

    /*
     * Most recently started projects
     */
    const recentProjects = [...projects]
      .filter((project) => isValidDate(project.startedDate))
      .sort((a, b) => {
        return (
          new Date(b.startedDate).getTime() - new Date(a.startedDate).getTime()
        );
      })
      .slice(0, 10)
      .map((project) => ({
        name: project.name,
        client: project.client,
        started: formatProjectDate(project.startedDate),
      }));

    /*
     * Activity
     */
    const activeYear = calculatedActiveYear;
    const activeMonth = calculatedActiveMonth;

    const totalHours = projects.reduce(
      (total, project) => total + project.hours,
      0,
    );

    const averageHours = projects.length > 0 ? totalHours / projects.length : 0;

    const activity = {
      activeYear,
      inactiveYear: projects.length - activeYear,

      activeMonth,
      inactiveMonth: projects.length - activeMonth,

      totalHours,
      averageHours,
    };

    /*
     * Client summary
     */
    const clientMap = {};

    projects.forEach((project) => {
      const client = project.client || "Unassigned";

      if (!clientMap[client]) {
        clientMap[client] = {
          name: client,
          projects: 0,
          hours: 0,
        };
      }

      clientMap[client].projects += 1;
      clientMap[client].hours += project.hours;
    });

    const clientSummary = Object.values(clientMap)
      .sort((a, b) => {
        if (b.projects !== a.projects) {
          return b.projects - a.projects;
        }

        return b.hours - a.hours;
      })
      .slice(0, 10);

    return {
      summary,
      topProjects,
      recentProjects,
      activity,
      clientSummary,
    };
  } catch (err) {
    logResponse(`⚠️ getProjectRankings error: ${err.message}`);

    return null;
  }
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

function isDateInYear(value, year) {
  if (!isValidDate(value)) {
    return false;
  }

  return new Date(value).getFullYear() === year;
}

function formatProjectDate(value) {
  if (!isValidDate(value)) {
    return "";
  }

  return Utilities.formatDate(
    new Date(value),
    Session.getScriptTimeZone(),
    "MM/dd/yyyy",
  );
}