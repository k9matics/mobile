"use strict";

/*
  HARNELYZER — PDF Export v0.3.0

  Baut einen Testbericht aus Referenz, Geschirrtest und Vergleichsdaten.
  Wird über window.PDFExport bereitgestellt, damit app.js sie extern
  aufrufen kann (klassische <script>-Tags hängen "const" NICHT an
  window, deshalb hier bewusst direkte Zuweisung).
*/

window.PDFExport = (() => {
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

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function scoreColor(score) {
    if (score >= 70) return [0, 180, 158];
    if (score >= 55) return [200, 160, 30];
    return [190, 50, 90];
  }

  function drawHeader(doc, meta) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(safeText(meta.name, "HARNELYZER"), 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Version: ${safeText(meta.version)}`, 14, 25);
    doc.text(`Erstellt: ${new Date().toLocaleString("de-DE")}`, 14, 30);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 34, 196, 34);
  }

  function drawSessionLine(doc, label, session, y) {
    if (!session) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${label}: noch keine Messung gespeichert.`, 14, y);
      return y + 6;
    }

    const metrics = session.metrics || {};
    const durationSeconds = metrics.durationMs
      ? Math.round(metrics.durationMs / 1000)
      : 0;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${label}: ${safeText(session.label)}`, 14, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    const line = [
      `Gangart ${safeText(session.gait)}`,
      `Kadenz ${safeText(session.cadence)}/min`,
      `Dauer ${durationSeconds}s`,
      `Qualität ${safeText(session.quality?.label)} (${session.quality?.score ?? 0}%)`
    ].join("  ·  ");

    doc.text(line, 14, y + 5);
    doc.setTextColor(0, 0, 0);

    return y + 12;
  }

  function drawOverview(doc, comparison, referenceSession, harnessSession, startY) {
    let y = startY + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("MESSÜBERSICHT", 14, y);
    y += 8;

    const reference = comparison?.reference || referenceSession;
    const harness = comparison?.harness || harnessSession;

    y = drawSessionLine(doc, "REFERENZ", reference, y);
    y = drawSessionLine(doc, "GESCHIRRTEST", harness, y);

    return y + 2;
  }

  function drawScoreBar(doc, x, y, width, score) {
    const height = 4;
    const [r, g, b] = scoreColor(score);
    const filled = Math.max(0, Math.min(width, (score / 100) * width));

    doc.setFillColor(230, 230, 230);
    doc.rect(x, y, width, height, "F");

    doc.setFillColor(r, g, b);
    doc.rect(x, y, filled, height, "F");
  }

  function drawScoreTable(doc, comparison, startY) {
    let y = startY + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VERGLEICHSBEWERTUNG", 14, y);
    y += 8;

    if (!comparison || !comparison.ready) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      const advice = comparison?.summary
        || "Für einen Vergleich braucht es eine Referenz und mindestens einen Geschirrtest mit ausreichender Messqualität.";
      const wrapped = doc.splitTextToSize(advice, 182);
      doc.text(wrapped, 14, y);
      doc.setTextColor(0, 0, 0);
      return y + wrapped.length * 5 + 4;
    }

    const rows = [
      ["PASSFORM", comparison.passform],
      ["STABILITÄT", comparison.stability],
      ["LAUFBILD", comparison.movement],
      ["SYMMETRIE", comparison.symmetry]
    ];

    rows.forEach(([name, result]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(name, 14, y);

      doc.setFont("helvetica", "normal");
      doc.text(`${result.score}  ·  ${result.label}`, 55, y);

      drawScoreBar(doc, 130, y - 3.6, 52, result.score);

      y += 9;
    });

    y += 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const summary = doc.splitTextToSize(safeText(comparison.summary), 182);
    doc.text(summary, 14, y);

    return y + summary.length * 5 + 4;
  }

  function drawChart(doc, startY) {
    if (!window.Scene3D || typeof window.Scene3D.captureSnapshot !== "function") {
      return startY;
    }

    try {
      const imageData = window.Scene3D.captureSnapshot();
      if (!imageData || imageData === "data:,") {
        return startY;
      }

      let y = startY + 4;
      if (y > 210) {
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("BEWEGUNGSANSICHT (3D-PLATZHALTER)", 14, y);

      y += 4;
      doc.addImage(imageData, "PNG", 14, y, 182, 58);

      return y + 58;
    } catch (error) {
      console.warn("SCENE3D SNAPSHOT FEHLER", error);
      return startY;
    }
  }

  function drawFooter(doc, endY) {
    const footerY = Math.min(endY + 10, 287);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(
      "Exportiert aus HARNELYZER — Bewegungs- und Passformindikator, keine veterinärmedizinische Diagnose.",
      14,
      footerY
    );
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
    const comparison = payload?.comparison || null;
    const referenceSession = payload?.reference || null;
    const harnessSession = payload?.harness || null;

    drawHeader(doc, meta);
    let y = drawOverview(doc, comparison, referenceSession, harnessSession, 34);
    y = drawScoreTable(doc, comparison, y);
    y = drawChart(doc, y);
    drawFooter(doc, y);

    const blob = doc.output("blob");
    downloadBlob(blob, `harnelyzer-bericht-${dateStamp()}.pdf`);
  }

  return { create };
})();
