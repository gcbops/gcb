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
      const $status = $("<span>", {
        class: String(cell),
        text: String(cell),
      });

      $td.append($status);

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

    $tbody.empty();

    let skipped = 0;
    let rendered = 0;

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

      const $tr = $("<tr>");

      row.forEach((cell, colIndex) => {
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
    });
  }

  return {
    renderTableBody,
  };
})();

export { TableRenderer };
