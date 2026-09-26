/**
 * Sync detailed billing records from all client sheets
 * into the centralized Billing Records sheet.
 *
 * Source columns on client sheets:
 * E = Type
 * F = Project
 * G = Hours Rendered
 * H = Date
 * I = Payment Status
 */
function syncBillingRecords() {
  try {
    const ss = getSpreadsheet();

    const billingSheetName = "Billing Records";
    const clientNamesSheet = getSheetSafe("Client Names");

    if (!clientNamesSheet) {
      throw new Error('Sheet "Client Names" was not found.');
    }

    let billingSheet = getSheetSafe(billingSheetName);

    if (!billingSheet) {
      billingSheet = ss.insertSheet(billingSheetName);
    }

    const headers = [
      [
        "Client",
        "Type",
        "Project",
        "Hours",
        "Date",
        "Payment Status",
        "Source Sheet",
        "Source Row",
      ],
    ];

    /*
     * Ensure the header exists.
     */
    billingSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);

    /*
     * Get canonical client sheet names.
     */
    const clientLastRow = clientNamesSheet.getLastRow();

    if (clientLastRow < 2) {
      billingSheet
        .getRange(2, billingSheet.getMaxRows() - 1, 1, 8)
        .clearContent();

      return {
        success: true,
        records: 0,
        clients: 0,
      };
    }

    const clientNames = clientNamesSheet
      .getRange(2, 1, clientLastRow - 1, 1)
      .getValues()
      .flat()
      .map((name) => String(name).trim())
      .filter(Boolean);

    /*
     * Build a sheet lookup once.
     *
     * This avoids repeatedly calling getSheetByName()
     * while processing the client list.
     */
    const sheetMap = new Map();

    ss.getSheets().forEach((sheet) => {
      sheetMap.set(sheet.getName(), sheet);
    });

    /*
     * Existing system sheets that should never be treated
     * as client sheets.
     */
    const excludedSheets =
      CONFIG?.SHEETS?.EXCLUDED instanceof Set
        ? CONFIG.SHEETS.EXCLUDED
        : new Set([
            "Client Names",
            "Projects",
            "Billing Analytics",
            "Billing Records",
            "BLANK",
          ]);

    const records = [];
    let clientsProcessed = 0;
    let clientsSkipped = 0;

    clientNames.forEach((clientName) => {
      if (excludedSheets.has(clientName) || clientName === "BLANK") {
        clientsSkipped++;
        return;
      }

      const sheet = sheetMap.get(clientName);

      if (!sheet) {
        clientsSkipped++;
        return;
      }

      const lastRow = sheet.getLastRow();

      /*
       * Client records begin at row 3.
       */
      if (lastRow < 3) {
        clientsProcessed++;
        return;
      }

      /*
       * Read E:I in one operation.
       */
      const values = sheet.getRange(3, 5, lastRow - 2, 5).getValues();

      values.forEach((row, index) => {
        const type = row[0];
        const project = row[1];
        const hours = row[2];
        const date = row[3];
        const paymentStatus = row[4];

        /*
         * Ignore completely empty records.
         */
        if (
          type === "" &&
          project === "" &&
          hours === "" &&
          date === "" &&
          paymentStatus === ""
        ) {
          return;
        }

        /*
         * Hours are required for a billing record.
         */
        if (hours === "" || hours === null) {
          return;
        }

        const numericHours = Number(hours);

        if (!Number.isFinite(numericHours)) {
          return;
        }

        records.push([
          clientName,
          String(type || ""),
          String(project || ""),
          numericHours,
          date instanceof Date ? date : date || "",
          String(paymentStatus || ""),
          clientName,
          index + 3,
        ]);
      });

      clientsProcessed++;
    });

    /*
     * Clear old records.
     */
    const maxRows = billingSheet.getMaxRows();

    if (maxRows > 1) {
      billingSheet.getRange(2, 1, maxRows - 1, 8).clearContent();
    }

    /*
     * Write the entire synchronized dataset in one operation.
     */
    if (records.length > 0) {
      billingSheet.getRange(2, 1, records.length, 8).setValues(records);

      billingSheet
        .getRange(2, 5, records.length, 1)
        .setNumberFormat("m/d/yyyy");

      billingSheet.getRange(2, 4, records.length, 1).setNumberFormat("0.##");
    }

    /*
     * Basic formatting.
     */
    billingSheet.getRange(1, 1, 1, 8).setFontWeight("bold");

    billingSheet.setFrozenRows(1);

    logResponse(
      `Billing Records synced. Records: ${records.length}, clients processed: ${clientsProcessed}, clients skipped: ${clientsSkipped}`,
    );

    return {
      success: true,
      records: records.length,
      clients: clientsProcessed,
      skipped: clientsSkipped,
    };
  } catch (err) {
    logResponse(`syncBillingRecords failed: ${err.message}`);

    throw new Error(`Failed to sync Billing Records: ${err.message}`);
  }
}

