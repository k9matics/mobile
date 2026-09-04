"use strict";

/*
  HARNELYZER
  Hauptsteuerung
*/

const APP_VERSION =
  window.APP_META?.version || "0.0.0";

const APP_DATE =
  window.APP_META?.date || "unbekannt";

const el = {
  appName: document.getElementById("appName"),
  appVersion: document.getElementById("appVersion"),

  btnConnect: document.getElementById("btnConnect"),
  btnCalib: document.getElementById("btnCalib"),
  btnMeasure: document.getElementById("btnMeasure"),
  btnDemo: document.getElementById("btnDemo"),
  btnSave: document.getElementById("btnSave"),
  btnPdf: document.getElementById("btnPdf"),

  dogSize: document.getElementById("dogSize"),
  sensorPosition:
    document.getElementById("sensorPosition"),

  gaitBadge: document.getElementById("gaitBadge"),
  gait: document.getElementById("kpiGait"),
  cadence: document.getElementById("kpiCadence"),
  regularity:
    document.getElementById("kpiRegularity"),
  asymmetry:
    document.getElementById("kpiAsymmetry"),

  radarDot: document.getElementById("radarDot"),
  hudCoords: document.getElementById("hudCoords"),
  tiltValue: document.getElementById("tiltValue"),

  motionValue: document.getElementById("motionValue"),
  rollValue: document.getElementById("rollValue"),
  pitchValue: document.getElementById("pitchValue"),
  analysisStatus:
    document.getElementById("analysisStatus"),

  debugRaw: document.getElementById("debugRaw"),
  chartMode: document.getElementById("chartMode"),

  pullRefreshIndicator:
    document.getElementById("pullRefreshIndicator"),

  pullRefreshText:
    document.getElementById("pullRefreshText")
};

const MAX_CHART_POINTS = 60;
const MAX_ROWS = 600;
const UI_INTERVAL = 120;
const PULL_THRESHOLD = 75;

let measuring = false;
let demoRunning = false;
let connected = false;

let currentRows = [];
let latestData = null;
let lastUpdate = 0;
let updateWaiting = false;

let touchStartY = 0;
let touchCurrentY = 0;
let pulling = false;

if (el.appName) {
  el.appName.textContent =
    window.APP_META?.name || "HARNELYZER";
}

if (el.appVersion) {
  el.appVersion.textContent =
    `v${APP_VERSION} · ${APP_DATE}`;
}

