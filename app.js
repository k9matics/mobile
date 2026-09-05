"use strict";

const App = (() => {
  const els = {};
  const state = {
    connected: false,
    measuring: false,
    demo: false,
    sampleCount: 0,
    lastPacket: null,
    samples: [],
    chart: null,
    chartMode: "acceleration",
    demoTimer: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    els.appName = byId("appName");
    els.appVersion = byId("appVersion");
    els.btnConnect = byId("btnConnect");
    els.btnCalib = byId("btnCalib");
    els.btnMeasure = byId("btnMeasure");
    els.btnDemo = byId("btnDemo");
    els.btnSave = byId("btnSave");
    els.btnPdf = byId("btnPdf");
    els.btnRefresh = byId("btnRefresh");
    els.chartMode = byId("chartMode");

    els.gaitBadge = byId("gaitBadge");
    els.kpiGait = byId("kpiGait");
    els.kpiCadence = byId("kpiCadence");
    els.kpiRegularity = byId("kpiRegularity");
    els.kpiAsymmetry = byId("kpiAsymmetry");

    els.motionValue = byId("motionValue");
    els.rollValue = byId("rollValue");
    els.pitchValue = byId("pitchValue");
    els.analysisStatus = byId("analysisStatus");
    els.debugRaw = byId("debugRaw");

    els.radarCrosshair = byId("radarCrosshair");
    els.hudCoords = byId("hudCoords");
    els.tiltValue = byId("tiltValue");

    els.sensorChart = byId("sensorChart");
  }

  function setVersion() {
    if (!window.APP_META) return;

    if (els.appName) {
      els.appName.textContent = window.APP_META.name;
    }

    if (els.appVersion) {
      els.appVersion.textContent = `v${window.APP_META.version}`;
    }

    document.title = window.APP_META.name;
  }

  function createChart() {
    if (!els.sensorChart || !window.Chart) return;

    const ctx = els.sensorChart.getContext("2d");

    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "X",
            data: [],
            borderColor: "#00eaff",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.25
          },
          {
            label: "Y",
            data: [],
            borderColor: "#d7b23a",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.25
          },
          {
            label: "Z",
            data: [],
            borderColor: "#b3374f",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.25
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#d7dee6",
              boxWidth: 10
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#7f8a95",
              maxTicksLimit: 6
            },
            grid: {
              color: "rgba(0,234,255,0.08)"
            }
          },
          y: {
            ticks: {
              color: "#7f8a95"
            },
            grid: {
              color: "rgba(0,234,255,0.08)"
            }
          }
        }
      }
    });
  }

  function clearChart() {
    if (!state.chart) return;

    state.chart.data.labels = [];
    state.chart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    state.chart.update("none");
  }

  function pushChartSample(packet) {
    if (!state.chart) return;

    const chart = state.chart;
    const t = new Date(packet.timestamp).toLocaleTimeString();

    let x = packet.accX;
    let y = packet.accY;
    let z = packet.accZ;

    if (state.chartMode === "tilt") {
      const roll = Math.atan2(packet.accY, packet.accZ) * (180 / Math.PI);
      const pitch = Math.atan2(
        -packet.accX,
        Math.sqrt(packet.accY * packet.accY + packet.accZ * packet.accZ)
      ) * (180 / Math.PI);

      x = roll;
      y = pitch;
      z = 0;
    }

    if (state.chartMode === "gyro") {
      x = packet.gyroX || 0;
      y = packet.gyroY || 0;
      z = packet.gyroZ || 0;
    }

    chart.data.labels.push(t);
    chart.data.datasets[0].data.push(x);
    chart.data.datasets[1].data.push(y);
    chart.data.datasets[2].data.push(z);

    if (chart.data.labels.length > 40) {
      chart.data.labels.shift();
      chart.data.datasets.forEach(dataset => dataset.data.shift());
    }

    chart.update("none");
  }

  function updateRadar(packet) {
    if (!els.radarCrosshair) return;

    const x = Math.max(-1.5, Math.min(1.5, packet.accX));
    const y = Math.max(-1.5, Math.min(1.5, packet.accY));
    const z = Math.max(-1.5, Math.min(1.5, packet.accZ));

    const px = x * 18;
    const py = y * -18;
    const scale = 1 + z * 0.03;

    els.radarCrosshair.style.transform =
      `translate(${px}px, ${py}px) scale(${scale.toFixed(3)})`;

    if (els.hudCoords) {
      els.hudCoords.textContent = `X:${x.toFixed(2)} Y:${y.toFixed(2)}`;
    }

    const tilt = Math.sqrt(x * x + y * y) * 18;
    if (els.tiltValue) {
      els.tiltValue.textContent = `TILT: ${tilt.toFixed(1)}°`;
    }
  }

  function updateMetrics(packet) {
    const result = window.Analysis
      ? Analysis.summarize(packet)
      : {
          motion: Math.sqrt(
            packet.accX * packet.accX +
            packet.accY * packet.accY +
            packet.accZ * packet.accZ
          ).toFixed(2),
          roll: (
            Math.atan2(packet.accY, packet.accZ) * (180 / Math.PI)
          ).toFixed(1),
          pitch: (
            Math.atan2(
              -packet.accX,
              Math.sqrt(packet.accY * packet.accY + packet.accZ * packet.accZ)
            ) * (180 / Math.PI)
          ).toFixed(1),
          gait: "SCHRITT",
          cadence: 0,
          regularity: 0,
          asymmetry: 0
        };

    if (els.motionValue) els.motionValue.textContent = `${result.motion} g`;
    if (els.rollValue) els.rollValue.textContent = `${result.roll}°`;
    if (els.pitchValue) els.pitchValue.textContent = `${result.pitch}°`;

    if (els.analysisStatus) {
      els.analysisStatus.textContent = state.measuring ? "MESSUNG" : "LIVE";
    }

    if (els.kpiGait) els.kpiGait.textContent = result.gait;
    if (els.kpiCadence) els.kpiCadence.textContent = String(result.cadence);
    if (els.kpiRegularity) els.kpiRegularity.textContent = `${result.regularity}%`;
    if (els.kpiAsymmetry) els.kpiAsymmetry.textContent = `${result.asymmetry}%`;

    if (els.gaitBadge) {
      els.gaitBadge.textContent = state.connected ? "K9MATICS VERBUNDEN" : "BEREIT";
    }

    if (els.debugRaw) {
      els.debugRaw.textContent = packet.raw || "NO DATA";
    }
  }

  function handlePacket(packet) {
    state.lastPacket = packet;
    state.sampleCount += 1;
    state.samples.push(packet);

    if (state.samples.length > 500) {
      state.samples.shift();
    }

    if (window.Storage && typeof Storage.setSamples === "function") {
      Storage.setSamples(state.samples);
    }

    updateRadar(packet);
    updateMetrics(packet);
    pushChartSample(packet);
  }

  function setConnectedUi(connected, label = "SENSOR") {
    state.connected = connected;

    if (els.btnConnect) {
      els.btnConnect.classList.toggle("connected", connected);
      els.btnConnect.textContent = connected ? "VERBUNDEN" : label;
    }

    if (els.gaitBadge && !state.lastPacket) {
      els.gaitBadge.textContent = connected ? "K9MATICS VERBUNDEN" : "BEREIT";
    }
  }

  async function onConnectClick() {
    try {
      if (Sensor.isConnected()) {
        await Sensor.disconnect();
        setConnectedUi(false, "SENSOR");
        return;
      }

      await Sensor.connect();
      setConnectedUi(true);
    } catch (error) {
      console.error(error);
      if (els.analysisStatus) els.analysisStatus.textContent = "BT FEHLER";
      if (els.debugRaw) els.debugRaw.textContent = String(error.message || error);
    }
  }

  function onMeasureClick() {
    state.measuring = !state.measuring;

    if (els.btnMeasure) {
      els.btnMeasure.classList.toggle("active", state.measuring);
      els.btnMeasure.textContent = state.measuring
        ? "MESSUNG STOPPEN"
        : "MESSUNG STARTEN";
    }

    if (els.analysisStatus) {
      els.analysisStatus.textContent = state.measuring ? "MESSUNG" : "LIVE";
    }
  }

  function makeDemoPacket() {
    const t = Date.now() / 280;

    return {
      timestamp: Date.now(),
      accX: Math.sin(t) * 0.95,
      accY: Math.cos(t * 0.9) * 0.75,
      accZ: 0.95 + Math.sin(t * 1.4) * 0.22,
      gyroX: Math.sin(t * 1.1) * 18,
      gyroY: Math.cos(t * 1.3) * 16,
      gyroZ: Math.sin(t * 0.7) * 12,
      raw: `X:${(Math.sin(t) * 0.95).toFixed(2)} Y:${(Math.cos(t * 0.9) * 0.75).toFixed(2)} Z:${(0.95 + Math.sin(t * 1.4) * 0.22).toFixed(2)}`
    };
  }

  function toggleDemo() {
    state.demo = !state.demo;

    if (els.btnDemo) {
      els.btnDemo.classList.toggle("active", state.demo);
      els.btnDemo.textContent = state.demo ? "DEMO AKTIV" : "DEMO";
    }

    if (!state.demo) {
      clearInterval(state.demoTimer);
      state.demoTimer = null;
      return;
    }

    state.demoTimer = setInterval(() => {
      handlePacket(makeDemoPacket());
    }, 140);
  }

  function downloadCsv() {
    const samples = window.Storage && typeof Storage.getSamples === "function"
      ? Storage.getSamples()
      : [...state.samples];

    if (!samples.length) {
      if (els.debugRaw) els.debugRaw.textContent = "KEINE DATEN FÜR CSV";
      return;
    }

    const header = "timestamp,accX,accY,accZ,gyroX,gyroY,gyroZ,raw";
    const rows = samples.map(sample => {
      const raw = String(sample.raw || "").replace(/"/g, '""');
      return [
        sample.timestamp,
        sample.accX,
        sample.accY,
        sample.accZ,
        sample.gyroX || 0,
        sample.gyroY || 0,
        sample.gyroZ || 0,
        `"${raw}"`
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "harnelyzer-export.csv";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 250);

    if (els.debugRaw) {
      els.debugRaw.textContent = "CSV EXPORT GESTARTET";
    }
  }

  function exportPdf() {
    try {
      if (window.PDFExport && typeof PDFExport.create === "function") {
        PDFExport.create({
          appMeta: window.APP_META,
          latest: state.lastPacket,
          summary: state.lastPacket && window.Analysis
            ? Analysis.summarize(state.lastPacket)
            : null,
          samples: state.samples
        });

        if (els.debugRaw) {
          els.debugRaw.textContent = "PDF EXPORT GESTARTET";
        }
        return;
      }

      if (els.debugRaw) {
        els.debugRaw.textContent = "PDF MODUL FEHLT";
      }
    } catch (error) {
      console.error(error);
      if (els.debugRaw) {
        els.debugRaw.textContent = `PDF FEHLER: ${error.message || error}`;
      }
    }
  }

  async function refreshApp() {
    if (els.debugRaw) {
      els.debugRaw.textContent = "AKTUALISIERE...";
    }

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      }
    } catch (error) {
      console.warn("SW UPDATE FEHLER", error);
    }

    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString());
    window.location.replace(url.toString());
  }

  function resetSession() {
    state.sampleCount = 0;
    state.lastPacket = null;
    state.samples = [];

    if (window.Storage && typeof Storage.clear === "function") {
      Storage.clear();
    }

    clearChart();

    if (els.kpiGait) els.kpiGait.textContent = "—";
    if (els.kpiCadence) els.kpiCadence.textContent = "0";
    if (els.kpiRegularity) els.kpiRegularity.textContent = "0%";
    if (els.kpiAsymmetry) els.kpiAsymmetry.textContent = "0%";

    if (els.motionValue) els.motionValue.textContent = "0.00 g";
    if (els.rollValue) els.rollValue.textContent = "0.0°";
    if (els.pitchValue) els.pitchValue.textContent = "0.0°";

    if (els.analysisStatus) els.analysisStatus.textContent = "RESET";
    if (els.debugRaw) els.debugRaw.textContent = "SESSION RESET";
    if (els.gaitBadge) els.gaitBadge.textContent = state.connected ? "K9MATICS VERBUNDEN" : "BEREIT";

    if (els.radarCrosshair) {
      els.radarCrosshair.style.transform = "translate(0px, 0px) scale(1)";
    }

    if (els.hudCoords) els.hudCoords.textContent = "X:0 Y:0";
    if (els.tiltValue) els.tiltValue.textContent = "TILT: 0°";
  }

  function bindEvents() {
    if (els.btnConnect) {
      els.btnConnect.addEventListener("click", onConnectClick);
    }

    if (els.btnCalib) {
      els.btnCalib.addEventListener("click", resetSession);
    }

    if (els.btnMeasure) {
      els.btnMeasure.addEventListener("click", onMeasureClick);
    }

    if (els.btnDemo) {
      els.btnDemo.addEventListener("click", toggleDemo);
    }

    if (els.btnSave) {
      els.btnSave.addEventListener("click", downloadCsv);
    }

    if (els.btnPdf) {
      els.btnPdf.addEventListener("click", exportPdf);
    }

    if (els.btnRefresh) {
      els.btnRefresh.addEventListener("click", refreshApp);
    }

    if (els.chartMode) {
      els.chartMode.addEventListener("change", event => {
        state.chartMode = event.target.value;
        clearChart();
      });
    }

    Sensor.on("data", handlePacket);

    Sensor.on("status", status => {
      if (els.analysisStatus) {
        els.analysisStatus.textContent = status;
      }

      if (/VERBUNDEN/i.test(status)) {
        setConnectedUi(true);
      }

      if (/GETRENNT/i.test(status)) {
        setConnectedUi(false, "SENSOR");
      }
    });

    Sensor.on("error", message => {
      if (els.analysisStatus) {
        els.analysisStatus.textContent = "SENSORFEHLER";
      }

      if (els.debugRaw) {
        els.debugRaw.textContent = message;
      }
    });
  }

  function init() {
    cacheDom();
    setVersion();
    createChart();
    bindEvents();
    setConnectedUi(false, "SENSOR");
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
