"use strict";

const PDFExport = (() => {
  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return String(value);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 300);
  }

  function drawHeader(doc, meta) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(safeText(meta.name, "HARNELYZER"), 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Version: ${safeText(meta.version)}`, 14, 26);
    doc.text(`Datum: ${safeText(meta.date)}`, 14, 32);
  }

  function drawSummary(doc, latest, summary, samples) {
    let y = 46;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("LIVE-ZUSAMMENFASSUNG", 14, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = [
      `Samples: ${samples.length}`,
      `Gangart: ${safeText(summary?.gait)}`,
      `Cadence: ${safeText(summary?.cadence)}`,
      `Regelmässig: ${summary?.regularity !== undefined ? `${summary.regularity}%` : "-"}`,
      `Asymmetrie: ${summary?.asymmetry !== undefined ? `${summary.asymmetry}%` : "-"}`,
      `Motion: ${summary?.motion !== undefined ? `${summary.motion} g` : "-"}`,
      `Roll: ${summary?.roll !== undefined ? `${summary.roll}°` : "-"}`,
      `Pitch: ${summary?.pitch !== undefined ? `${summary.pitch}°` : "-"}`,
      `Raw: ${safeText(latest?.raw)}`
    ];

    lines.forEach(line => {
      doc.text(line, 14, y);
      y += 6;
    });

    return y;
  }

  function drawChart(doc, startY) {
    const canvas = document.getElementById("sensorChart");
    if (!canvas) return startY;

    try {
      const imageData = canvas.toDataURL("image/png");
      if (!imageData || imageData === "data:,") {
        return startY;
      }

      let y = startY + 4;
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("SENSOR-CHART", 14, y);

      y += 4;
      doc.addImage(imageData, "PNG", 14, y, 182, 60);

      return y + 60;
    } catch (error) {
      console.warn("CHART PNG FEHLER", error);
      return startY;
    }
  }

  function drawFooter(doc, endY) {
    const footerY = Math.min(endY + 10, 287);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("Exportiert aus HARNELYZER", 14, footerY);
    doc.setTextColor(0, 0, 0);
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

    const meta = payload?.appMeta || {};
    const latest = payload?.latest || null;
    const summary = payload?.summary || null;
    const samples = Array.isArray(payload?.samples) ? payload.samples : [];

    drawHeader(doc, meta);
    const summaryEndY = drawSummary(doc, latest, summary, samples);
    const chartEndY = drawChart(doc, summaryEndY);
    drawFooter(doc, chartEndY);

    const blob = doc.output("blob");
    downloadBlob(blob, "harnelyzer-report.pdf");
  }

  return { create };
})();
