import { AppUtils } from "../utils";

const TableRenderer = (() => {
  const STATUS_COLUMN_INDEX = 3;
  const ACTIVITY_TABLE_TITLE = "activity today";

  function isEmptyCell(cell) {
    return (
      cell === null ||
      cell === undefined ||
      (typeof cell === "string" && cell.trim() === "")
    );
  }

  function isEmptyRow(row) {
    return Array.isArray(row) && row.every(isEmptyCell);
  }

  /**
   * Normalize a row so it always has exactly the
   * same number of cells as the table header.
   */
  function normalizeRow(row, columnCount, debug = false, rowIndex = -1) {
    const log = (...args) => debug && console.log(...args);

    if (!Array.isArray(row)) {
      log(`[Row ${rowIndex}] Invalid row:`, row);

      return Array(columnCount).fill("");
    }

    const normalized = row.slice(0, columnCount);

    while (normalized.length < columnCount) {
      normalized.push("");
    }

    if (normalized.length !== row.length) {
      log(`[Row ${rowIndex}] Normalized:`, {
        originalLength: row.length,
        columnCount,
        row: normalized,
      });
    }

    return normalized;
  }

  function renderCell(cell, colIndex, isActivityTable, debug, rowIndex) {
    const log = (...args) => debug && console.log(...args);

    log(`[Row ${rowIndex}][Col ${colIndex}] value:`, cell);

    const $td = $("<td>");

    /*
     * Status column
     */
    if (
      colIndex === STATUS_COLUMN_INDEX &&
      !isActivityTable &&
      !isEmptyCell(cell)
    ) {
      const value = String(cell || "").trim();

      if (value.toUpperCase() === "INACTIVE") {
        $td.html(`
        <span class="badge bg-danger text-center">
          INACTIVE
        </span>
      `);

        return $td;
      }

      $td.html(`
      <span class="badge bg-success text-center">
        ${AppUtils.escapeHtml(value || "ACTIVE")}
      </span>
    `);

      return $td;
    }

    /*
     * Normal cell
     */
    $td.text(isEmptyCell(cell) ? "" : String(cell));

    return $td;
  }

  function renderTableBody($tbody, data, title, debug = false) {
    const log = (...args) => debug && console.log(...args);

    if (!$tbody?.length) {
      log("[TableRenderer] tbody not found");
      return;
    }

    log("[TableRenderer] renderTableBody start", {
      title,
      rows: Array.isArray(data) ? data.length : "invalid data",
    });

    if (!Array.isArray(data)) {
      log("[TableRenderer] invalid data, aborting");
      return;
    }

    const normalizedTitle = String(title || "")
      .toLowerCase()
      .trim();

    const isActivityTable = normalizedTitle === ACTIVITY_TABLE_TITLE;

    /*
     * Get the expected number of columns
     * directly from the table header.
     */
    const $table = $tbody.closest("table");
    const columnCount = $table.find("thead tr:first th").length;

    if (!columnCount) {
      log("[TableRenderer] Unable to determine column count.");
      return;
    }

    log("[TableRenderer] Expected column count:", columnCount);

    $tbody.empty();

    let skipped = 0;
    let rendered = 0;
    let normalized = 0;

    data.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) {
        skipped++;

        log(`[Row ${rowIndex}] skipped invalid row`, row);

        return;
      }

      if (isEmptyRow(row)) {
        skipped++;

        log(`[Row ${rowIndex}] skipped empty row`, row);

        return;
      }

      /*
       * Normalize before rendering.
       */
      const normalizedRow = normalizeRow(row, columnCount, debug, rowIndex);

      if (normalizedRow.length !== row.length) {
        normalized++;
      }

      const $tr = $("<tr>");

      normalizedRow.forEach((cell, colIndex) => {
        $tr.append(
          renderCell(cell, colIndex, isActivityTable, debug, rowIndex),
        );
      });

      $tbody.append($tr);

      rendered++;
    });

    log("[TableRenderer] renderTableBody complete", {
      renderedRows: rendered,
      skippedRows: skipped,
      normalizedRows: normalized,
      columnCount,
    });
  }

  return {
    renderTableBody,
  };
})();

export { TableRenderer };
