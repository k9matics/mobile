"use strict";

const APP_VERSION = "2.8";
const MAX_CHART_POINTS = 120;

const el = {
  btnRefresh: document.getElementById("btnRefresh"),
  btnConnect: document.getElementById("btnConnect"),
  btnCalib: document.getElementById("btnCalib"),
  btnMeasure: document.getElementById("btnMeasure"),
  btnDemo: document.getElementById("btnDemo"),
  btnSave: document.getElementById("btnSave"),
  btnPdf: document.getElementById("btnPdf"),

  connectionDot: document.getElementById("connectionDot"),
  connectionLabel: document.getElementById("connectionLabel"),

  dogSize: document.getElementById("dogSize"),
  sensorPosition: document.getElementById("sensorPosition"),
  chartMode: document.getElementById("chartMode"),

  harnessBadge: document.getElementById("harnessBadge"),

  fit: document.getElementById("kpiFit"),
  stability: document.getElementById("kpiStability"),
  shift: document.getElementById("kpiShift"),
  rotation: document.getElementById("kpiRotation"),

  radarDot: document.getElementById("radar-dot"),
  hudCoords: document.getElementById("hudCoords"),
  tiltValue: document.getElementById("tiltValue"),

  verticalValue: document.getElementById("verticalValue"),
  lateralValue: document.getElementById("lateralValue"),
  pitchValue: document.getElementById("pitchValue"),
  analysisStatus: document.getElementById("analysisStatus"),

  debugRaw: document.getElementById("debugRaw")
};

let measuring = false;
let demoRunning = false;
let sensorConnected = false;
let currentRows = [];
let refreshing = false;

const DOG_PROFILES = {
  toy: {
    movementFactor: 1.35
  },

  small: {
    movementFactor: 1.15
  },

  medium: {
    movementFactor: 1
  },

  large: {
    movementFactor: 0.85
  },

  giant: {
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
          label: "Seitlich",
          data: [],
          borderColor: "#ffcc00",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "Vor/Zurück",
          data: [],
          borderColor: "#b3002d",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "Vertikal",
          data: [],
          borderColor: "#00ffcc",
          backgroundColor: "rgba(0,255,204,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          fill: true
        },

        {
          label: "Gesamt",
          data: [],
          borderColor: "#ffffff",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2
        },

        {
          label: "Roll",
          data: [],
          borderColor: "#ffcc00",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
          hidden: true
        },

        {
          label: "Pitch",
          data: [],
          borderColor: "#00ffcc",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
          hidden: true
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,

      interaction: {
        intersect: false,
        mode: "index"
      },

      plugins: {
        legend: {
          display: true,

          labels: {
            color: "#c9d1d9",

            font: {
              family: "Share Tech Mono",
              size: 8
            },

            boxWidth: 8,
            padding: 6
          }
        }
      },

      scales: {
        x: {
          ticks: {
            color: "#8b949e",
            maxTicksLimit: 5,

            font: {
              family: "Share Tech Mono",
              size: 8
            }
          },

          grid: {
            color: "rgba(139,148,158,0.15)"
          },

          title: {
            display: true,
            text: "Zeit",
            color: "#00ffcc"
          }
        },

        y: {
          min: -2,
          max: 2,

          ticks: {
            color: "#8b949e",

            font: {
              family: "Share Tech Mono",
              size: 8
            }
          },

          grid: {
            color: "rgba(139,148,158,0.15)"
          },

          title: {
            display: true,
            text: "Beschleunigung",
            color: "#00ffcc"
          }
        }
      }
    }
  }
);

function setConnectionState(state, label) {
  if (el.connectionDot) {
    el.connectionDot.classList.remove(
      "connected",
      "connecting",
      "error"
    );

    if (state) {
      el.connectionDot.classList.add(state);
    }
  }

  if (el.connectionLabel) {
    el.connectionLabel.textContent = label;
  }
}

function setStatus(text) {
  el.harnessBadge.textContent = text;
  el.debugRaw.textContent = text;
}

