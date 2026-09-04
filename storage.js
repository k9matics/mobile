"use strict";

/*
  CANINE GAIT HUD
  storage.js
  Version 2.2

  Speichert Messungen lokal im Browser
  und exportiert Rohdaten als CSV.
*/

const Storage = (() => {
  const STORAGE_KEY =
    "canine-gait-hud-measurements-v2";

  function load() {
    try {
      const raw = localStorage.getItem(
        STORAGE_KEY
      );

      if (!raw) {
        return [];
      }

      return JSON.parse(raw);
    } catch (error) {
      console.warn(
        "Lokale Messdaten konnten nicht geladen werden.",
        error
      );

      return [];
    }
  }

  function save(measurement) {
    try {
      const measurements = load();

      measurements.push(measurement);

      /*
        Nur die letzten 25 Messungen lokal behalten.
      */
      const recentMeasurements =
        measurements.slice(-25);

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(recentMeasurements)
      );

      return true;
    } catch (error) {
      console.warn(
        "Messung konnte nicht gespeichert werden.",
        error
      );

      return false;
    }
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function numberForCsv(value) {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value.toFixed(5).replace(".", ",");
    }

    return String(value ?? "")
      .replaceAll(";", ",")
      .replaceAll("\n", " ");
  }

  function exportCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error(
        "KEINE MESSDATEN FÜR CSV VORHANDEN"
      );
    }

    const headers = [
      "timestamp",
      "datetime",
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

    const csvLines = [];

    csvLines.push(headers.join(";"));

    rows.forEach(row => {
      const date = new Date(
        row.timestamp
      ).toLocaleString("de-DE");

      const values = [
        row.timestamp,
        date,
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
      ];

      csvLines.push(
        values
          .map(numberForCsv)
          .join(";")
      );
    });

    const csvContent =
      "\uFEFF" + csvLines.join("\n");

    const blob = new Blob(
      [csvContent],
      {
        type: "text/csv;charset=utf-8"
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `canine-gait-${Date.now()}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return {
    load,
    save,
    clear,
    exportCsv
  };
})();
