async function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  pdf.setFillColor(5, 7, 9);
  pdf.rect(0, 0, 210, 297, "F");

  pdf.setTextColor(0, 255, 204);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("GAIT HUD REPORT", 14, 18);

  pdf.setTextColor(201, 209, 217);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Status: ${document.getElementById("gaitBadge").textContent}`, 14, 28);
  pdf.text(`Schritt: ${document.getElementById("kpiStep").textContent}`, 14, 36);
  pdf.text(`Trab: ${document.getElementById("kpiTrab").textContent}`, 14, 42);
  pdf.text(`Galopp: ${document.getElementById("kpiGalopp").textContent}`, 14, 48);

  const canvas = document.getElementById("gaitChart");
  const img = canvas.toDataURL("image/png", 1.0);
  pdf.addImage(img, "PNG", 14, 60, 182, 70);

  const coords = document.getElementById("hudCoords").textContent;
  pdf.text(`HUD: ${coords}`, 14, 140);
  pdf.text(`Erstellt: ${new Date().toLocaleString("de-DE")}`, 14, 148);

  pdf.setDrawColor(0, 255, 204);
  pdf.line(14, 155, 196, 155);

  pdf.setTextColor(139, 148, 158);
  pdf.setFontSize(8);
  pdf.text("Exportiert aus dem Gait HUD System", 14, 164);

  pdf.save("gait-hud-report.pdf");
}