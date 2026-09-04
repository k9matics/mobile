"use strict";

/*
  HARNELYZER
  Lokale Speicherung und CSV-Export
*/

const Storage = (() => {
  const STORAGE_KEY =
    "harnelyzer-measurements";

  function load() {
    try {
      return JSON.parse(
        localStorage.getItem(STORAGE_KEY) ||
        "[]"
      );
    } catch (error) {
      return [];
    }
  }

  function save(measurement) {
    const measurements = load();

    measurements.push(measurement);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        measurements.slice(-20)
      )
    );
  }

  function csvValue(value) {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value
        .toFixed(4)
        .replace(".", ",");
    }

    return String(value ?? "")
      .replaceAll(";", ",")
      .replaceAll("\n", " ");
  }

  function exportCsv(rows) {
    if (!rows || !rows.length) {
      throw new Error("KEINE DATEN");
    }

    const header = [
      "timestamp",
      "accX",
      "accY",
      "accZ",
      "gyroX",
      "gyroY",
      "gyroZ",
      "totalAcceleration",
      "dynamicAcceleration",
      "roll",
      "pitch",
      "raw"
    ];

    const lines = [header.join(";")];

    rows.forEach(row => {
      lines.push(
        [
          row.timestamp,
          row.accX,
          row.accY,
          row.accZ,
          row.gyroX,
          row.gyroY,
          row.gyroZ,
          row.totalAcceleration,
          row.dynamicAcceleration,
          row.roll,
          row.pitch,
          row.raw
        ]
          .map(csvValue)
          .join(";")
      );
    });

    const blob = new Blob(
      ["\uFEFF" + lines.join("\n")],
      {
        type: "text/csv;charset=utf-8"
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download =
      `harnelyzer-${Date.now()}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return {
    save,
    load,
    exportCsv
  };
})();
