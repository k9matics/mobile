"use strict";

const Storage = (() => {
  const STORAGE_KEY =
    "k9matics-harness-measurements";

  function load() {
    try {
      return JSON.parse(
        localStorage.getItem(STORAGE_KEY)
      ) || [];
    } catch (error) {
      console.warn(
        "Lokale K9MATICS-Daten nicht lesbar.",
        error
      );

      return [];
    }
  }

  function save(measurement) {
    const measurements = load();

    measurements.push(measurement);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(measurements)
    );
  }

  function exportCsv(rows) {
    if (!rows || !rows.length) {
      throw new Error(
        "KEINE MESSDATEN VORHANDEN"
      );
    }

    const columns = [
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
      "pitch"
    ];

    const output = [
      columns.join(";")
    ];

    rows.forEach(row => {
      output.push(
        columns
          .map(column => row[column] ?? "")
          .join(";")
      );
    });

    const blob = new Blob(
      [output.join("\n")],
      {
        type: "text/csv;charset=utf-8"
      }
    );

    const url = URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `k9matics-harness-${Date.now()}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return {
    load,
    save,
    exportCsv
  };
})();
