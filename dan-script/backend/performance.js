function getPerformanceOverview() {
  try {
    const analyticsSheet = getSheetSafe("Other Analytics");

    if (!analyticsSheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    /*
     * Yearly performance data.
     * Headers are on row 4, data starts on row 5.
     */
    const values = analyticsSheet.getRange("A5:N").getValues();

    const yearlyData = values
      .filter((row) => row[0] !== "")
      .map((row) => [
        row[0],
        Number(row[1]) || 0,
        Number(row[2]) || 0,
        Number(row[3]) || 0,
        Number(row[4]) || 0,
        Number(row[5]) || 0,
        Number(row[6]) || 0,
        Number(row[7]) || 0,
        Number(row[8]) || 0,
        Number(row[9]) || 0,
        Number(row[10]) || 0,
        Number(row[11]) || 0,
        Number(row[12]) || 0,
        Number(row[13]) || 0,
      ]);

    /*
     * Current target inputs:
     * P1:Y2
     *
     * Calculated target metrics:
     * P4:Y5
     */
    const targetValues = analyticsSheet.getRange("P1:Y5").getValues();

    const targetHeaders = targetValues[0];
    const targetData = targetValues[1];

    const calculatedHeaders = targetValues[3];
    const calculatedData = targetValues[4];

    const getTargetValue = (header) => {
      const index = targetHeaders.indexOf(header);

      return index === -1 ? null : targetData[index];
    };

    const getCalculatedValue = (header) => {
      const index = calculatedHeaders.indexOf(header);

      return index === -1 ? null : calculatedData[index];
    };

    const toNumber = (value) => {
      if (value === "" || value === null || value === undefined) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    };

    /*
     * Task metrics.
     *
     * R8  = Tasks Completed This Month
     * V8  = Tasks Completed This Year
     */
    const tasksCompletedThisMonth = toNumber(
      analyticsSheet.getRange("R8").getValue(),
    );

    const tasksCompletedThisYear = toNumber(
      analyticsSheet.getRange("V8").getValue(),
    );

    return {
      yearlyData,

      target: {
        targetYear: toNumber(analyticsSheet.getRange("P2").getValue()),
        currentMonth: analyticsSheet.getRange("Q2").getValue(),
        monthlyTarget: toNumber(analyticsSheet.getRange("R2").getValue()),
        dailyTarget: toNumber(analyticsSheet.getRange("S2").getValue()),
        workingDays: toNumber(analyticsSheet.getRange("T2").getValue()),

        currentMonthHours: toNumber(analyticsSheet.getRange("U2").getValue()),

        ytdHours: toNumber(analyticsSheet.getRange("V2").getValue()),

        annualTarget: toNumber(analyticsSheet.getRange("W2").getValue()),

        projectedAnnualHours: toNumber(
          analyticsSheet.getRange("X2").getValue(),
        ),

        ytdTarget: toNumber(getCalculatedValue("YTD Target")),

        ytdProgress: toNumber(getCalculatedValue("YTD Progress")),

        annualProgress: toNumber(getCalculatedValue("Annual Progress")),

        projectedAnnualProgress: toNumber(
          getCalculatedValue("Projected Annual Progress"),
        ),

        tasksCompletedThisMonth,
        tasksCompletedThisYear,
      },
    };
  } catch (err) {
    throw new Error(`getPerformanceOverview failed: ${err.message}`);
  }
}

function getCurrentTargetProgress() {
  try {
    const sheet = getSheetSafe("Other Analytics");

    if (!sheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    const values = sheet.getRange("P1:Y5").getValues();

    const inputHeaders = values[0];
    const inputData = values[1];

    const calculatedHeaders = values[3];
    const calculatedData = values[4];

    const getInputValue = (header) => {
      const index = inputHeaders.indexOf(header);

      if (index === -1) {
        return null;
      }

      return inputData[index];
    };

    const getCalculatedValue = (header) => {
      const index = calculatedHeaders.indexOf(header);

      if (index === -1) {
        return null;
      }

      return calculatedData[index];
    };

    const toNumber = (value) => {
      if (value === null || value === "" || value === undefined) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    };

    const currentYear = toNumber(getInputValue("Target Year"));

    const currentMonth = getInputValue("Current Month");

    const monthlyTarget = toNumber(getInputValue("Monthly Target"));

    const dailyTarget = toNumber(getInputValue("Daily Target"));

    const workingDays = toNumber(getInputValue("Working Days"));

    const currentMonthHours = toNumber(getInputValue("Current Month Hours"));

    const ytdHours = toNumber(getInputValue("YTD Hours"));

    const annualTarget = toNumber(getInputValue("Annual Target"));

    const projectedAnnualHours = toNumber(
      getInputValue("Projected Annual Hours"),
    );

    const dailyElapsedTarget =
      dailyTarget !== null && workingDays !== null
        ? dailyTarget * workingDays
        : null;

    const dailyProgress =
      currentMonthHours !== null &&
      dailyElapsedTarget !== null &&
      dailyElapsedTarget > 0
        ? currentMonthHours / dailyElapsedTarget
        : null;

    return {
      currentYear,
      currentMonth,

      monthlyTarget,
      dailyTarget,
      workingDays,

      currentMonthHours,
      dailyElapsedTarget,
      dailyProgress,

      ytdHours,

      annualTarget,
      projectedAnnualHours,

      currentMonthTarget: toNumber(getCalculatedValue("Current Month Target")),

      monthlyProgress: toNumber(getCalculatedValue("Current Month Progress")),

      ytdTarget: toNumber(getCalculatedValue("YTD Target")),

      ytdProgress: toNumber(getCalculatedValue("YTD Progress")),

      annualProgress: toNumber(getCalculatedValue("Annual Progress")),

      projectedProgress: toNumber(
        getCalculatedValue("Projected Annual Progress"),
      ),
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function updatePerformanceTarget(type, value) {
  // requireAuthorizedUser();

  try {
    const sheet = getSheetSafe("Other Analytics");

    if (!sheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    const target = Number(value);

    if (!Number.isFinite(target) || target <= 0) {
      throw new Error("Target must be greater than 0.");
    }

    if (type === "monthly") {
      sheet.getRange("R2").setValue(target);
    } else if (type === "daily") {
      sheet.getRange("S2").setValue(target);
    } else {
      throw new Error("Invalid performance target type.");
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      type,
      value: target,
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function getProductivityOverview() {
  try {
    // requireAuthorizedUser();

    const analyticsSheet = getSheetSafe("Other Analytics");

    if (!analyticsSheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    const values = analyticsSheet.getRange("P1:X2").getValues();

    const headers = values[0];
    const data = values[1];

    const getValue = (header) => {
      const index = headers.indexOf(header);

      if (index === -1) {
        return null;
      }

      return data[index];
    };

    const toNumber = (value) => {
      if (value === null || value === "" || value === undefined) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    };

    return {
      targetYear: toNumber(getValue("Target Year")),

      currentMonth: getValue("Current Month"),

      currentMonthHours: toNumber(getValue("Current Month Hours")),

      ytdHours: toNumber(getValue("YTD Hours")),

      projectedAnnualHours: toNumber(getValue("Projected Annual Hours")),

      // Other Analytics!R8
      tasksCompletedThisMonth: toNumber(
        analyticsSheet.getRange("R8").getValue(),
      ),

      // Other Analytics!V8
      tasksCompletedThisYear: toNumber(
        analyticsSheet.getRange("V8").getValue(),
      ),
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}