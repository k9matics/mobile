"use strict";

/*
  CANINE GAIT HUD
  pdf.js
  Version 2.2

  Erstellt einen kompakten Messbericht.
*/

async function exportToPDF() {
  if (
    !window.jspdf ||
    !window.jspdf.jsPDF
  ) {
    throw new Error(
      "PDF-BIBLIOTHEK WURDE NICHT GELADEN"
    );
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF(
    "p",
    "mm",
    "a4"
  );

  function textOf(id) {
    const element =
      document.getElementById(id);

    return element
      ? element.textContent.trim()
      : "—";
  }

  const dogSizeElement =
    document.getElementById("dogSize");

  const sensorPositionElement =
    document.getElementById(
      "sensorPosition"
    );

  const dogSize =
    dogSizeElement?.selectedOptions?.[0]
      ?.textContent ||
    "—";

  const sensorPosition =
    sensorPositionElement?.selectedOptions?.[0]
      ?.textContent ||
    "—";

  const date = new Date()
    .toLocaleString("de-DE");

  pdf.setFillColor(5, 7, 9);
  pdf.rect(0, 0, 210, 297, "F");

  pdf.setTextColor(0, 255, 204);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);

  pdf.text(
    "CANINE GAIT HUD",
    14,
    18
  );

  pdf.setFontSize(8);

  pdf.text(
    "Technischer Bewegungsbericht",
    14,
    24
  );

  pdf.setDrawColor(0, 255, 204);
  pdf.line(14, 28, 196, 28);

  pdf.setTextColor(201, 209, 217);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  const reportLines = [
    `Datum: ${date}`,
    `Hundegröße: ${dogSize}`,
    `Sensorposition: ${sensorPosition}`,
    `Gangart: ${textOf("kpiGait")}`,
    `Schrittfrequenz: ${textOf("kpiCadence")} Schritte/min`,
    `Regelmäßigkeit: ${textOf("kpiRegularity")}`,
    `Asymmetrie: ${textOf("kpiAsymmetry")}`,
    `Bewegungsintensität: ${textOf("motionValue")}`,
    `Neigung links/rechts: ${textOf("rollValue")}`,
    `Neigung vorne/hinten: ${textOf("pitchValue")}`,
    `Status: ${textOf("analysisStatus")}`
  ];

  let y = 40;

  reportLines.forEach(line => {
    pdf.text(line, 14, y);
    y += 8;
  });

  const chartElement =
    document.getElementById("sensorChart");

  if (chartElement) {
    try {
      const image = chartElement.toDataURL(
        "image/png",
        1
      );

      pdf.addImage(
        image,
        "PNG",
        14,
        138,
        182,
        72
      );
    } catch (error) {
      console.warn(
        "Diagramm konnte nicht in PDF eingebettet werden.",
        error
      );
    }
  }

  pdf.setDrawColor(48, 54, 61);
  pdf.line(14, 222, 196, 222);

  pdf.setTextColor(139, 148, 158);
  pdf.setFontSize(8);

  pdf.text(
    "Hinweis: Diese Anwendung dient der technischen Beobachtung.",
    14,
    232
  );

  pdf.text(
    "Sie ersetzt keine tierärztliche Untersuchung oder Diagnose.",
    14,
    238
  );

  pdf.save(
    `canine-gait-report-${Date.now()}.pdf`
  );
}
