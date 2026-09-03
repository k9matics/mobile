const btnCalib = document.getElementById("btnCalib");
const btnCam = document.getElementById("btnCam");
const btnMeasure = document.getElementById("btnMeasure");
const btnSave = document.getElementById("btnSave");
const btnPdf = document.getElementById("btnPdf");
const camFeed = document.getElementById("camFeed");
const radarDot = document.getElementById("radar-dot");
const hudCoords = document.getElementById("hudCoords");
const debugRaw = document.getElementById("debugRaw");
const gaitBadge = document.getElementById("gaitBadge");
const kpiStep = document.getElementById("kpiStep");
const kpiTrab = document.getElementById("kpiTrab");
const kpiGalopp = document.getElementById("kpiGalopp");
const gaitDistribution = document.getElementById("gaitDistribution");
const segSchritt = document.getElementById("segSchritt");
const segTrab = document.getElementById("segTrab");
const segGalopp = document.getElementById("segGalopp");
const segRuhe = document.getElementById("segRuhe");

let measuring = false;
let camOn = false;
let calibOn = false;
let stepCount = 0;
let trabCount = 0;
let galoppCount = 0;

const ctx = document.getElementById("gaitChart").getContext("2d");
const gaitChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Gait",
      data: [],
      borderColor: "#00ffcc",
      backgroundColor: "rgba(0,255,204,0.15)",
      tension: 0.35,
      pointRadius: 0,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { display: false },
      y: {
        display: false,
        suggestedMin: 0,
        suggestedMax: 100
      }
    }
  }
});

function setStatus(text) {
  gaitBadge.textContent = text;
  debugRaw.textContent = text;
}

function updateCounts() {
  kpiStep.textContent = stepCount;
  kpiTrab.textContent = trabCount;
  kpiGalopp.textContent = galoppCount;
}

function randomGaitValue() {
  return Math.floor(Math.random() * 100);
}

function addChartPoint(value) {
  const labels = gaitChart.data.labels;
  const data = gaitChart.data.datasets[0].data;
  labels.push("");
  data.push(value);
  if (labels.length > 30) {
    labels.shift();
    data.shift();
  }
  gaitChart.update();
}

function updateRadar(x, y) {
  radarDot.style.transform = `translate(${x}px, ${y}px)`;
  hudCoords.textContent = `X:${Math.round(x)} Y:${Math.round(y)}`;
}

btnCalib.addEventListener("click", () => {
  calibOn = !calibOn;
  btnCalib.textContent = calibOn ? "CALIB ON" : "CALIB";
  setStatus(calibOn ? "CALIBRATION" : "READY");
});

btnCam.addEventListener("click", async () => {
  camOn = !camOn;
  if (camOn) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camFeed.srcObject = stream;
      camFeed.style.display = "block";
      btnCam.textContent = "CAM ON";
      setStatus("CAM ACTIVE");
    } catch (err) {
      camOn = false;
      btnCam.textContent = "CAM";
      setStatus("CAM ERROR");
    }
  } else {
    const stream = camFeed.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    camFeed.srcObject = null;
    camFeed.style.display = "none";
    btnCam.textContent = "CAM";
    setStatus("READY");
  }
});

btnMeasure.addEventListener("click", () => {
  measuring = !measuring;
  btnMeasure.classList.toggle("active", measuring);
  btnMeasure.classList.toggle("review", !measuring && stepCount > 0);
  btnMeasure.textContent = measuring ? "MESSUNG" : "MESSEN";
  gaitDistribution.classList.toggle("show", !measuring && stepCount > 0);
  setStatus(measuring ? "MEASURING" : "READY");
});

btnSave.addEventListener("click", () => {
  btnSave.classList.add("ready");
  setTimeout(() => btnSave.classList.remove("ready"), 800);
  setStatus("SAVED");
});

btnPdf.addEventListener("click", () => {
  btnPdf.classList.add("pdf-ready");
  setTimeout(() => btnPdf.classList.remove("pdf-ready"), 800);
  setStatus("PDF READY");
});

setInterval(() => {
  if (!measuring) return;

  const value = randomGaitValue();
  addChartPoint(value);
  updateRadar((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);

  stepCount += Math.random() > 0.5 ? 1 : 0;
  trabCount += value > 35 && value <= 70 ? 1 : 0;
  galoppCount += value > 70 ? 1 : 0;

  const total = Math.max(stepCount + trabCount + galoppCount + 10, 1);
  segSchritt.style.width = `${(stepCount / total) * 100}%`;
  segTrab.style.width = `${(trabCount / total) * 100}%`;
  segGalopp.style.width = `${(galoppCount / total) * 100}%`;
  segRuhe.style.width = `${Math.max(0, 100 - ((stepCount + trabCount + galoppCount) / total) * 100)}%`;

  updateCounts();
  setStatus("MEASURING");
}, 500);

updateCounts();
setStatus("READY");