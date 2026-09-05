"use strict";

const PDFExport = (() => {
  function create(payload) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("JSPDF NICHT VERFÜGBAR");
    }

    const doc = new window.jspdf.jsPDF();
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

    doc.save("harnelyzer-report.pdf");
  }

  return { create };
})();
