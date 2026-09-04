"use strict";

/*
  CANINE GAIT HUD
  app.js
  Version 2.3

  Stabilitäts-Update:
  - Diagramm nur ca. 10-mal pro Sekunde aktualisieren
  - maximal 60 sichtbare Diagrammpunkte
  - maximal 600 Rohdaten pro Messung
  - keine unendliche Demo-Schleife
  - Pull-to-refresh bleibt aktiv
*/

const APP_VERSION = "2.3";

const el = {
  btnConnect: document.getElementById("btnConnect"),
  btnCalib: document.getElementById("btnCalib"),
  btnMeasure: document.getElementById("btnMeasure"),
  btnDemo: document.getElementById("btnDemo"),
  btnSave: document.getElementById("btnSave"),
  btnPdf: document.getElementById("btnPdf"),

  dogSize: document.getElementById("dogSize"),
  sensorPosition: document.getElementById("sensorPosition"),
  chartMode: document.getElementById("chartMode"),

  gaitBadge: document.getElementById("gaitBadge"),
  gait: document.getElementById("kpiGait"),
  cadence: document.getElementById("kpiCadence"),
  regularity: document.getElementById("kpiRegularity"),
  asymmetry: document.getElementById("kpiAsymmetry"),

  radarDot: document.getElementById("radar-dot"),
  hudCoords: document.getElementById("hudCoords"),
  tiltValue: document.getElementById("tiltValue"),

  motionValue: document.getElementById("motionValue"),
  rollValue: document.getElementById("rollValue"),
  pitchValue: document.getElementById("pitchValue"),
  analysisStatus: document.getElementById("analysisStatus"),
  debugRaw: document.getElementById("debugRaw"),

  pullRefreshIndicator:
    document.getElementById("pullRefreshIndicator"),

  pullRefreshText:
    document.getElementById("pullRefreshText")
};

const MAX_CHART_POINTS = 60;
const MAX_SAVED_ROWS = 600;
const UI_UPDATE_INTERVAL_MS = 100;
const PULL_THRESHOLD = 75;

let measuring = false;
let demoRunning = false;
let sensorConnected = false;

let currentRows = [];
let latestSensorData = null;

let lastUiUpdateTime = 0;
let updateQueued = false;

let touchStartY = 0;
let touchCurrentY = 0;
let pulling = false;
let refreshInProgress = false;

const DOG_PROFILES = {
  toy: {
    label: "Sehr klein",
    movementFactor: 1.35
  },

  small: {
    label: "Klein",
    movementFactor: 1.15
  },

  medium: {
    label: "Mittel",
    movementFactor: 1.0
  },

  large: {
    label: "Groß",
    movementFactor: 0.85
  },

  giant: {
    label: "Sehr groß",
    movementFactor: 0.7
  }
};

const chart = new Chart(
  document.getElementById("sensorChart").getContext("2d"),
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
          borderColor: "#b3002d",
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
          tension: 0.2,
          fill: true,
          backgroundColor: "rgba(0,255,204,0.06)"
        },

        {
          label: "Gesamt",
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
      normalized: true,

      plugins: {
        legend: {
          display: true,

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
            color: "rgba(139,148,158,0.12)"
          }
        },

        y: {
          min: -2,
          max: 2,

          ticks: {
            color: "#8b949e"
          },

          grid: {
            color: "rgba(139,148,158,0.12)"
          }
        }
      }
    }
  }
);

function setStatus(text) {
  el.gaitBadge.textContent = text;
  el.debugRaw.textContent = text;
}

function updateStatusColor(text) {
  if (
    text.includes("AUFFÄLLIG") ||
    text.includes("VERÄNDERUNG") ||
    text.includes("FEHLER")
  ) {
    el.gaitBadge.style.color = "#ff0055";
    el.analysisStatus.style.color = "#ff0055";
    return;
  }

  if (
    text.includes("UNREGEL") ||
    text.includes("WENIG") ||
    text.includes("WARTEN")
  ) {
    el.gaitBadge.style.color = "#ffcc00";
    el.analysisStatus.style.color = "#ffcc00";
    return;
  }

  el.gaitBadge.style.color = "#00ffcc";
  el.analysisStatus.style.color = "#00ffcc";
}

function resetChart() {
  chart.data.labels = [];

  chart.data.datasets.forEach(dataset => {
    dataset.data = [];
  });

  chart.update("none");
}

function normalizeSensorData(data) {
  return {
    timestamp: Number(data.timestamp) || Date.now(),

    accX: Number(data.accX) || 0,
    accY: Number(data.accY) || 0,
    accZ: Number(data.accZ) || 0,

    gyroX: Number(data.gyroX) || 0,
    gyroY: Number(data.gyroY) || 0,
    gyroZ: Number(data.gyroZ) || 0,

    raw: data.raw ?? ""
  };
}

