"use strict";

/*
  HARNELYZER
  PDF-Bericht
*/

async function exportToPDF() {
  if (!window.jspdf?.jsPDF) {
    throw new Error(
      "PDF-BIBLIOTHEK NICHT GELADEN"
    );
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF(
    "p",
    "mm",
    "a4"
  );

  function valueOf(id) {
    return document
      .getElementById(id)
      ?.textContent
      .trim() || "—";
  }

  pdf.setFillColor(5, 7, 9);
  pdf.rect(0, 0, 210, 297, "F");

  pdf.setTextColor(0, 255, 204);
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");

  pdf.text(
    window.APP_META?.name || "HARNELYZER",
    14,
    18
  );

  pdf.setTextColor(201, 209, 217);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");

  const lines = [
    `Version: v${window.APP_META?.version || "—"}`,
    `Datum: ${new Date().toLocaleString("de-DE")}`,
    `Gangart: ${valueOf("kpiGait")}`,
    `Schritte/Minute: ${valueOf("kpiCadence")}`,
    `Regelmässigkeit: ${valueOf("kpiRegularity")}`,
    `Asymmetrie: ${valueOf("kpiAsymmetry")}`,
    `Bewegung: ${valueOf("motionValue")}`,
    `Neigung links/rechts: ${valueOf("rollValue")}`,
    `Neigung vorne/hinten: ${valueOf("pitchValue")}`,
    `Status: ${valueOf("analysisStatus")}`
  ];

  let y = 36;

  lines.forEach(line => {
    pdf.text(line, 14, y);
    y += 8;
  });

  const canvas =
    document.getElementById("sensorChart");

  if (canvas) {
    try {
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        14,
        125,
        182,
        72
      );
    } catch (error) {
      console.warn(error);
    }
  }

  pdf.setTextColor(139, 148, 158);
  pdf.setFontSize(8);

  pdf.text(
    "Technische Beobachtung – keine tierärztliche Diagnose.",
    14,
    215
  );

  pdf.save(
    `harnelyzer-report-${Date.now()}.pdf`
  );
}
