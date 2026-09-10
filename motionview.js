"use strict";

/**
 * HARNELYZER — Motion View
 *
 * Eigenständiges Wiedergabefenster für eine einzelne Messung (Referenz,
 * Geschirrtest oder laufende Live-Messung):
 * - 3D-Ansicht (wiederverwendet Scene3D, eigener Canvas-Slot)
 * - zeitlich synchronisierte Zeitleiste (Chart.js) mit Abspielkopf
 * - Play/Pause und Scrubbing
 * - automatisch erkannte Bewegungsereignisse (Spitzen, Neigung, Ruhephasen)
 * - Datenqualitätsanzeige (nutzt die bestehende Analysis.calculateQuality)
 *
 * Stellt außerdem eine von der Dialog-Sichtbarkeit unabhängige Funktion
 * bereit, um einen statischen "Motion-Snapshot" (3D-Pose + Mini-Zeitleiste)
 * für den PDF-Export zu erzeugen (captureStaticSnapshot).
 */
window.MotionView = (() => {
  const els = {};

  const state = {
    open: false,
    session: null,
    role: "back-main",
    samples: [],
    timestamps: [],
    events: [],
    startTs: 0,
    durationMs: 0,
    frameIndex: 0,
    playing: false,
    rafHandle: null,
    playRefWallMs: 0,
    playRefElapsedMs: 0,
    chart: null,
    qualityThrottle: 0
  };

  function cacheDom() {
    els.dialog = document.getElementById("motionViewDialog");
    els.close = document.getElementById("btnMotionViewClose");
    els.source = document.getElementById("motionViewSource");
    els.quality = document.getElementById("motionViewQuality");
    els.empty = document.getElementById("motionViewEmpty");
    els.body = document.getElementById("motionViewBody");
    els.sceneSlot = document.getElementById("motionViewSceneSlot");
    els.timelineCanvas = document.getElementById("motionViewTimeline");
    els.btnPlay = document.getElementById("btnMotionPlay");
    els.scrubber = document.getElementById("motionViewScrubber");
    els.timeLabel = document.getElementById("motionViewTime");
    els.eventList = document.getElementById("motionViewEvents");
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function findNearestIndex(elapsedMs) {
    const target = state.startTs + elapsedMs;
    const times = state.timestamps;
    if (times.length === 0) return 0;

    let low = 0;
    let high = times.length - 1;

    while (low < high) {
      const mid = (low + high) >> 1;
      if (times[mid] < target) low = mid + 1;
      else high = mid;
    }

    return low;
  }

  function buildSessionOptions() {
    const study = window.Storage ? window.Storage.getStudy() : null;
    const options = [];

    if (state.activeCandidate && Array.isArray(state.activeCandidate.samples) && state.activeCandidate.samples.length >= 5) {
      options.push({ value: "active", label: "AKTUELLE MESSUNG (LIVE)", session: state.activeCandidate });
    }

    if (study && study.reference) {
      options.push({ value: "reference", label: "REFERENZ", session: study.reference });
    }

    if (study && Array.isArray(study.harnessTests)) {
      study.harnessTests.forEach((test, index) => {
        const letter = String.fromCharCode(65 + index);
        options.push({
          value: `harness-${index}`,
          label: test.label || `GESCHIRRTEST ${letter}`,
          session: test
        });
      });
    }

    return options;
  }

  function renderSourceSelect(preferredValue) {
    const options = buildSessionOptions();
    els.source.innerHTML = "";

    if (options.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "KEINE MESSUNG VERFÜGBAR";
      els.source.appendChild(opt);
      els.source.disabled = true;
      return null;
    }

    els.source.disabled = false;
    options.forEach(entry => {
      const opt = document.createElement("option");
      opt.value = entry.value;
      opt.textContent = entry.label;
      els.source.appendChild(opt);
    });

    const match = options.find(entry => entry.value === preferredValue) || options[options.length - 1];
    els.source.value = match.value;
    return match.session;
  }

  function setQualityBadge(quality) {
    els.quality.classList.remove("is-good", "is-warn", "is-bad");
    if (!quality || quality.sampleCount === 0) {
      els.quality.textContent = "QUALITÄT: WARTET";
      return;
    }

    els.quality.textContent = `QUALITÄT: ${quality.label} (${quality.score})`;
    if (quality.score >= 75) els.quality.classList.add("is-good");
    else if (quality.score >= 50) els.quality.classList.add("is-warn");
    else els.quality.classList.add("is-bad");
  }

  function levelClass(level) {
    if (level === "alert") return "is-alert";
    if (level === "caution") return "is-caution";
    return "is-stable";
  }

  function renderEvents() {
    els.eventList.innerHTML = "";

    if (state.events.length === 0) {
      const li = document.createElement("li");
      li.className = "motion-view__event motion-view__event--empty";
      li.textContent = "Keine auffälligen Ereignisse erkannt.";
      els.eventList.appendChild(li);
      return;
    }

    state.events.forEach(event => {
      const li = document.createElement("li");
      li.className = `motion-view__event ${levelClass(event.level)}`;
      li.tabIndex = 0;
      li.setAttribute("role", "button");

      const relMs = Math.max(0, event.timestamp - state.startTs);
      li.innerHTML = `
        <span class="motion-view__event-dot"></span>
        <span class="motion-view__event-time">${formatClock(relMs)}</span>
        <span class="motion-view__event-label">${event.label}</span>
        <span class="motion-view__event-detail">${event.detail || ""}</span>
      `;

      const seekHandler = () => {
        pause();
        seekToElapsed(relMs);
      };
      li.addEventListener("click", seekHandler);
      li.addEventListener("keydown", evt => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          seekHandler();
        }
      });

      els.eventList.appendChild(li);
    });
  }

  function buildChartDatasets() {
    const analysis = window.Analysis;
    const maxPoints = 500;
    const stride = Math.max(1, Math.ceil(state.samples.length / maxPoints));

    const motion = [];
    const roll = [];
    const pitch = [];

    for (let i = 0; i < state.samples.length; i += stride) {
      const sample = state.samples[i];
      const tSec = (sample.timestamp - state.startTs) / 1000;
      const dynamicMotion = analysis ? analysis.calcDynamicMotion(sample) : 0;
      const rollDeg = analysis ? analysis.calcRoll(sample) : 0;
      const pitchDeg = analysis ? analysis.calcPitch(sample) : 0;

      motion.push({ x: tSec, y: dynamicMotion });
      roll.push({ x: tSec, y: rollDeg });
      pitch.push({ x: tSec, y: pitchDeg });
    }

    return { motion, roll, pitch };
  }

  const playheadPlugin = {
    id: "motionViewPlayhead",
    afterDraw(chart) {
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;

      const elapsedSec = (state.frameIndex >= 0 && state.timestamps[state.frameIndex] !== undefined)
        ? (state.timestamps[state.frameIndex] - state.startTs) / 1000
        : 0;

      const x = xScale.getPixelForValue(elapsedSec);
      const ctx = chart.ctx;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, yScale.top);
      ctx.lineTo(x, yScale.bottom);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#65ffe6";
      ctx.shadowColor = "rgba(101, 255, 230, 0.65)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }
  };

  const eventMarkerPlugin = {
    id: "motionViewEventMarkers",
    afterDraw(chart) {
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale || state.events.length === 0) return;

      const ctx = chart.ctx;
      const colors = { alert: "#ff6689", caution: "#e0ba28", stable: "#b1c86b" };

      state.events.forEach(event => {
        const tSec = (event.timestamp - state.startTs) / 1000;
        const x = xScale.getPixelForValue(tSec);
        if (x < xScale.left || x > xScale.right) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, yScale.top + 4, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = colors[event.level] || "#b1c86b";
        ctx.fill();
        ctx.restore();
      });
    }
  };

  function ensureChart() {
    if (!window.Chart || !els.timelineCanvas) return;
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    const data = buildChartDatasets();
    const ctx = els.timelineCanvas.getContext("2d");

    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "BEWEGUNG",
            data: data.motion,
            borderColor: "#00e4c6",
            backgroundColor: "rgba(0, 228, 198, 0.08)",
            borderWidth: 1.4,
            pointRadius: 0,
            tension: 0.1,
            yAxisID: "y"
          },
          {
            label: "ROLL",
            data: data.roll,
            borderColor: "#b1c86b",
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.1,
            yAxisID: "y1"
          },
          {
            label: "PITCH",
            data: data.pitch,
            borderColor: "#e0ba28",
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.1,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        parsing: false,
        plugins: {
          legend: {
            labels: { color: "#98a096", boxWidth: 10, font: { size: 9 } }
          },
          tooltip: { enabled: false }
        },
        scales: {
          x: {
            type: "linear",
            ticks: { color: "#687066", font: { size: 9 }, callback: value => `${value}s` },
            grid: { color: "rgba(192, 205, 179, 0.08)" }
          },
          y: {
            position: "left",
            ticks: { color: "#00c9ae", font: { size: 9 } },
            grid: { color: "rgba(192, 205, 179, 0.08)" }
          },
          y1: {
            position: "right",
            ticks: { color: "#a8b98a", font: { size: 9 } },
            grid: { drawOnChartArea: false }
          }
        }
      },
      plugins: [playheadPlugin, eventMarkerPlugin]
    });
  }

  function redrawChart() {
    if (state.chart) state.chart.draw();
  }

  function updateTimeLabel() {
    const elapsedMs = state.timestamps[state.frameIndex] !== undefined
      ? state.timestamps[state.frameIndex] - state.startTs
      : 0;
    els.timeLabel.textContent = `${formatClock(elapsedMs)} / ${formatClock(state.durationMs)}`;
  }

  function seekToElapsed(elapsedMs) {
    const clamped = Math.max(0, Math.min(elapsedMs, state.durationMs));
    state.frameIndex = findNearestIndex(clamped);

    if (window.Scene3D) {
      window.Scene3D.renderFrameAt(state.samples, state.frameIndex, state.role);
    }

    els.scrubber.value = String(Math.round(clamped));
    updateTimeLabel();
    redrawChart();
  }

  function stepPlayback() {
    if (!state.playing) return;

    const now = performance.now();
    const elapsed = state.playRefElapsedMs + (now - state.playRefWallMs);

    if (elapsed >= state.durationMs) {
      seekToElapsed(state.durationMs);
      pause();
      return;
    }

    seekToElapsed(elapsed);
    state.rafHandle = requestAnimationFrame(stepPlayback);
  }

  function play() {
    if (state.playing || state.samples.length < 2) return;
    if (window.Scene3D) window.Scene3D.setAutoRotate(false);

    state.playing = true;
    const currentElapsed = state.timestamps[state.frameIndex] !== undefined
      ? state.timestamps[state.frameIndex] - state.startTs
      : 0;

    state.playRefElapsedMs = currentElapsed >= state.durationMs ? 0 : currentElapsed;
    state.playRefWallMs = performance.now();
    els.btnPlay.textContent = "\u23F8 PAUSE";
    state.rafHandle = requestAnimationFrame(stepPlayback);
  }

  function pause() {
    state.playing = false;
    if (state.rafHandle) cancelAnimationFrame(state.rafHandle);
    state.rafHandle = null;
    els.btnPlay.textContent = "\u25B6 ABSPIELEN";
    if (window.Scene3D) window.Scene3D.setAutoRotate(true);
  }

  function togglePlay() {
    if (state.playing) pause();
    else play();
  }

  function loadSession(session) {
    pause();

    const analysis = window.Analysis;
    const rawSamples = Array.isArray(session?.samples) ? session.samples : [];
    const role = session?.primaryRole || "back-main";

    state.session = session;
    state.role = role;
    state.samples = analysis
      ? rawSamples.map(sample => analysis.normalizePacket(sample, role)).sort((a, b) => a.timestamp - b.timestamp)
      : rawSamples;
    state.timestamps = state.samples.map(sample => sample.timestamp);
    state.events = analysis ? analysis.detectMotionEvents(rawSamples, role) : [];

    const enoughData = state.samples.length >= 5;

    if (!enoughData) {
      els.empty.hidden = false;
      els.body.hidden = true;
      setQualityBadge(null);
      return;
    }

    els.empty.hidden = true;
    els.body.hidden = false;

    state.startTs = state.timestamps[0];
    state.durationMs = Math.max(1, state.timestamps[state.timestamps.length - 1] - state.startTs);
    state.frameIndex = 0;

    els.scrubber.min = "0";
    els.scrubber.max = String(Math.round(state.durationMs));
    els.scrubber.value = "0";

    const quality = analysis ? analysis.calculateQuality(rawSamples) : null;
    setQualityBadge(quality);

    if (window.Scene3D && els.sceneSlot) {
      window.Scene3D.onReparent && window.Scene3D.onReparent();
    }

    ensureChart();
    renderEvents();
    seekToElapsed(0);
  }

  function moveSceneIn() {
    const canvas = document.getElementById("scene3dCanvas");
    if (canvas && els.sceneSlot && canvas.parentElement !== els.sceneSlot) {
      els.sceneSlot.appendChild(canvas);
      if (window.Scene3D) window.Scene3D.onReparent();
    }
  }

  function restoreSceneHome() {
    const canvas = document.getElementById("scene3dCanvas");
    const home = document.getElementById("scene3dHomeSlot");
    if (canvas && home && canvas.parentElement !== home) {
      home.appendChild(canvas);
      if (window.Scene3D) {
        window.Scene3D.setAutoRotate(true);
        window.Scene3D.onReparent();
      }
    }
  }

  function open(options = {}) {
    if (!els.dialog) return;

    state.activeCandidate = options.activeSession || null;
    const preferredSession = renderSourceSelect(options.preferredValue || (state.activeCandidate ? "active" : "reference"));

    moveSceneIn();

    if (preferredSession) {
      loadSession(preferredSession);
    } else {
      els.empty.hidden = false;
      els.body.hidden = true;
      setQualityBadge(null);
    }

    state.open = true;
    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
  }

  function close() {
    pause();
    state.open = false;
    if (els.dialog && els.dialog.open) els.dialog.close();
    restoreSceneHome();
  }

  function onSourceChange() {
    const options = buildSessionOptions();
    const match = options.find(entry => entry.value === els.source.value);
    if (match) loadSession(match.session);
  }

  function bindEvents() {
    els.close.addEventListener("click", close);
    els.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      close();
    });
    els.btnPlay.addEventListener("click", togglePlay);
    els.scrubber.addEventListener("input", () => {
      pause();
      seekToElapsed(Number(els.scrubber.value) || 0);
    });
    els.source.addEventListener("change", onSourceChange);
  }

  function init() {
    cacheDom();
    if (!els.dialog) return;
    bindEvents();
  }

  /**
   * Erzeugt einen einfachen, abhängigkeitsfreien Sparkline-Schnappschuss der
   * Bewegungskurve (ohne Chart.js), damit dieser auch dann sicher erzeugt
   * werden kann, wenn das Motion-View-Fenster nie geöffnet wurde.
   */
  function renderTimelineSparkline(samples, role, width = 520, height = 150) {
    const analysis = window.Analysis;
    if (!analysis) return null;

    const packets = samples
      .map(sample => analysis.normalizePacket(sample, role))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (packets.length < 2) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#050807";
    ctx.fillRect(0, 0, width, height);

    const values = packets.map(analysis.calcDynamicMotion);
    const maxVal = Math.max(0.35, ...values);
    const startTs = packets[0].timestamp;
    const duration = Math.max(1, packets[packets.length - 1].timestamp - startTs);
    const padding = 10;

    ctx.beginPath();
    ctx.strokeStyle = "#00e4c6";
    ctx.lineWidth = 1.6;

    packets.forEach((packet, index) => {
      const x = padding + ((packet.timestamp - startTs) / duration) * (width - padding * 2);
      const y = height - padding - (values[index] / maxVal) * (height - padding * 2);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const events = analysis.detectMotionEvents(samples, role);
    const colors = { alert: "#ff6689", caution: "#e0ba28", stable: "#b1c86b" };

    events.forEach(event => {
      const x = padding + ((event.timestamp - startTs) / duration) * (width - padding * 2);
      ctx.beginPath();
      ctx.fillStyle = colors[event.level] || "#b1c86b";
      ctx.arc(x, padding, 2.8, 0, Math.PI * 2);
      ctx.fill();
    });

    return canvas.toDataURL("image/png");
  }

  function captureStaticSnapshot(session) {
    const analysis = window.Analysis;
    const scene3d = window.Scene3D;
    const samples = Array.isArray(session?.samples) ? session.samples : [];
    const role = session?.primaryRole || "back-main";

    if (!analysis || samples.length < 5) return null;

    const normalized = samples
      .map(sample => analysis.normalizePacket(sample, role))
      .sort((a, b) => a.timestamp - b.timestamp);

    const sceneSnapshot = scene3d
      ? scene3d.captureFrameSnapshot(normalized, normalized.length - 1, role)
      : null;

    const timeline = renderTimelineSparkline(samples, role);
    const summary = analysis.buildMotionSummary(session);

    return { scene: sceneSnapshot, timeline, summary };
  }

  return {
    init,
    open,
    close,
    captureStaticSnapshot
  };
})();