const chart = new Chart(
  document.getElementById("sensorChart"),
  {
    type: "line",

    data: {
      labels: [],

      datasets: [
        {
          label: "X",
          data: [],
          borderColor: "#ffcc00",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "Y",
          data: [],
          borderColor: "#ff0055",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "Z",
          data: [],
          borderColor: "#00ffcc",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "GESAMT",
          data: [],
          borderColor: "#ffffff",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,

      plugins: {
        legend: {
          labels: {
            color: "#c9d1d9",
            boxWidth: 8,

            font: {
              family: "Share Tech Mono",
              size: 8
            }
          }
        }
      },

      scales: {
        x: {
          ticks: {
            color: "#8b949e",
            maxTicksLimit: 4
          },

          grid: {
            color: "rgba(139,148,158,0.1)"
          }
        },

        y: {
          min: -2,
          max: 2,

          ticks: {
            color: "#8b949e"
          },

          grid: {
            color: "rgba(139,148,158,0.1)"
          }
        }
      }
    }
  }
);

function status(text) {
  el.gaitBadge.textContent = text;
  el.analysisStatus.textContent = text;
}

function resetChart() {
  chart.data.labels = [];

  chart.data.datasets.forEach(dataset => {
    dataset.data = [];
  });

  chart.update("none");
}

function updateRadar(roll, pitch) {
  const x = Math.max(
    -45,
    Math.min(45, roll)
  ) * 1.2;

  const y = Math.max(
    -45,
    Math.min(45, pitch)
  ) * 0.8;

  el.radarDot.style.transform =
    `translate(${x}px, ${y}px)`;

  el.hudCoords.textContent =
    `X:${x.toFixed(0)} Y:${y.toFixed(0)}`;

  el.tiltValue.textContent =
    `TILT: ${roll.toFixed(1)}°`;
}

function addToChart(sample) {
  const time = new Date(
    sample.timestamp
  ).toLocaleTimeString(
    "de-DE",
    {
      minute: "2-digit",
      second: "2-digit"
    }
  );

  chart.data.labels.push(time);

  chart.data.datasets[0].data.push(
    sample.accX
  );

  chart.data.datasets[1].data.push(
    sample.accY
  );

  chart.data.datasets[2].data.push(
    sample.accZ
  );

  chart.data.datasets[3].data.push(
    sample.totalAcceleration
  );

  while (
    chart.data.labels.length >
    MAX_CHART_POINTS
  ) {
    chart.data.labels.shift();

    chart.data.datasets.forEach(dataset => {
      dataset.data.shift();
    });
  }

  chart.update("none");
}

function processData(data) {
  const accX = Number(data.accX) || 0;
  const accY = Number(data.accY) || 0;
  const accZ = Number(data.accZ) || 0;

  const total =
    Analysis.magnitude(accX, accY, accZ);

  const tilt =
    Analysis.calculateTilt(accX, accY, accZ);

  const sample = {
    timestamp: data.timestamp || Date.now(),
    accX,
    accY,
    accZ,

    gyroX: Number(data.gyroX) || 0,
    gyroY: Number(data.gyroY) || 0,
    gyroZ: Number(data.gyroZ) || 0,

    raw: data.raw ?? "",
    totalAcceleration: total,
    dynamicAcceleration: Math.abs(total - 1),
    roll: tilt.roll,
    pitch: tilt.pitch
  };

  const result =
    Analysis.addSample(sample);

  currentRows.push(sample);

  while (currentRows.length > MAX_ROWS) {
    currentRows.shift();
  }

  addToChart(sample);

  el.gait.textContent = result.gait;
  el.cadence.textContent =
    result.cadence.toFixed(0);

  el.regularity.textContent =
    `${result.regularity.toFixed(0)}%`;

  el.asymmetry.textContent =
    `${result.asymmetry.toFixed(0)}%`;

  el.motionValue.textContent =
    `${sample.dynamicAcceleration.toFixed(2)} g`;

  el.rollValue.textContent =
    `${sample.roll.toFixed(1)}°`;

  el.pitchValue.textContent =
    `${sample.pitch.toFixed(1)}°`;

  el.debugRaw.textContent =
    `RAW: ${sample.raw}`;

  updateRadar(
    sample.roll,
    sample.pitch
  );

  status(result.status);
}

function queueData(data) {
  latestData = data;

  const now = Date.now();
  const elapsed = now - lastUpdate;

  if (elapsed >= UI_INTERVAL) {
    lastUpdate = now;
    processData(latestData);
    return;
  }

  if (updateWaiting) {
    return;
  }

  updateWaiting = true;

  setTimeout(() => {
    updateWaiting = false;
    lastUpdate = Date.now();

    if (latestData) {
      processData(latestData);
    }
  }, UI_INTERVAL - elapsed);
}

function startMeasurement() {
  measuring = true;
  currentRows = [];

  Analysis.reset();
  resetChart();

  el.btnMeasure.textContent =
    "MESSUNG LÄUFT";

  el.btnMeasure.classList.add("active");

  status("MESSUNG AKTIV");
}

function stopMeasurement() {
  measuring = false;

  el.btnMeasure.textContent =
    "MESSUNG STARTEN";

  el.btnMeasure.classList.remove("active");

  status("MESSUNG BEENDET");
}

function demoData() {
  const t = Date.now() / 250;

  return {
    timestamp: Date.now(),
    accX: Math.sin(t * 0.7) * 0.25,
    accY: Math.cos(t * 0.8) * 0.16,
    accZ: 1 + Math.sin(t * 1.7) * 0.35,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
    raw: "DEMO"
  };
}

function runDemo() {
  if (!demoRunning) {
    return;
  }

  if (!measuring) {
    startMeasurement();
  }

  queueData(demoData());

  setTimeout(runDemo, 130);
}

async function connectSensor() {
  try {
    await Sensor.connect();

    connected = true;

    el.btnConnect.textContent =
      "VERBUNDEN";

    el.btnConnect.classList.add("connected");
  } catch (error) {
    status(`FEHLER: ${error.message}`);
  }
}

async function disconnectSensor() {
  await Sensor.disconnect();

  connected = false;

  el.btnConnect.textContent = "SENSOR";
  el.btnConnect.classList.remove("connected");
}

function saveCsv() {
  try {
    Storage.save({
      timestamp: Date.now(),
      rows: currentRows
    });

    Storage.exportCsv(currentRows);

    status("CSV GESPEICHERT");
  } catch (error) {
    status(`CSV FEHLER: ${error.message}`);
  }
}

async function savePdf() {
  try {
    await exportToPDF();
    status("PDF GESPEICHERT");
  } catch (error) {
    status(`PDF FEHLER: ${error.message}`);
  }
}

function calibrate() {
  if (!currentRows.length) {
    status("ZUERST MESSEN");
    return;
  }

  Analysis.setReference();

  el.btnCalib.textContent = "CALIB OK";
  el.btnCalib.classList.add("ready");

  status("REFERENZ GESPEICHERT");
}

function resetPull() {
  el.pullRefreshIndicator.style.transform =
    "translateY(0)";

  el.pullRefreshIndicator.classList.remove(
    "ready"
  );

  el.pullRefreshText.textContent =
    "ZUM AKTUALISIEREN ZIEHEN";
}

document.addEventListener(
  "touchstart",
  event => {
    if (
      window.scrollY > 0 ||
      !event.touches.length
    ) {
      return;
    }

    touchStartY = event.touches[0].clientY;
    touchCurrentY = touchStartY;
    pulling = true;
  },
  {
    passive: true
  }
);

document.addEventListener(
  "touchmove",
  event => {
    if (!pulling || !event.touches.length) {
      return;
    }

    touchCurrentY = event.touches[0].clientY;

    const distance =
      touchCurrentY - touchStartY;

    if (distance <= 0) {
      resetPull();
      return;
    }

    if (distance > 8) {
      event.preventDefault();
    }

    el.pullRefreshIndicator.style.transform =
      `translateY(${Math.min(distance * 0.65, 90)}px)`;

    if (distance >= PULL_THRESHOLD) {
      el.pullRefreshIndicator.classList.add(
        "ready"
      );

      el.pullRefreshText.textContent =
        "LOS LASSEN ZUM AKTUALISIEREN";
    }
  },
  {
    passive: false
  }
);

document.addEventListener(
  "touchend",
  () => {
    if (!pulling) {
      return;
    }

    const distance =
      touchCurrentY - touchStartY;

    pulling = false;

    if (distance >= PULL_THRESHOLD) {
      el.pullRefreshText.textContent =
        "AKTUALISIERE...";

      setTimeout(() => {
        window.location.reload();
      }, 200);

      return;
    }

    resetPull();
  },
  {
    passive: true
  }
);

el.btnConnect.addEventListener(
  "click",
  async () => {
    if (connected) {
      await disconnectSensor();
    } else {
      await connectSensor();
    }
  }
);

el.btnMeasure.addEventListener(
  "click",
  () => {
    if (measuring) {
      stopMeasurement();
    } else {
      startMeasurement();
    }
  }
);

el.btnDemo.addEventListener(
  "click",
  () => {
    demoRunning = !demoRunning;

    el.btnDemo.classList.toggle(
      "active",
      demoRunning
    );

    el.btnDemo.textContent = demoRunning
      ? "DEMO STOP"
      : "DEMO";

    if (demoRunning) {
      runDemo();
    }
  }
);

el.btnCalib.addEventListener(
  "click",
  calibrate
);

el.btnSave.addEventListener(
  "click",
  saveCsv
);

el.btnPdf.addEventListener(
  "click",
  savePdf
);

Sensor.on(
  "status",
  text => {
    status(text);

    if (text.includes("GETRENNT")) {
      connected = false;

      el.btnConnect.textContent = "SENSOR";

      el.btnConnect.classList.remove(
        "connected"
      );
    }
  }
);

Sensor.on(
  "error",
  text => {
    status(text);
  }
);

Sensor.on(
  "data",
  data => {
    if (!measuring) {
      el.debugRaw.textContent =
        `RAW: ${data.raw}`;

      return;
    }

    queueData(data);
  }
);

status(
  `BEREIT · v${APP_VERSION} · ${APP_DATE}`
);
