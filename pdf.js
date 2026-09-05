"use strict";

const PDFExport = (() => {
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 250);
  }

  function addChartImage(doc) {
    const canvas = document.getElementById("sensorChart");
    if (!canvas) return 0;

    try {
      const imageData = canvas.toDataURL("image/png");
      doc.addImage(imageData, "PNG", 14, 118, 182, 60);
      return 66;
    } catch (error) {
      console.warn("CHART PNG FEHLER", error);
      return 0;
    }
  }

  function create(payload) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("JSPDF NICHT VERFÜGBAR");
    }

    const doc = new window.jspdf.jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4"
    });

    const meta = payload.appMeta || {};
    const latest = payload.latest || null;
    const summary = payload.summary || null;
    const samples = payload.samples || [];

    let y = 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(meta.name || "HARNELYZER", 14, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Version: ${meta.version || "-"}`, 14, y);
    y += 6;
    doc.text(`Datum: ${meta.date || "-"}`, 14, y);

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("LIVE-ZUSAMMENFASSUNG", 14, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = [
      `Samples: ${samples.length}`,
      `Gangart: ${summary ? summary.gait : "-"}`,
      `Cadence: ${summary ? summary.cadence : "-"}`,
      `Regelmässig: ${summary ? summary.regularity + "%" : "-"}`,
      `Asymmetrie: ${summary ? summary.asymmetry + "%" : "-"}`,
      `Motion: ${summary ? summary.motion + " g" : "-"}`,
      `Roll: ${summary ? summary.roll + "°" : "-"}`,
      `Pitch: ${summary ? summary.pitch + "°" : "-"}`,
      `Raw: ${latest?.raw || "-"}`
    ];

    lines.forEach(line => {
      doc.text(line, 14, y);
      y += 6;
    });

    y += addChartImage(doc);

    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("Exportiert aus HARNELYZER", 14, Math.min(y + 8, 287));

    const blob = doc.output("blob");
    downloadBlob(blob, "harnelyzer-report.pdf");
  }

  return { create };
})();