function getBillingAnalytics() {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetSafe("Billing Analytics");

    if (!sheet) {
      throw new Error('Sheet "Billing Analytics" was not found.');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

    return values
      .filter((row) => row[0] !== "")
      .map((row) => [
        row[0] instanceof Date
          ? Utilities.formatDate(
              row[0],
              ss.getSpreadsheetTimeZone(),
              "MMM yyyy",
            )
          : String(row[0]),

        Number(row[1]) || 0,
        Number(row[2]) || 0,
        Number(row[3]) || 0,
        Number(row[4]) || 0,
        Number(row[5]) || 0,
        Number(row[6]) || 0,
        Number(row[7]) || 0,
        Number(row[8]) || 0,
      ]);
  } catch (err) {
    console.error("getBillingAnalytics:", err);

    throw new Error(`getBillingAnalytics failed: ${err.message}`);
  }
}

function getBillingPaidHours() {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetSafe("Billing Records");

    if (!sheet) {
      return {
        records: [],
        summary: {
          paidHours: 0,
          paidRate: 0,
          paidRecords: 0,
          clientsPaid: 0,
          projectsPaid: 0,
        },
      };
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        records: [],
        summary: {
          paidHours: 0,
          paidRate: 0,
          paidRecords: 0,
          clientsPaid: 0,
          projectsPaid: 0,
        },
      };
    }

    /*
     * Billing Records:
     *
     * A Client
     * B Type
     * C Project
     * D Hours
     * E Date
     * F Payment Status
     * G Source Sheet
     * H Source Row
     */
    const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    let totalHours = 0;
    let paidHours = 0;

    let paidRecords = 0;

    const clientsPaid = new Set();
    const projectsPaid = new Set();

    const paidRecordsData = [];

    values.forEach((row) => {
      const client = String(row[0] || "").trim();
      const type = String(row[1] || "").trim();
      const project = String(row[2] || "").trim();

      const hours = Number(row[3]) || 0;
      const date = row[4];

      const paymentStatus = String(row[5] || "").trim();

      if (!client) {
        return;
      }

      totalHours += hours;

      /*
       * Match PAID without accidentally matching UNPAID.
       */
      const normalizedStatus = paymentStatus.toUpperCase();

      const isPaid = /(^|[^A-Z])PAID([^A-Z]|$)/.test(normalizedStatus);

      if (!isPaid) {
        return;
      }

      paidHours += hours;
      paidRecords++;

      clientsPaid.add(client);

      if (project) {
        projectsPaid.add(project);
      }

      paidRecordsData.push([
        client,
        type,
        project,
        hours,
        date instanceof Date
          ? Utilities.formatDate(
              date,
              ss.getSpreadsheetTimeZone(),
              "yyyy-MM-dd",
            )
          : "",
        paymentStatus,
        String(row[6] || ""),
        Number(row[7]) || 0,
      ]);
    });

    const paidRate = totalHours > 0 ? paidHours / totalHours : 0;

    /*
     * Newest records first.
     */
    paidRecordsData.sort((a, b) => {
      const dateA = new Date(a[4]);
      const dateB = new Date(b[4]);

      return dateB - dateA;
    });

    return {
      records: paidRecordsData,

      summary: {
        paidHours,
        paidRate,
        paidRecords,
        clientsPaid: clientsPaid.size,
        projectsPaid: projectsPaid.size,
      },
    };
  } catch (err) {
    console.error("getBillingPaidHours:", err);

    throw new Error(`getBillingPaidHours failed: ${err.message}`);
  }
}