function updateStatusColor(text) {
  const statusText = String(text || "").toUpperCase();

  if (
    statusText.includes("EMPFOHLEN") ||
    statusText.includes("ABWEICHUNG") ||
    statusText.includes("FEHLER")
  ) {
    el.harnessBadge.style.color = "#ff0055";
    el.analysisStatus.style.color = "#ff0055";
    return;
  }

  if (
    statusText.includes("VERSCHIEBUNG") ||
    statusText.includes("UNRUHIG") ||
    statusText.includes("WENIG") ||
    statusText.includes("WARTEN")
  ) {
    el.harnessBadge.style.color = "#ffcc00";
    el.analysisStatus.style.color = "#ffcc00";
    return;
  }

  el.harnessBadge.style.color = "#00ffcc";
  el.analysisStatus.style.color = "#00ffcc";
}

function resetChart() {
  chart.data.labels = [];

  chart.data.datasets.forEach(dataset => {
    dataset.data = [];
  });

  chart.update("none");
}

function updateRadar(shift, pitch) {
  const safeShift = Number.isFinite(shift) ? shift : 0;
  const safePitch = Number.isFinite(pitch) ? pitch : 0;

  const x = Math.max(-45, Math.min(45, safeShift)) * 1.2;
  const y = Math.max(-45, Math.min(45, safePitch)) * 0.8;

  el.radarDot.style.transform = `translate(${x}px, ${y}px)`;

  el.hudCoords.textContent = `X:${x.toFixed(0)} Y:${y.toFixed(0)}`;

  el.tiltValue.textContent = `KIPPUNG: ${safePitch.toFixed(1)}°`;
}

function applyChartMode() {
  const tiltMode = el.chartMode.value === "tilt";
  const datasets = chart.data.datasets;

  datasets[0].hidden = tiltMode;
  datasets[1].hidden = tiltMode;
  datasets[2].hidden = tiltMode;
  datasets[3].hidden = tiltMode;

  datasets[4].hidden = !tiltMode;
  datasets[5].hidden = !tiltMode;

  if (tiltMode) {
    chart.options.scales.y.min = -90;
    chart.options.scales.y.max = 90;
    chart.options.scales.y.title.text = "Kippung in Grad";
  } else {
    chart.options.scales.y.min = -2;
    chart.options.scales.y.max = 2;
    chart.options.scales.y.title.text = "Beschleunigung in g";
  }

  chart.update("none");
}

function updateData(data) {
  const accX = Number(data.accX) || 0;
  const accY = Number(data.accY) || 0;
  const accZ = Number(data.accZ) || 0;

  const totalAcceleration = Analysis.magnitude(accX, accY, accZ);
  const tilt = Analysis.calculateTilt(accX, accY, accZ);
  const dynamicAcceleration = Math.abs(totalAcceleration - 1);

  const sample = {
    timestamp: Number(data.timestamp) || Date.now(),

    accX,
    accY,
    accZ,

    gyroX: Number(data.gyroX) || 0,
    gyroY: Number(data.gyroY) || 0,
    gyroZ: Number(data.gyroZ) || 0,

    raw: data.raw ?? "",

    totalAcceleration,
    dynamicAcceleration,

    roll: tilt.roll,
    pitch: tilt.pitch
  };

  const result = Analysis.addSample(sample);

  currentRows.push(sample);

  if (currentRows.length > 2000) {
    currentRows.shift();
  }

  if (sample.raw !== "") {
    el.debugRaw.textContent = `RAW: ${sample.raw}`;
  }

  const time = new Date(sample.timestamp).toLocaleTimeString(
    "de-DE",
    {
      minute: "2-digit",
      second: "2-digit"
    }
  );

  chart.data.labels.push(time);

  chart.data.datasets[0].data.push(accY);
  chart.data.datasets[1].data.push(accX);
  chart.data.datasets[2].data.push(accZ);
  chart.data.datasets[3].data.push(totalAcceleration);
  chart.data.datasets[4].data.push(tilt.roll);
  chart.data.datasets[5].data.push(tilt.pitch);

  if (chart.data.labels.length > MAX_CHART_POINTS) {
    chart.data.labels.shift();

    chart.data.datasets.forEach(dataset => {
      dataset.data.shift();
    });
  }

  chart.update("none");

  el.fit.textContent = result.fitLabel;
  el.stability.textContent = `${result.stability.toFixed(0)}%`;
  el.shift.textContent = `${result.shift.toFixed(1)}°`;
  el.rotation.textContent = "N/V";

  el.verticalValue.textContent = `${Math.abs(accZ).toFixed(2)} g`;
  el.lateralValue.textContent = `${Math.abs(accY).toFixed(2)} g`;
  el.pitchValue.textContent = `${tilt.pitch.toFixed(1)}°`;
  el.analysisStatus.textContent = result.status;

  updateRadar(result.shift, tilt.pitch);
  updateStatusColor(result.status);
}