function updateRadar(roll, pitch) {
  const safeRoll = Number.isFinite(roll)
    ? roll
    : 0;

  const safePitch = Number.isFinite(pitch)
    ? pitch
    : 0;

  const x =
    Math.max(-45, Math.min(45, safeRoll)) *
    1.2;

  const y =
    Math.max(-45, Math.min(45, safePitch)) *
    0.8;

  el.radarDot.style.transform =
    `translate(${x}px, ${y}px)`;

  el.hudCoords.textContent =
    `X:${x.toFixed(0)} Y:${y.toFixed(0)}`;

  el.tiltValue.textContent =
    `TILT: ${safeRoll.toFixed(1)}°`;
}

function addPointToChart(sample) {
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

function processData(inputData) {
  const data = normalizeSensorData(inputData);

  const totalAcceleration =
    Analysis.magnitude(
      data.accX,
      data.accY,
      data.accZ
    );

  const tilt =
    Analysis.calculateTilt(
      data.accX,
      data.accY,
      data.accZ
    );

  const sample = {
    ...data,

    totalAcceleration,

    dynamicAcceleration:
      Math.abs(totalAcceleration - 1),

    roll: tilt.roll,
    pitch: tilt.pitch
  };

  const result =
    Analysis.addSample(sample);

  currentRows.push(sample);

  if (
    currentRows.length >
    MAX_SAVED_ROWS
  ) {
    currentRows.shift();
  }

  addPointToChart(sample);

  if (data.raw !== "") {
    el.debugRaw.textContent =
      `RAW: ${data.raw}`;
  } else {
    el.debugRaw.textContent =
      `X:${data.accX.toFixed(2)} ` +
      `Y:${data.accY.toFixed(2)} ` +
      `Z:${data.accZ.toFixed(2)}`;
  }

  el.gait.textContent = result.gait;

  el.cadence.textContent =
    Number.isFinite(result.cadence)
      ? result.cadence.toFixed(0)
      : "0";

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

  el.analysisStatus.textContent =
    result.status;

  updateRadar(
    sample.roll,
    sample.pitch
  );

  updateStatusColor(result.status);
}

function queueSensorUpdate(data) {
  latestSensorData = data;

  const now = Date.now();

  if (
    now - lastUiUpdateTime >=
    UI_UPDATE_INTERVAL_MS
  ) {
    lastUiUpdateTime = now;
    processData(latestSensorData);
    return;
  }

  if (updateQueued) {
    return;
  }

  updateQueued = true;

  const waitTime =
    UI_UPDATE_INTERVAL_MS -
    (now - lastUiUpdateTime);

  setTimeout(() => {
    updateQueued = false;
    lastUiUpdateTime = Date.now();

    if (latestSensorData) {
      processData(latestSensorData);
    }
  }, Math.max(waitTime, 0));
}

function startMeasurement() {
  measuring = true;
  currentRows = [];
  latestSensorData = null;

  Analysis.reset();
  resetChart();

  el.btnMeasure.classList.add("active");

  el.btnMeasure.textContent =
    "MESSUNG LÄUFT";

  setStatus("MESSUNG AKTIV");
}

function stopMeasurement() {
  measuring = false;
  latestSensorData = null;

  el.btnMeasure.classList.remove("active");

  el.btnMeasure.textContent =
    "MESSUNG STARTEN";

  setStatus("MESSUNG BEENDET");
}

function createDemoData() {
  const time = Date.now() / 200;

  const profile =
    DOG_PROFILES[el.dogSize.value] ||
    DOG_PROFILES.medium;

  const factor =
    profile.movementFactor;

  return {
    timestamp: Date.now(),

    accX:
      Math.sin(time * 0.8) *
      0.25 *
      factor,

    accY:
      Math.cos(time * 0.7) *
      0.18 *
      factor,

    accZ:
      1 +
      Math.sin(time * 1.8) *
      0.45 *
      factor,

    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,

    raw: "DEMO"
  };
}

function demoLoop() {
  if (!demoRunning) {
    return;
  }

  if (!measuring) {
    startMeasurement();
  }

  queueSensorUpdate(createDemoData());

  setTimeout(demoLoop, 120);
}

async function connectSensor() {
  try {
    setStatus("GERÄT AUSWÄHLEN");

    await Sensor.connect();

    sensorConnected = true;

    el.btnConnect.textContent =
      "VERBUNDEN";

    el.btnConnect.classList.add("ready");

    setStatus("SENSOR VERBUNDEN");
  } catch (error) {
    sensorConnected = false;

    el.btnConnect.textContent =
      "SENSOR";

    el.btnConnect.classList.remove("ready");

    setStatus(
      `FEHLER: ${error.message}`
    );
  }
}

async function disconnectSensor() {
  try {
    await Sensor.disconnect();
  } catch (error) {
    console.warn(error);
  }

  sensorConnected = false;

  el.btnConnect.textContent = "SENSOR";

  el.btnConnect.classList.remove("ready");

  setStatus("SENSOR GETRENNT");
}

function calibrateSensor() {
  if (!currentRows.length) {
    setStatus("NOCH KEINE DATEN");
    return;
  }

  const reference =
    Analysis.setReference();

  el.btnCalib.textContent =
    "CALIB OK";

  el.btnCalib.classList.add("ready");

  setStatus(
    `REFERENZ: ` +
    `${reference.asymmetry.toFixed(0)}%`
  );
}

function saveCsv() {
  if (!currentRows.length) {
    setStatus("KEINE MESSDATEN");
    return;
  }

  Storage.save({
    timestamp: Date.now(),
    dogSize: el.dogSize.value,
    sensorPosition: el.sensorPosition.value,
    rows: currentRows
  });

  Storage.exportCsv(currentRows);

  setStatus("CSV GESPEICHERT");
}

async function savePdf() {
  if (!currentRows.length) {
    setStatus("KEINE MESSDATEN");
    return;
  }

  try {
    await exportToPDF();
    setStatus("PDF GESPEICHERT");
  } catch (error) {
    setStatus(
      `PDF FEHLER: ${error.message}`
    );
  }
}

function changeChartMode(mode) {
  const datasets = chart.data.datasets;

  if (mode === "acceleration") {
    datasets.forEach(dataset => {
      dataset.hidden = false;
    });

    chart.options.scales.y.title.text =
      "Beschleunigung";
  }

  if (mode === "gyro") {
    datasets.forEach(dataset => {
      dataset.hidden = true;
    });

    chart.options.scales.y.title.text =
      "Gyroskop nicht verfügbar";
  }

  if (mode === "tilt") {
    datasets.forEach(dataset => {
      dataset.hidden = true;
    });

    chart.options.scales.y.title.text =
      "Neigung im HUD sichtbar";
  }

  chart.update("none");
}

function resetPullIndicator() {
  el.pullRefreshIndicator.style.transform =
    "translateY(0)";

  el.pullRefreshIndicator.classList.remove(
    "ready"
  );

  el.pullRefreshText.textContent =
    "ZUM AKTUALISIEREN ZIEHEN";
}

function updatePullIndicator(distance) {
  const visibleDistance =
    Math.min(distance * 0.65, 90);

  el.pullRefreshIndicator.style.transform =
    `translateY(${visibleDistance}px)`;

  if (distance >= PULL_THRESHOLD) {
    el.pullRefreshIndicator.classList.add(
      "ready"
    );

    el.pullRefreshText.textContent =
      "LOS LASSEN ZUM AKTUALISIEREN";
  } else {
    el.pullRefreshIndicator.classList.remove(
      "ready"
    );

    el.pullRefreshText.textContent =
      "ZUM AKTUALISIEREN ZIEHEN";
  }
}

function handleTouchStart(event) {
  if (
    refreshInProgress ||
    window.scrollY > 0 ||
    !event.touches.length
  ) {
    return;
  }

  touchStartY = event.touches[0].clientY;
  touchCurrentY = touchStartY;
  pulling = true;
}

function handleTouchMove(event) {
  if (
    !pulling ||
    refreshInProgress ||
    !event.touches.length
  ) {
    return;
  }

  touchCurrentY = event.touches[0].clientY;

  const distance =
    touchCurrentY - touchStartY;

  if (distance <= 0) {
    resetPullIndicator();
    return;
  }

  if (distance > 8) {
    event.preventDefault();
  }

  updatePullIndicator(distance);
}

function handleTouchEnd() {
  if (!pulling || refreshInProgress) {
    return;
  }

  const distance =
    touchCurrentY - touchStartY;

  pulling = false;

  if (distance >= PULL_THRESHOLD) {
    refreshInProgress = true;

    el.pullRefreshText.textContent =
      "AKTUALISIERE...";

    setTimeout(() => {
      window.location.reload();
    }, 200);
  } else {
    resetPullIndicator();
  }
}

el.btnConnect.addEventListener(
  "click",
  async () => {
    if (sensorConnected) {
      await disconnectSensor();
    } else {
      await connectSensor();
    }
  }
);

el.btnCalib.addEventListener(
  "click",
  calibrateSensor
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

    if (demoRunning) {
      el.btnDemo.textContent =
        "DEMO STOP";

      demoLoop();
    } else {
      el.btnDemo.textContent = "DEMO";
    }
  }
);

el.btnSave.addEventListener(
  "click",
  saveCsv
);

el.btnPdf.addEventListener(
  "click",
  savePdf
);

el.chartMode.addEventListener(
  "change",
  event => {
    changeChartMode(event.target.value);
  }
);

document.addEventListener(
  "touchstart",
  handleTouchStart,
  {
    passive: true
  }
);

document.addEventListener(
  "touchmove",
  handleTouchMove,
  {
    passive: false
  }
);

document.addEventListener(
  "touchend",
  handleTouchEnd,
  {
    passive: true
  }
);

Sensor.on(
  "status",
  sensorStatus => {
    setStatus(sensorStatus);

    if (
      sensorStatus.includes("GETRENNT")
    ) {
      sensorConnected = false;
      el.btnConnect.textContent = "SENSOR";
      el.btnConnect.classList.remove("ready");
    }
  }
);

Sensor.on(
  "error",
  sensorError => {
    setStatus(sensorError);
  }
);

Sensor.on(
  "data",
  data => {
    if (!measuring) {
      el.debugRaw.textContent =
        `RAW: ${data.raw ?? "OK"}`;

      return;
    }

    queueSensorUpdate(data);
  }
);

setStatus(
  `BEREIT · v${APP_VERSION}`
);
