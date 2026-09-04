"use strict";

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

  const getText = id =>
    document.getElementById(id).textContent;

  const dogSize =
    document.getElementById("dogSize").value;

  const sensorPosition =
    document.getElementById(
      "sensorPosition"
    ).value;

  pdf.setFillColor(5, 7, 9);
  pdf.rect(0, 0, 210, 297, "F");

  pdf.setTextColor(0, 255, 204);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);

  pdf.text(
    "K9MATICS HARNESS REPORT",
    14,
    18
  );

  pdf.setTextColor(201, 209, 217);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  pdf.text(
    `Passform: ${getText("kpiFit")}`,
    14,
    32
  );

  pdf.text(
    `Stabilität: ${getText("kpiStability")}`,
    14,
    40
  );

  pdf.text(
    `Verschiebung: ${getText("kpiShift")}`,
    14,
    48
  );

  pdf.text(
    `Rotation: ${getText("kpiRotation")}`,
    14,
    56
  );

  pdf.text(
    `Analyse: ${getText("analysisStatus")}`,
    14,
    64
  );

  pdf.text(
    `Hundegröße: ${dogSize}`,
    14,
    72
  );

  pdf.text(
    `Sensorposition: ${sensorPosition}`,
    14,
    80
  );

  pdf.text(
    `Datum: ${new Date().toLocaleString("de-DE")}`,
    14,
    88
  );

  const chart =
    document.getElementById("sensorChart");

  const image =
    chart.toDataURL("image/png", 1);

  pdf.addImage(
    image,
    "PNG",
    14,
    100,
    182,
    75
  );

  pdf.setDrawColor(0, 255, 204);
  pdf.line(14, 184, 196, 184);

  pdf.setTextColor(139, 148, 158);
  pdf.setFontSize(8);

  pdf.text(
    "Technische Geschirr-Bewegungsanalyse. Kein Drucktest und keine tierärztliche Diagnose.",
    14,
    194
  );

  pdf.save(
    `k9matics-harness-${Date.now()}.pdf`
  );
}