function startMeasurement() {
  measuring = true;
  currentRows = [];

  Analysis.reset();
  resetChart();

  el.btnMeasure.classList.add("active");
  el.btnMeasure.textContent = "ANALYSE LÄUFT";

  setStatus("GESCHIRRANALYSE AKTIV");
}

function stopMeasurement() {
  measuring = false;

  el.btnMeasure.classList.remove("active");
  el.btnMeasure.textContent = "ANALYSE STARTEN";

  setStatus("ANALYSE BEENDET");
}

function createDemoData() {
  const time = Date.now() / 200;

  const profile = DOG_PROFILES[el.dogSize.value] || DOG_PROFILES.medium;
  const factor = profile.movementFactor;

  return {
    timestamp: Date.now(),

    accX: Math.sin(time * 0.8) * 0.22 * factor,
    accY: Math.cos(time * 0.75) * 0.15 * factor,
    accZ: 1 + Math.sin(time * 1.8) * 0.3 * factor,

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

  updateData(createDemoData());

  setTimeout(() => {
    requestAnimationFrame(demoLoop);
  }, 80);
}

async function connectSensor() {
  try {
    if (
      !window.K9Sensor ||
      typeof window.K9Sensor.connect !== "function"
    ) {
      throw new Error("K9-SENSOR-DATEI FEHLT ODER IST ALT");
    }

    setConnectionState("connecting", "SUCHE...");
    setStatus("K9MATICS AUSWÄHLEN");

    await window.K9Sensor.connect();

    sensorConnected = true;

    el.btnConnect.textContent = "VERBUNDEN";
    el.btnConnect.classList.add("ready");

    setConnectionState("connected", "VERBUNDEN");
    setStatus("K9MATICS SENSOR VERBUNDEN");
  } catch (error) {
    sensorConnected = false;

    console.error(error);

    el.btnConnect.textContent = "SENSOR";
    el.btnConnect.classList.remove("ready");

    setConnectionState("error", "FEHLER");
    setStatus(`FEHLER: ${error.message}`);

    alert(error.message);
  }
}

async function disconnectSensor() {
  try {
    if (
      window.K9Sensor &&
      typeof window.K9Sensor.disconnect === "function"
    ) {
      await window.K9Sensor.disconnect();
    }

    sensorConnected = false;

    el.btnConnect.textContent = "SENSOR";
    el.btnConnect.classList.remove("ready");

    setConnectionState("", "OFFLINE");
    setStatus("SENSOR GETRENNT");
  } catch (error) {
    console.error(error);
    setConnectionState("error", "FEHLER");
    setStatus(`FEHLER: ${error.message}`);
  }
}

function calibrateHarness() {
  if (!currentRows.length) {
    setStatus("NOCH KEINE DATEN");
    return;
  }

  const reference = Analysis.setReference();

  el.btnCalib.textContent = "CALIB OK";
  el.btnCalib.classList.add("ready");

  setStatus(`REFERENZ: ${reference.fitScore.toFixed(0)}%`);
}

function saveCsv() {
  if (!currentRows.length) {
    alert("KEINE MESSDATEN VORHANDEN");
    return;
  }

  Storage.save({
    timestamp: Date.now(),
    version: APP_VERSION,
    dogSize: el.dogSize.value,
    sensorPosition: el.sensorPosition.value,
    rows: currentRows
  });

  Storage.exportCsv(currentRows);

  el.btnSave.classList.add("ready");

  setTimeout(() => {
    el.btnSave.classList.remove("ready");
  }, 900);

  setStatus("CSV GESPEICHERT");
}

async function savePdf() {
  try {
    await exportToPDF();

    el.btnPdf.classList.add("pdf-ready");

    setTimeout(() => {
      el.btnPdf.classList.remove("pdf-ready");
    }, 900);

    setStatus("PDF GESPEICHERT");
  } catch (error) {
    console.error(error);
    setStatus(`PDF-FEHLER: ${error.message}`);
    alert(error.message);
  }
}

function refreshPage() {
  if (refreshing) {
    return;
  }

  refreshing = true;

  el.btnRefresh.classList.add("loading");
  setStatus("AKTUALISIERE...");

  setTimeout(() => {
    window.location.reload();
  }, 250);
}

el.btnRefresh.addEventListener("click", refreshPage);

el.btnConnect.addEventListener("click", async () => {
  if (sensorConnected) {
    await disconnectSensor();
  } else {
    await connectSensor();
  }
});

el.btnCalib.addEventListener("click", calibrateHarness);

el.btnMeasure.addEventListener("click", () => {
  if (measuring) {
    stopMeasurement();
  } else {
    startMeasurement();
  }
});

el.btnDemo.addEventListener("click", () => {
  demoRunning = !demoRunning;

  if (demoRunning) {
    el.btnDemo.textContent = "DEMO STOP";
    el.btnDemo.classList.add("ready");

    setStatus("DEMO AKTIV");
    demoLoop();
  } else {
    el.btnDemo.textContent = "DEMO";
    el.btnDemo.classList.remove("ready");

    setStatus("DEMO BEENDET");
  }
});

el.btnSave.addEventListener("click", saveCsv);
el.btnPdf.addEventListener("click", savePdf);

el.chartMode.addEventListener("change", applyChartMode);

if (window.K9Sensor && typeof window.K9Sensor.on === "function") {
  window.K9Sensor.on("status", sensorStatus => {
    const status = String(sensorStatus || "");
    const upperStatus = status.toUpperCase();

    setStatus(status);

    if (
      upperStatus.includes("VERBUNDEN") ||
      upperStatus.includes("CONNECTED")
    ) {
      sensorConnected = true;
      el.btnConnect.textContent = "VERBUNDEN";
      el.btnConnect.classList.add("ready");
      setConnectionState("connected", "VERBUNDEN");
      return;
    }

    if (
      upperStatus.includes("SUCHE") ||
      upperStatus.includes("CONNECTING")
    ) {
      setConnectionState("connecting", "SUCHE...");
      return;
    }

    if (
      upperStatus.includes("FEHLER") ||
      upperStatus.includes("ERROR")
    ) {
      sensorConnected = false;
      el.btnConnect.textContent = "SENSOR";
      el.btnConnect.classList.remove("ready");
      setConnectionState("error", "FEHLER");
      return;
    }

    if (
      upperStatus.includes("GETRENNT") ||
      upperStatus.includes("DISCONNECTED") ||
      upperStatus.includes("OFFLINE")
    ) {
      sensorConnected = false;
      el.btnConnect.textContent = "SENSOR";
      el.btnConnect.classList.remove("ready");
      setConnectionState("", "OFFLINE");
    }
  });

  window.K9Sensor.on("error", sensorError => {
    sensorConnected = false;

    el.btnConnect.textContent = "SENSOR";
    el.btnConnect.classList.remove("ready");

    setConnectionState("error", "FEHLER");
    setStatus(String(sensorError || "SENSORFEHLER"));
  });

  window.K9Sensor.on("data", data => {
    el.debugRaw.textContent = `RAW: ${data.raw ?? "OK"}`;

    if (measuring) {
      updateData(data);
    }
  });
}

applyChartMode();
setConnectionState("", "OFFLINE");
setStatus(`K9MATICS BEREIT · v${APP_VERSION}`);