function getBillingOwedHours() {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetSafe("Billing Records");

    const emptyResponse = {
      records: [],
      summary: {
        owedHours: 0,
        owedRate: 0,
        owedRecords: 0,
        clientsOwed: 0,
        projectsOwed: 0,
      },
    };

    if (!sheet) {
      return emptyResponse;
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return emptyResponse;
    }

    /*
     * Billing Records:
     *
     * A Client
     * B Type
     * C Project
     * D Hours
     * E Date
     * F Payment Status
     * G Source Sheet
     * H Source Row
     */
    const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    let totalHours = 0;
    let owedHours = 0;
    let owedRecords = 0;

    const clientsOwed = new Set();
    const projectsOwed = new Set();

    const owedRecordsData = [];

    values.forEach((row) => {
      const client = String(row[0] || "").trim();
      const type = String(row[1] || "").trim();
      const project = String(row[2] || "").trim();

      const hours = Number(row[3]) || 0;
      const date = row[4];

      const paymentStatus = String(row[5] || "").trim();

      if (!client) {
        return;
      }

      totalHours += hours;

      const normalizedStatus = paymentStatus.toUpperCase();

      /*
       * Match UNPAID and INVOICED independently.
       *
       * This avoids accidentally treating PAID
       * as an outstanding record.
       */
      const isUnpaid = /(^|[^A-Z])UNPAID([^A-Z]|$)/.test(normalizedStatus);

      const isInvoiced = /(^|[^A-Z])INVOICED([^A-Z]|$)/.test(normalizedStatus);

      if (!isUnpaid && !isInvoiced) {
        return;
      }

      owedHours += hours;
      owedRecords++;

      clientsOwed.add(client);

      if (project) {
        projectsOwed.add(project);
      }

      owedRecordsData.push([
        client,
        type,
        project,
        hours,
        date instanceof Date
          ? Utilities.formatDate(
              date,
              ss.getSpreadsheetTimeZone(),
              "yyyy-MM-dd",
            )
          : "",
        paymentStatus,
        String(row[6] || ""),
        Number(row[7]) || 0,
      ]);
    });

    const owedRate = totalHours > 0 ? owedHours / totalHours : 0;

    /*
     * Newest records first.
     */
    owedRecordsData.sort((a, b) => {
      const dateA = new Date(a[4]);
      const dateB = new Date(b[4]);

      return dateB - dateA;
    });

    return {
      records: owedRecordsData,

      summary: {
        owedHours,
        owedRate,
        owedRecords,
        clientsOwed: clientsOwed.size,
        projectsOwed: projectsOwed.size,
      },
    };
  } catch (err) {
    console.error("getBillingOwedHours:", err);

    throw new Error(`getBillingOwedHours failed: ${err.message}`);
  }
}

function getInvoiceStatus() {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetSafe("Billing Records");

    const emptyResponse = {
      invoicedRecords: [],
      untrackedRecords: [],

      summary: {
        invoicedHours: 0,
        invoicedRecords: 0,
        clientsInvoiced: 0,
        projectsInvoiced: 0,
        untrackedHours: 0,
        untrackedRecords: 0,
      },
    };

    if (!sheet) {
      return emptyResponse;
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return emptyResponse;
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    const timeZone = ss.getSpreadsheetTimeZone();

    let invoicedHours = 0;
    let invoicedRecords = 0;
    let untrackedHours = 0;
    let untrackedRecords = 0;

    const clientsInvoiced = new Set();
    const projectsInvoiced = new Set();

    const invoicedRecordsData = [];
    const untrackedRecordsData = [];

    values.forEach((row) => {
      const client = String(row[0] || "").trim();
      const type = String(row[1] || "").trim();
      const project = String(row[2] || "").trim();

      const hours = Number(row[3]) || 0;
      const date = row[4];

      const paymentStatus = String(row[5] || "").trim();

      if (!client) {
        return;
      }

      const normalizedStatus = paymentStatus.toUpperCase();

      const status = normalizedStatus.includes("DISPUTED")
        ? "DISPUTED"
        : normalizedStatus.includes("OUTSTANDING")
          ? "OUTSTANDING"
          : normalizedStatus.includes("UNPAID")
            ? "UNPAID"
            : normalizedStatus.includes("INVOICED")
              ? "INVOICED"
              : normalizedStatus.includes("PAID")
                ? "PAID"
                : "";

      /*
       * Keep the date machine-readable.
       * The frontend will format it for display.
       */
      const recordDate =
        date instanceof Date
          ? Utilities.formatDate(date, timeZone, "yyyy-MM-dd")
          : "";

      /*
       * No billing status yet.
       */
      if (!status) {
        untrackedHours += hours;
        untrackedRecords++;

        untrackedRecordsData.push([
          client,
          type,
          project,
          hours,
          recordDate,
          "",
          String(row[6] || ""),
          Number(row[7]) || 0,
        ]);

        return;
      }

      /*
       * Only INVOICED records belong
       * in the invoice table.
       */
      if (status !== "INVOICED") {
        return;
      }

      invoicedHours += hours;
      invoicedRecords++;

      clientsInvoiced.add(client);

      if (project) {
        projectsInvoiced.add(project);
      }

      invoicedRecordsData.push([
        client,
        type,
        project,
        hours,
        recordDate,
        "INVOICED",
        String(row[6] || ""),
        Number(row[7]) || 0,
      ]);
    });

    const sortByDate = (a, b) => {
      return String(b[4] || "").localeCompare(String(a[4] || ""));
    };

    invoicedRecordsData.sort(sortByDate);
    untrackedRecordsData.sort(sortByDate);

    return {
      invoicedRecords: invoicedRecordsData,
      untrackedRecords: untrackedRecordsData,

      summary: {
        invoicedHours,
        invoicedRecords,
        clientsInvoiced: clientsInvoiced.size,
        projectsInvoiced: projectsInvoiced.size,
        untrackedHours,
        untrackedRecords,
      },
    };
  } catch (err) {
    console.error("getInvoiceStatus:", err);

    throw new Error(`getInvoiceStatus failed: ${err.message}`);
  }
}