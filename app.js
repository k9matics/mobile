"use strict";

/*
  HARNELYZER — App Controller v0.2.0
  Referenz- und Geschirrmessung plus lokale Video-Gangaufnahme.
*/

const App = (() => {
  const els = {};

  const state = {
    connected: false,
    measuring: false,
    demo: false,
    demoTimer: null,
    sessionTimer: null,
    activeStartedAt: null,
    latestPacket: null,
    chart: null,
    resultChart: null,
    chartMode: "acceleration",
    calibrationRunning: false,
    cameraStream: null,
    mediaRecorder: null,
    recordedChunks: [],
    recordedVideoUrl: null,
    cameraRecording: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    els.appName = byId("appName");
    els.appVersion = byId("appVersion");

    els.btnConnect = byId("btnConnect");
    els.btnCalib = byId("btnCalib");
    els.btnCalibStart = byId("btnCalibStart");
    els.btnCalibClose = byId("btnCalibClose");
    els.calibrationDialog = byId("calibrationDialog");
    els.calibrationHelp = byId("calibrationHelp");

    els.btnStartReference = byId("btnStartReference");
    els.btnStartHarness = byId("btnStartHarness");
    els.btnFinishSession = byId("btnFinishSession");
    els.btnDemo = byId("btnDemo");
    els.btnResetStudy = byId("btnResetStudy");

    els.dogSize = byId("dogSize");
    els.sensorPosition = byId("sensorPosition");
    els.chartMode = byId("chartMode");

    els.connectionStatus = byId("connectionStatus");
    els.sensorSlots = byId("sensorSlots");
    els.routineState = byId("routineState");
    els.stepReference = byId("stepReference");
    els.stepHarness = byId("stepHarness");
    els.stepCompare = byId("stepCompare");
    els.referenceState = byId("referenceState");
    els.harnessState = byId("harnessState");
    els.compareState = byId("compareState");
    els.routineGuide = byId("routineGuide");
    els.guideTitle = byId("guideTitle");
    els.guideText = byId("guideText");
    els.activeSessionLabel = byId("activeSessionLabel");
    els.sessionTimer = byId("sessionTimer");
    els.qualityIndicator = byId("qualityIndicator");

    els.comparisonStatus = byId("comparisonStatus");
    els.scoreFit = byId("scoreFit");
    els.scoreFitLabel = byId("scoreFitLabel");
    els.scoreStability = byId("scoreStability");
    els.scoreStabilityLabel = byId("scoreStabilityLabel");
    els.scoreMovement = byId("scoreMovement");
    els.scoreMovementLabel = byId("scoreMovementLabel");
    els.scoreSymmetry = byId("scoreSymmetry");
    els.scoreSymmetryLabel = byId("scoreSymmetryLabel");
    els.resultSummary = byId("resultSummary");
    els.scoreCards = Array.from(document.querySelectorAll(".score-card"));
    els.btnOpenResult = byId("btnOpenResult");

    els.resultDialog = byId("resultDialog");
    els.resultVerdict = byId("resultVerdict");
    els.resultRadarChart = byId("resultRadarChart");
    els.resultScoreList = byId("resultScoreList");
    els.resultDetailBody = byId("resultDetailBody");
    els.btnResultClose = byId("btnResultClose");
    els.btnResultCsv = byId("btnResultCsv");
    els.btnResultPdf = byId("btnResultPdf");

    els.kpiGait = byId("kpiGait");
    els.kpiCadence = byId("kpiCadence");
    els.kpiRegularity = byId("kpiRegularity");
    els.kpiAsymmetry = byId("kpiAsymmetry");

    els.motionValue = byId("motionValue");
    els.rollValue = byId("rollValue");
    els.pitchValue = byId("pitchValue");
    els.analysisStatus = byId("analysisStatus");
    els.debugRaw = byId("debugRaw");

    els.hudRadar = byId("hudRadar");
    els.hudCoords = byId("hudCoords");
    els.tiltValue = byId("tiltValue");
    els.sensorChart = byId("sensorChart");

    els.cameraDialog = byId("cameraDialog");
    els.cameraPreview = byId("cameraPreview");
    els.cameraPlayback = byId("cameraPlayback");
    els.cameraStatus = byId("cameraStatus");
    els.cameraSensorState = byId("cameraSensorState");
    els.btnCameraEnable = byId("btnCameraEnable");
    els.btnCameraRecord = byId("btnCameraRecord");
    els.btnCameraDiscard = byId("btnCameraDiscard");
    els.btnCameraClose = byId("btnCameraClose");
  }

  function setVersion() {
    if (!window.APP_META) return;

    if (els.appName) {
      els.appName.textContent = window.APP_META.name || "HARNELYZER";
    }

    if (els.appVersion) {
      els.appVersion.textContent = `v${window.APP_META.version || "0.2.0"}`;
    }

    document.title = `${window.APP_META.name || "HARNELYZER"} v${window.APP_META.version || "0.2.0"}`;
  }

  function createChart() {
    if (!els.sensorChart || !window.Chart) return;

    const context = els.sensorChart.getContext("2d");

    state.chart = new Chart(context, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "X",
            data: [],
            borderColor: "#e1b927",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.28
          },
          {
            label: "Y",
            data: [],
            borderColor: "#d82e61",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.28
          },
          {
            label: "Z",
            data: [],
            borderColor: "#00e6cd",
            backgroundColor: "transparent",
            borderWidth: 1.6,
            pointRadius: 0,
            tension: 0.28
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: {
            labels: {
              color: "#b9c2c8",
              boxWidth: 10,
              boxHeight: 10,
              padding: 12,
              font: {
                family: "Share Tech Mono",
                size: 10
              }
            }
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#68737b",
              maxTicksLimit: 5,
              font: {
                family: "Share Tech Mono",
                size: 9
              }
            },
            border: {
              color: "rgba(112, 128, 137, 0.22)"
            },
            grid: {
              color: "rgba(111, 129, 138, 0.12)"
            }
          },
          y: {
            ticks: {
              color: "#68737b",
              font: {
                family: "Share Tech Mono",
                size: 9
              }
            },
            border: {
              color: "rgba(112, 128, 137, 0.22)"
            },
            grid: {
              color: "rgba(111, 129, 138, 0.12)"
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

  function getChartValues(packet) {
    const safePacket = Analysis.normalizePacket(packet);

    if (state.chartMode === "gyro") {
      return [
        safePacket.gyroX || 0,
        safePacket.gyroY || 0,
        safePacket.gyroZ || 0
      ];
    }

    if (state.chartMode === "tilt") {
      return [
        Analysis.calcRoll(safePacket),
        Analysis.calcPitch(safePacket),
        Analysis.calcDynamicMotion(safePacket)
      ];
    }

    return [
      safePacket.accX,
      safePacket.accY,
      safePacket.accZ
    ];
  }

  function pushChartSample(packet) {
    if (!state.chart) return;

    const values = getChartValues(packet);
    const label = new Date(packet.timestamp || Date.now())
      .toLocaleTimeString([], {
        minute: "2-digit",
        second: "2-digit"
      });

    state.chart.data.labels.push(label);

    state.chart.data.datasets.forEach((dataset, index) => {
      dataset.data.push(values[index]);
    });

    const maxSamples = 56;

    if (state.chart.data.labels.length > maxSamples) {
      state.chart.data.labels.shift();

      state.chart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }

    state.chart.update("none");
  }

  function updateRadar(packet) {
    const safePacket = Analysis.normalizePacket(packet);
    const x = Math.max(-1.4, Math.min(1.4, safePacket.accX));
    const y = Math.max(-1.4, Math.min(1.4, safePacket.accY));
    const roll = Analysis.calcRoll(safePacket);
    const pitch = Analysis.calcPitch(safePacket);
    const tilt = Math.sqrt(roll * roll + pitch * pitch);

    if (els.hudRadar) {
      const level = tilt < 8 ? "stable" : tilt < 18 ? "caution" : "alert";
      els.hudRadar.dataset.level = level;
      els.hudRadar.setAttribute(
        "aria-label",
        `Kamera für Gangaufnahme öffnen. Aktuelle Neigung ${tilt.toFixed(1)} Grad.`
      );
    }

    if (els.hudCoords) {
      els.hudCoords.textContent = `X:${x.toFixed(2)} Y:${y.toFixed(2)}`;
    }

    if (els.tiltValue) {
      els.tiltValue.textContent = `TILT: ${tilt.toFixed(1)}°`;
    }

    if (els.cameraSensorState) {
      els.cameraSensorState.textContent = state.connected
        ? `LIVE · ${tilt.toFixed(1)}°`
        : `OFFLINE · ${tilt.toFixed(1)}°`;
    }
  }

  function updateLiveMetrics(packet) {
    const result = Analysis.summarize(packet);

    if (els.kpiGait) els.kpiGait.textContent = result.gait;
    if (els.kpiCadence) els.kpiCadence.textContent = String(result.cadence);
    if (els.kpiRegularity) els.kpiRegularity.textContent = `${result.regularity}%`;
    if (els.kpiAsymmetry) els.kpiAsymmetry.textContent = `${result.asymmetry}%`;

    if (els.motionValue) {
      els.motionValue.textContent = `${result.motion.toFixed(2)} g`;
    }

    if (els.rollValue) {
      els.rollValue.textContent = `${result.roll.toFixed(1)}°`;
    }

    if (els.pitchValue) {
      els.pitchValue.textContent = `${result.pitch.toFixed(1)}°`;
    }

    if (els.debugRaw) {
      els.debugRaw.textContent = packet.raw || "LIVE DATA";
    }
  }

  function handlePacket(packet) {
    const normalized = Analysis.normalizePacket(
      packet,
      getSelectedRole()
    );

    state.latestPacket = normalized;

    updateRadar(normalized);
    updateLiveMetrics(normalized);
    pushChartSample(normalized);

    if (!state.measuring) return;

    Storage.appendSample(normalized);
    updateActiveQuality();
  }

  function getSelectedRole() {
    return els.sensorPosition?.value || "back-main";
  }

  function getSelectedDogSize() {
    return els.dogSize?.value || "medium";
  }

  function setConnectionUi(connected, label = "OFFLINE") {
    state.connected = connected;

    if (els.btnConnect) {
      els.btnConnect.classList.toggle("is-connected", connected);
      els.btnConnect.textContent = connected ? "VERBUNDEN" : "SENSOR";
    }

    if (els.connectionStatus) {
      els.connectionStatus.textContent = connected ? "ONLINE" : label;
      els.connectionStatus.classList.toggle("is-online", connected);
      els.connectionStatus.classList.toggle("is-error", !connected && label !== "OFFLINE");
    }

    if (els.cameraSensorState && !state.latestPacket) {
      els.cameraSensorState.textContent = connected ? "LIVE · BEREIT" : "OFFLINE";
    }

    renderSensorSlots();
    renderRoutine();
  }

  function renderSensorSlots() {
    if (!els.sensorSlots) return;

    const info = Sensor.getInfo ? Sensor.getInfo() : {};
    const roles = Analysis.getSupportedSensorRoles();

    els.sensorSlots.innerHTML = roles
      .filter(role => role.id === "back-main" || role.id === "pelvis" || role.id === "front-left")
      .map(role => {
        const isPrimary = role.id === getSelectedRole();
        const isConnected = state.connected && isPrimary;
        const stateText = isConnected
          ? "VERBUNDEN"
          : role.required
            ? "BEREIT"
            : "SPÄTER";

        return `
          <div class="sensor-slot ${isConnected ? "is-connected" : ""} ${isPrimary ? "is-active" : ""}">
            <span class="sensor-dot"></span>
            <span class="sensor-role">${role.name.toUpperCase()}</span>
            <span class="sensor-state">${stateText}</span>
          </div>
        `;
      })
      .join("");

    if (state.connected && info.name && els.debugRaw) {
      els.debugRaw.textContent = `SENSOR: ${info.name} / ROLLE: ${getSelectedRole()}`;
    }
  }

  function getRoutineMode() {
    const active = Storage.getActiveSession();

    if (active?.status === "recording") {
      return active.type === "reference" ? "recording-reference" : "recording-harness";
    }

    const reference = Storage.getReference();
    const latestTest = Storage.getLatestHarnessTest();

    if (!reference) return "reference";
    if (!latestTest) return "harness";
    return "compare";
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setStepState(element, stateText, active, done) {
    if (!element) return;

    element.classList.toggle("is-active", active);
    element.classList.toggle("is-done", done);

    const stateElement = element.querySelector(".step-state");
    if (stateElement) stateElement.textContent = stateText;
  }

  function renderRoutine() {
    const mode = getRoutineMode();
    const reference = Storage.getReference();
    const latestTest = Storage.getLatestHarnessTest();
    const active = Storage.getActiveSession();

    const referenceDone = Boolean(reference);
    const harnessDone = Boolean(latestTest);
    const recording = Boolean(active?.status === "recording");

    setStepState(
      els.stepReference,
      referenceDone ? "FERTIG" : recording && active?.type === "reference" ? "LÄUFT" : "OFFEN",
      mode === "reference" || mode === "recording-reference",
      referenceDone
    );

    setStepState(
      els.stepHarness,
      harnessDone ? "FERTIG" : !referenceDone ? "GESPERRT" : recording && active?.type === "harness" ? "LÄUFT" : "OFFEN",
      mode === "harness" || mode === "recording-harness",
      harnessDone
    );

    setStepState(
      els.stepCompare,
      harnessDone ? "BEREIT" : "WARTET",
      mode === "compare",
      harnessDone
    );

    if (mode === "reference") {
      setText(els.routineState, "SCHRITT 1 / 3");
      setText(els.guideTitle, "REFERENZ OHNE GESCHIRR");
      setText(
        els.guideText,
        "Befestige den Sensor sicher am Rücken. Lass den Hund 20–40 Sekunden entspannt und natürlich laufen."
      );
    }

    if (mode === "recording-reference") {
      setText(els.routineState, "REFERENZ LÄUFT");
      setText(els.guideTitle, "REFERENZ WIRD AUFGEZEICHNET");
      setText(
        els.guideText,
        "Normales Tempo genügt. Die App bewertet die Messqualität automatisch und sucht brauchbare Laufphasen."
      );
    }

    if (mode === "harness") {
      setText(els.routineState, "SCHRITT 2 / 3");
      setText(els.guideTitle, "GESCHIRR ANLEGEN");
      setText(
        els.guideText,
        "Lege jetzt das zu testende Geschirr an. Nutze möglichst dieselbe Strecke, aber der Hund muss nicht exakt gleich laufen."
      );
    }

    if (mode === "recording-harness") {
      setText(els.routineState, "TEST LÄUFT");
      setText(els.guideTitle, active?.label || "GESCHIRR-TEST");
      setText(
        els.guideText,
        "Lass den Hund wieder natürlich laufen. Wir vergleichen später nur ähnliche und ausreichend ruhige Bewegungsphasen."
      );
    }

    if (mode === "compare") {
      setText(els.routineState, "SCHRITT 3 / 3");
      setText(els.guideTitle, "VERGLEICH BEREIT");
      setText(
        els.guideText,
        "Referenz und Geschirrtest sind gespeichert. Du kannst Test B oder C starten, um weitere Einstellungen zu vergleichen."
      );
    }

    if (els.btnStartReference) {
      els.btnStartReference.disabled = recording || referenceDone;
      els.btnStartReference.textContent = referenceDone
        ? "REFERENZ GESPEICHERT"
        : "REFERENZ STARTEN";
    }

    if (els.btnStartHarness) {
      els.btnStartHarness.disabled = recording || !referenceDone;
      els.btnStartHarness.textContent = harnessDone
        ? `TEST ${Storage.getNextHarnessLetter()} STARTEN`
        : "TEST A STARTEN";
    }

    if (els.btnFinishSession) {
      els.btnFinishSession.disabled = !recording;
    }

    if (!recording) {
      setText(
        els.activeSessionLabel,
        referenceDone
          ? harnessDone
            ? "VERGLEICH VERFÜGBAR"
            : "BEREIT FÜR GESCHIRR-TEST"
          : "BEREIT FÜR REFERENZ"
      );
    }

    if (!referenceDone) {
      setText(els.comparisonStatus, "REFERENZ AUSSTEHEND");
    } else if (!harnessDone) {
      setText(els.comparisonStatus, "TEST A AUSSTEHEND");
    }
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");

    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, "0");

    return `${minutes}:${seconds}`;
  }

  function startTimer() {
    stopTimer();
    state.activeStartedAt = Date.now();

    const tick = () => {
      if (!state.activeStartedAt) return;

      const elapsed = (Date.now() - state.activeStartedAt) / 1000;
      setText(els.sessionTimer, formatTime(elapsed));
    };

    tick();
    state.sessionTimer = window.setInterval(tick, 500);
  }

  function stopTimer() {
    if (state.sessionTimer) {
      window.clearInterval(state.sessionTimer);
      state.sessionTimer = null;
    }

    state.activeStartedAt = null;
  }

  function getCurrentSessionAnalysis() {
    const session = Storage.getActiveSession();

    if (!session) return null;
    return Analysis.analyzeSession(session);
  }

  function updateActiveQuality() {
    const analysis = getCurrentSessionAnalysis();

    if (!analysis?.quality) return;

    const { score, label, advice } = analysis.quality;

    setText(els.qualityIndicator, `QUALITÄT: ${label} ${score}%`);
    els.qualityIndicator?.classList.toggle("is-good", score >= 75);
    els.qualityIndicator?.classList.toggle("is-warn", score >= 50 && score < 75);
    els.qualityIndicator?.classList.toggle("is-bad", score < 50);

    setText(els.activeSessionLabel, `${analysis.label} · ${analysis.metrics.sampleCount} PAKETE`);

    if (els.analysisStatus) {
      els.analysisStatus.textContent = score >= 50 ? "MESSUNG" : "DATEN PRÜFEN";
    }

    if (els.debugRaw && score < 50) {
      els.debugRaw.textContent = advice;
    }
  }

  function startSession(type) {
    if (state.measuring) return;

    if (!state.connected && !state.demo) {
      setText(els.analysisStatus, "SENSOR VERBINDEN");
      setText(els.debugRaw, "ERST SENSOR VERBINDEN ODER DEMO STARTEN");
      return;
    }

    const isReference = type === "reference";
    const testLetter = Storage.getNextHarnessLetter();

    Storage.setDogProfile({
      size: getSelectedDogSize()
    });

    const session = Storage.startSession({
      type,
      label: isReference
        ? "REFERENZ OHNE GESCHIRR"
        : `GESCHIRR TEST ${testLetter}`,
      primaryRole: getSelectedRole(),
      sensorRoles: [getSelectedRole()],
      dogSize: getSelectedDogSize(),
      harnessName: isReference ? "" : `GESCHIRR ${testLetter}`
    });

    state.measuring = true;
    clearChart();
    startTimer();
    renderRoutine();

    setText(els.analysisStatus, "MESSUNG");
    setText(els.activeSessionLabel, session.label);
    setText(els.qualityIndicator, "QUALITÄT: SAMMLE DATEN");
    setText(
      els.debugRaw,
      isReference
        ? "REFERENZ LÄUFT: OHNE GESCHIRR"
        : "GESCHIRR-TEST LÄUFT"
    );
  }

  function finishSession() {
    if (!state.measuring) return;

    const active = Storage.getActiveSession();
    const analysis = active ? Analysis.analyzeSession(active) : null;
    const finished = Storage.finishActiveSession(analysis);

    state.measuring = false;
    stopTimer();

    if (!finished || !analysis) {
      setText(els.analysisStatus, "KEINE DATEN");
      renderRoutine();
      return;
    }

    if (!analysis.usable) {
      setText(els.analysisStatus, "MESSUNG ZU KURZ");
      setText(els.debugRaw, analysis.quality.advice);
      setText(
        els.resultSummary,
        "Diese Messung wurde gespeichert, ist für einen belastbaren Vergleich aber noch zu kurz oder zu unruhig."
      );
    } else {
      setText(els.analysisStatus, "MESSUNG GESPEICHERT");
      setText(els.debugRaw, analysis.summary);
    }

    renderRoutine();
    renderComparison();

    if (finished.type === "reference") {
      setText(
        els.resultSummary,
        analysis.usable
          ? "Referenz gespeichert. Lege nun das Geschirr an und starte Test A."
          : "Referenz gespeichert, aber Messqualität noch niedrig. Für einen besseren Vergleich bitte Referenz wiederholen."
      );
    } else {
      maybeAutoOpenResultDialog();
    }
  }

  function maybeAutoOpenResultDialog() {
    const reference = Storage.getReference();
    const harness = Storage.getLatestHarnessTest();

    if (!reference || !harness) return;

    const comparison = Analysis.compareSessions(reference, harness);
    if (!comparison.ready) return;

    openResultDialog();
  }

  function renderScore(valueElement, labelElement, result) {
    if (!valueElement || !labelElement) return;

    valueElement.textContent = `${result.score}`;
    labelElement.textContent = result.label;

    valueElement.parentElement?.classList.toggle("is-good", result.score >= 70);
    valueElement.parentElement?.classList.toggle(
      "is-warning",
      result.score >= 55 && result.score < 70
    );
    valueElement.parentElement?.classList.toggle("is-danger", result.score < 55);
  }

  function resetScores() {
    const values = [
      [els.scoreFit, els.scoreFitLabel, "REFERENZ ERFORDERLICH"],
      [els.scoreStability, els.scoreStabilityLabel, "—"],
      [els.scoreMovement, els.scoreMovementLabel, "—"],
      [els.scoreSymmetry, els.scoreSymmetryLabel, "—"]
    ];

    values.forEach(([valueElement, labelElement, label]) => {
      if (valueElement) valueElement.textContent = "—";
      if (labelElement) labelElement.textContent = label;

      valueElement?.parentElement?.classList.remove(
        "is-good",
        "is-warning",
        "is-danger"
      );
    });
  }

  function renderComparison() {
    const reference = Storage.getReference();
    const harness = Storage.getLatestHarnessTest();

    if (!reference || !harness) {
      resetScores();
      return;
    }

    const comparison = Analysis.compareSessions(reference, harness);

    if (!comparison.ready) {
      resetScores();
      setText(els.comparisonStatus, "DATEN PRÜFEN");
      setText(els.resultSummary, comparison.summary);
      return;
    }

    renderScore(els.scoreFit, els.scoreFitLabel, comparison.passform);
    renderScore(els.scoreStability, els.scoreStabilityLabel, comparison.stability);
    renderScore(els.scoreMovement, els.scoreMovementLabel, comparison.movement);
    renderScore(els.scoreSymmetry, els.scoreSymmetryLabel, comparison.symmetry);

    setText(els.comparisonStatus, `TEST ${harness.label.replace("GESCHIRR TEST ", "")} ANALYSIERT`);
    setText(els.resultSummary, comparison.summary);
  }

  function scoreTier(score) {
    if (score >= 70) return "is-good";
    if (score >= 55) return "is-warning";
    return "is-danger";
  }

  function formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round((durationMs || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function renderResultScoreList(comparison, hasReference) {
    if (!els.resultScoreList) return;

    const rows = [
      ["fit", comparison?.ready ? comparison.passform : null, hasReference ? "GESCHIRRTEST ERFORDERLICH" : "REFERENZ ERFORDERLICH"],
      ["stability", comparison?.ready ? comparison.stability : null, "—"],
      ["movement", comparison?.ready ? comparison.movement : null, "—"],
      ["symmetry", comparison?.ready ? comparison.symmetry : null, "—"]
    ];

    rows.forEach(([key, result, fallback]) => {
      const row = els.resultScoreList.querySelector(`[data-score="${key}"]`);
      if (!row) return;

      const valueElement = row.querySelector("strong");
      const labelElement = row.querySelector("small");

      row.classList.remove("is-good", "is-warning", "is-danger");

      if (result) {
        if (valueElement) valueElement.textContent = `${result.score}`;
        if (labelElement) labelElement.textContent = result.label;
        row.classList.add(scoreTier(result.score));
      } else {
        if (valueElement) valueElement.textContent = "—";
        if (labelElement) labelElement.textContent = fallback;
      }
    });
  }

  function renderResultDetailTable(comparison, reference, harness) {
    if (!els.resultDetailBody) return;

    const referenceAnalysis = comparison?.reference || reference?.analysis || null;
    const harnessAnalysis = comparison?.harness || harness?.analysis || null;

    const rows = [];

    [referenceAnalysis, harnessAnalysis].forEach(analysis => {
      if (!analysis) return;

      rows.push(`
        <tr>
          <td>${analysis.label}</td>
          <td>${analysis.gait}</td>
          <td>${analysis.cadence}/min</td>
          <td>${formatDuration(analysis.metrics?.durationMs)}</td>
          <td>${analysis.quality?.label} (${analysis.quality?.score ?? 0}%)</td>
        </tr>
      `);
    });

    els.resultDetailBody.innerHTML = rows.length > 0
      ? rows.join("")
      : `<tr><td colspan="5">Keine Messdaten vorhanden.</td></tr>`;
  }

  function renderResultRadarChart(comparison) {
    if (!els.resultRadarChart || !window.Chart) return;

    const scores = comparison?.ready
      ? [
          comparison.passform.score,
          comparison.stability.score,
          comparison.movement.score,
          comparison.symmetry.score
        ]
      : [0, 0, 0, 0];

    if (!state.resultChart) {
      const context = els.resultRadarChart.getContext("2d");

      state.resultChart = new Chart(context, {
        type: "radar",
        data: {
          labels: ["PASSFORM", "STABILITÄT", "LAUFBILD", "SYMMETRIE"],
          datasets: [
            {
              label: "BEWERTUNG",
              data: scores,
              borderColor: "#00e4c6",
              backgroundColor: "rgba(0, 228, 198, 0.18)",
              borderWidth: 1.6,
              pointBackgroundColor: "#65ffe6",
              pointRadius: 3
            }
          ]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
          },
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: 25,
                backdropColor: "transparent",
                color: "#68737b",
                font: { family: "Share Tech Mono", size: 8 }
              },
              grid: { color: "rgba(112, 128, 137, 0.22)" },
              angleLines: { color: "rgba(112, 128, 137, 0.22)" },
              pointLabels: {
                color: "#b9c2c8",
                font: { family: "Share Tech Mono", size: 10 }
              }
            }
          }
        }
      });
    } else {
      state.resultChart.data.datasets[0].data = scores;
      state.resultChart.update("none");
    }
  }

  function renderResultDialog() {
    const reference = Storage.getReference();
    const harness = Storage.getLatestHarnessTest();
    const comparison = reference && harness
      ? Analysis.compareSessions(reference, harness)
      : null;

    renderResultScoreList(comparison, Boolean(reference));
    renderResultDetailTable(comparison, reference, harness);
    renderResultRadarChart(comparison);

    if (els.resultVerdict) {
      els.resultVerdict.classList.remove("is-good", "is-warning", "is-danger");

      if (!reference || !harness) {
        els.resultVerdict.textContent = "Für einen Testbericht wird eine Referenzmessung und mindestens ein Geschirrtest benötigt.";
      } else if (!comparison.ready) {
        els.resultVerdict.textContent = comparison.summary;
      } else {
        els.resultVerdict.textContent = comparison.summary;
        els.resultVerdict.classList.add(scoreTier(comparison.passform.score));
      }
    }
  }

  function openResultDialog() {
    renderResultDialog();

    if (els.resultDialog && typeof els.resultDialog.showModal === "function" && !els.resultDialog.open) {
      els.resultDialog.showModal();
    }
  }

  function closeResultDialog() {
    if (els.resultDialog?.open) {
      els.resultDialog.close();
    }
  }

  async function onConnectClick() {
    try {
      if (Sensor.isConnected()) {
        await Sensor.disconnect();
        setConnectionUi(false, "GETRENNT");
        setText(els.analysisStatus, "GETRENNT");
        return;
      }

      setText(els.analysisStatus, "SENSOR WÄHLEN");
      await Sensor.connect({
        role: getSelectedRole()
      });

      setConnectionUi(true);
      setText(els.analysisStatus, "BEREIT");
    } catch (error) {
      console.error(error);
      setConnectionUi(false, "FEHLER");
      setText(els.analysisStatus, "BT FEHLER");
      setText(els.debugRaw, String(error.message || error));
    }
  }

  function openCalibrationDialog() {
    if (!state.connected && !state.demo) {
      setText(els.analysisStatus, "SENSOR FEHLT");
      setText(els.debugRaw, "ERST SENSOR VERBINDEN ODER DEMO NUTZEN");
      return;
    }

    if (!els.calibrationDialog) return;

    setText(
      els.calibrationHelp,
      "Der Hund sollte ruhig auf ebenem Boden stehen. Erst danach starten."
    );

    els.calibrationDialog.showModal();
  }

  async function startCalibration() {
    if (state.calibrationRunning) return;

    state.calibrationRunning = true;

    if (els.btnCalibStart) {
      els.btnCalibStart.disabled = true;
      els.btnCalibStart.textContent = "KALIBRIERE...";
    }

    setText(els.calibrationHelp, "Bitte Hund und Sensor drei Sekunden ruhig halten.");
    setText(els.analysisStatus, "KALIBRIERUNG");

    try {
      if (!state.demo) {
        await Sensor.calibrate({ role: getSelectedRole() });
      }

      await new Promise(resolve => window.setTimeout(resolve, 3000));

      setText(els.calibrationHelp, "Kalibrierung abgeschlossen.");
      setText(els.analysisStatus, "KALIBRIERT");
      setText(els.debugRaw, `KALIBRIERT: ${getSelectedRole()}`);

      window.setTimeout(() => {
        if (els.calibrationDialog?.open) {
          els.calibrationDialog.close();
        }
      }, 700);
    } catch (error) {
      console.error(error);
      setText(els.calibrationHelp, `Fehler: ${error.message || error}`);
      setText(els.analysisStatus, "CAL FEHLER");
    } finally {
      state.calibrationRunning = false;

      if (els.btnCalibStart) {
        els.btnCalibStart.disabled = false;
        els.btnCalibStart.textContent = "JETZT KALIBRIEREN";
      }
    }
  }

  function setCameraStatus(message, tone = "default") {
    if (!els.cameraStatus) return;

    els.cameraStatus.textContent = message;
    els.cameraStatus.classList.toggle("is-error", tone === "error");
    els.cameraStatus.classList.toggle("is-recording", tone === "recording");
  }

  function isCameraSupported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  function revokeRecordedVideo() {
    if (!state.recordedVideoUrl) return;

    URL.revokeObjectURL(state.recordedVideoUrl);
    state.recordedVideoUrl = null;
  }

  function resetCameraPlayback() {
    revokeRecordedVideo();
    state.recordedChunks = [];

    if (els.cameraPlayback) {
      els.cameraPlayback.pause();
      els.cameraPlayback.removeAttribute("src");
      els.cameraPlayback.hidden = true;
      els.cameraPlayback.load();
    }

    if (els.cameraPreview) {
      els.cameraPreview.hidden = false;
    }

    if (els.btnCameraDiscard) {
      els.btnCameraDiscard.disabled = true;
    }
  }

  function stopCameraStream() {
    if (state.mediaRecorder?.state === "recording") {
      state.mediaRecorder.stop();
    }

    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
    }

    if (els.cameraPreview) {
      els.cameraPreview.srcObject = null;
    }

    state.mediaRecorder = null;
    state.cameraRecording = false;

    if (els.btnCameraRecord) {
      els.btnCameraRecord.disabled = true;
      els.btnCameraRecord.textContent = "AUFNAHME STARTEN";
    }

    if (els.btnCameraEnable) {
      els.btnCameraEnable.textContent = "KAMERA AKTIVIEREN";
    }
  }

  function closeCameraDialog() {
    stopCameraStream();

    if (els.cameraDialog?.open) {
      els.cameraDialog.close();
    }
  }

  function openCameraDialog() {
    if (!els.cameraDialog) return;

    if (!els.cameraDialog.open) {
      els.cameraDialog.showModal();
    }

    resetCameraPlayback();

    if (!isCameraSupported()) {
      setCameraStatus(
        "Kameraaufnahme wird von diesem Browser nicht unterstützt. Die Sensormessung bleibt verfügbar.",
        "error"
      );

      if (els.btnCameraEnable) els.btnCameraEnable.disabled = true;
      return;
    }

    if (els.btnCameraEnable) els.btnCameraEnable.disabled = false;
    setCameraStatus("Kamera erst aktivieren, wenn du bereit bist. Die Sensormessung bleibt unabhängig verfügbar.");
  }

  async function enableCamera() {
    if (!isCameraSupported()) {
      setCameraStatus("Kameraaufnahme wird von diesem Browser nicht unterstützt.", "error");
      return;
    }

    stopCameraStream();
    resetCameraPlayback();
    setCameraStatus("Kamera wird aktiviert …");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      state.cameraStream = stream;

      if (els.cameraPreview) {
        els.cameraPreview.srcObject = stream;
        els.cameraPreview.hidden = false;
        await els.cameraPreview.play().catch(() => undefined);
      }

      if (els.btnCameraEnable) els.btnCameraEnable.textContent = "KAMERA AKTIV";
      if (els.btnCameraRecord) els.btnCameraRecord.disabled = false;
      setCameraStatus("Kamera bereit. Seitlich filmen und dann Aufnahme starten.");
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";

      setCameraStatus(
        denied
          ? "Kamera nicht freigegeben. Du kannst die Sensormessung ohne Video fortsetzen."
          : "Kamera konnte nicht gestartet werden. Prüfe Berechtigung oder ein anderes Gerät.",
        "error"
      );
    }
  }

  function selectRecorderMimeType() {
    if (!window.MediaRecorder?.isTypeSupported) return "";

    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function startCameraRecording() {
    if (!state.cameraStream || !window.MediaRecorder) {
      setCameraStatus("Bitte zuerst die Kamera aktivieren.", "error");
      return;
    }

    resetCameraPlayback();
    state.recordedChunks = [];

    try {
      const mimeType = selectRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(state.cameraStream, { mimeType })
        : new MediaRecorder(state.cameraStream);

      state.mediaRecorder = recorder;

      recorder.addEventListener("dataavailable", event => {
        if (event.data?.size) state.recordedChunks.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        const type = recorder.mimeType || "video/webm";
        const blob = new Blob(state.recordedChunks, { type });

        if (blob.size && els.cameraPlayback) {
          state.recordedVideoUrl = URL.createObjectURL(blob);
          els.cameraPlayback.src = state.recordedVideoUrl;
          els.cameraPlayback.hidden = false;
          if (els.cameraPreview) els.cameraPreview.hidden = true;
          if (els.btnCameraDiscard) els.btnCameraDiscard.disabled = false;
          setCameraStatus("Aufnahme beendet. Das Video liegt nur lokal in diesem Browser.");
        } else {
          setCameraStatus("Es wurde keine Videoaufnahme erstellt.", "error");
        }

        state.cameraRecording = false;
        state.mediaRecorder = null;

        if (els.btnCameraRecord) {
          els.btnCameraRecord.textContent = "AUFNAHME STARTEN";
        }
      });

      recorder.start(500);
      state.cameraRecording = true;

      if (els.btnCameraRecord) {
        els.btnCameraRecord.textContent = "AUFNAHME BEENDEN";
      }

      setCameraStatus("● AUFZEICHNUNG LÄUFT — Sensordaten können später zeitlich ergänzt werden.", "recording");
    } catch (error) {
      console.error(error);
      setCameraStatus("Aufnahme konnte nicht gestartet werden.", "error");
    }
  }

  function toggleCameraRecording() {
    if (state.cameraRecording && state.mediaRecorder?.state === "recording") {
      state.mediaRecorder.stop();
      return;
    }

    startCameraRecording();
  }

  function discardCameraRecording() {
    resetCameraPlayback();

    if (state.cameraStream && els.cameraPreview) {
      els.cameraPreview.hidden = false;
    }

    setCameraStatus("Aufnahme verworfen. Kamera bleibt für eine neue Aufnahme bereit.");
  }

  function makeDemoPacket() {
    const now = Date.now();
    const t = now / 360;
    const cadenceFactor = 1.55;

    return {
      timestamp: now,
      sensorId: "demo-back-01",
      role: getSelectedRole(),
      accX: Math.sin(t * cadenceFactor) * 0.24 + Math.sin(t * 0.37) * 0.04,
      accY: Math.cos(t * cadenceFactor * 0.92) * 0.20,
      accZ: 1 + Math.sin(t * cadenceFactor * 2) * 0.32,
      gyroX: Math.sin(t * 1.3) * 28,
      gyroY: Math.cos(t * 1.1) * 22,
      gyroZ: Math.sin(t * 0.85) * 16,
      packetType: "demo-imu",
      raw: "DEMO: NATÜRLICHER LAUFZYKLUS"
    };
  }

  function toggleDemo() {
    state.demo = !state.demo;

    if (els.btnDemo) {
      els.btnDemo.classList.toggle("is-active", state.demo);
      els.btnDemo.textContent = state.demo ? "DEMO AKTIV" : "DEMO";
    }

    if (!state.demo) {
      window.clearInterval(state.demoTimer);
      state.demoTimer = null;

      if (!state.connected) {
        setText(els.analysisStatus, "BEREIT");
      }

      return;
    }

    setText(els.analysisStatus, "DEMO BEREIT");

    state.demoTimer = window.setInterval(() => {
      handlePacket(makeDemoPacket());
    }, 100);
  }

  function downloadCsv() {
    const study = Storage.getStudy();
    const rows = [];

    const addSessionRows = session => {
      if (!session?.samples?.length) return;

      session.samples.forEach(sample => {
        rows.push({
          sessionId: session.id,
          sessionType: session.type,
          sessionLabel: session.label,
          timestamp: sample.timestamp,
          sensorId: sample.sensorId,
          role: sample.role,
          accX: sample.accX,
          accY: sample.accY,
          accZ: sample.accZ,
          gyroX: sample.gyroX,
          gyroY: sample.gyroY,
          gyroZ: sample.gyroZ,
          raw: sample.raw
        });
      });
    };

    addSessionRows(study.reference);
    study.harnessTests.forEach(addSessionRows);

    if (rows.length === 0) {
      setText(els.debugRaw, "KEINE GESPEICHERTEN MESSDATEN");
      return;
    }

    const header = [
      "sessionId",
      "sessionType",
      "sessionLabel",
      "timestamp",
      "sensorId",
      "role",
      "accX",
      "accY",
      "accZ",
      "gyroX",
      "gyroY",
      "gyroZ",
      "raw"
    ];

    const csvRows = rows.map(row =>
      header
        .map(column => {
          const value = String(row[column] ?? "").replace(/"/g, "\"\"");
          return `"${value}"`;
        })
        .join(",")
    );

    const blob = new Blob(
      [[header.join(","), ...csvRows].join("\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `harnelyzer-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 250);

    setText(els.debugRaw, "CSV EXPORT GESTARTET");
  }

  function exportPdf() {
    try {
      const study = Storage.getStudy();
      const reference = Storage.getReference();
      const harness = Storage.getLatestHarnessTest();

      const comparison = reference && harness
        ? Analysis.compareSessions(reference, harness)
        : null;

      if (window.PDFExport && typeof window.PDFExport.create === "function") {
        window.PDFExport.create({
          appMeta: window.APP_META,
          study,
          reference,
          harness,
          comparison,
          latest: state.latestPacket
        });

        setText(els.debugRaw, "PDF EXPORT GESTARTET");
        return;
      }

      setText(els.debugRaw, "PDF MODUL NICHT VERFÜGBAR");
    } catch (error) {
      console.error(error);
      setText(els.debugRaw, `PDF FEHLER: ${error.message || error}`);
    }
  }

  function resetStudy() {
    if (state.measuring) {
      finishSession();
    }

    Storage.clearStudy();
    stopTimer();
    clearChart();
    resetScores();

    state.latestPacket = null;
    state.measuring = false;

    if (els.hudRadar) {
      els.hudRadar.dataset.level = "stable";
      els.hudRadar.setAttribute("aria-label", "Kamera für Gangaufnahme öffnen");
    }

    setText(els.hudCoords, "X:0.00 Y:0.00");
    setText(els.tiltValue, "TILT: 0.0°");
    setText(els.kpiGait, "—");
    setText(els.kpiCadence, "0");
    setText(els.kpiRegularity, "0%");
    setText(els.kpiAsymmetry, "0%");
    setText(els.motionValue, "0.00 g");
    setText(els.rollValue, "0.0°");
    setText(els.pitchValue, "0.0°");
    setText(els.analysisStatus, "BEREIT");
    setText(els.debugRaw, "NEUE STUDIE BEREIT");
    setText(els.sessionTimer, "00:00");
    setText(els.qualityIndicator, "QUALITÄT: WARTET");
    setText(
      els.resultSummary,
      "Starte mit einer Referenzmessung ohne Geschirr. Die App vergleicht später nur ausreichend ähnliche Bewegungsphasen."
    );

    renderRoutine();
    renderSensorSlots();
  }

  function onSensorRoleChange() {
    if (state.measuring) {
      setText(els.debugRaw, "SENSORROLLE ERST NACH DER MESSUNG ÄNDERN");
      if (els.sensorPosition && state.latestPacket?.role) {
        els.sensorPosition.value = state.latestPacket.role;
      }
      return;
    }

    renderSensorSlots();

    if (state.connected) {
      setText(
        els.debugRaw,
        `AKTIVE ROLLE: ${getSelectedRole()} — FÜR NEUE VERBINDUNG ÜBERNEHMEN`
      );
    }
  }

  function onRadarKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openCameraDialog();
  }

  function bindEvents() {
    els.btnConnect?.addEventListener("click", onConnectClick);
    els.btnCalib?.addEventListener("click", openCalibrationDialog);
    els.btnCalibStart?.addEventListener("click", startCalibration);

    els.btnStartReference?.addEventListener("click", () => {
      startSession("reference");
    });

    els.btnStartHarness?.addEventListener("click", () => {
      startSession("harness");
    });

    els.btnFinishSession?.addEventListener("click", finishSession);
    els.btnDemo?.addEventListener("click", toggleDemo);
    els.btnResetStudy?.addEventListener("click", resetStudy);

    els.btnOpenResult?.addEventListener("click", openResultDialog);
    els.btnResultClose?.addEventListener("click", closeResultDialog);
    els.btnResultCsv?.addEventListener("click", downloadCsv);
    els.btnResultPdf?.addEventListener("click", exportPdf);

    els.scoreCards?.forEach(card => {
      card.addEventListener("click", openResultDialog);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openResultDialog();
        }
      });
    });

    els.hudRadar?.addEventListener("click", openCameraDialog);
    els.hudRadar?.addEventListener("keydown", onRadarKeydown);
    els.btnCameraEnable?.addEventListener("click", enableCamera);
    els.btnCameraRecord?.addEventListener("click", toggleCameraRecording);
    els.btnCameraDiscard?.addEventListener("click", discardCameraRecording);
    els.btnCameraClose?.addEventListener("click", closeCameraDialog);
    els.cameraDialog?.addEventListener("close", stopCameraStream);
    els.cameraDialog?.addEventListener("cancel", event => {
      event.preventDefault();
      closeCameraDialog();
    });

    els.chartMode?.addEventListener("change", event => {
      state.chartMode = event.target.value;
      clearChart();
    });

    els.dogSize?.addEventListener("change", () => {
      Storage.setDogProfile({ size: getSelectedDogSize() });
    });

    els.sensorPosition?.addEventListener("change", onSensorRoleChange);

    Sensor.on("data", handlePacket);

    Sensor.on("status", status => {
      const message = String(status || "BEREIT");

      if (/VERBUNDEN/i.test(message) && !/GETRENNT/i.test(message)) {
        setConnectionUi(true);
      }

      if (/GETRENNT/i.test(message)) {
        setConnectionUi(false, "GETRENNT");
      }

      if (!state.measuring && els.analysisStatus) {
        els.analysisStatus.textContent = message;
      }
    });

    Sensor.on("error", message => {
      setConnectionUi(false, "FEHLER");
      setText(els.analysisStatus, "SENSOR FEHLER");
      setText(els.debugRaw, String(message || "UNBEKANNTER SENSORFEHLER"));
    });
  }

  function init() {
    cacheDom();
    setVersion();
    createChart();

    Storage.setDogProfile({
      size: getSelectedDogSize()
    });

    Storage.setSensorRoles(
      Analysis.getSupportedSensorRoles().map(role => ({
        id: role.id,
        name: role.name,
        required: role.required,
        status: role.status
      }))
    );

    bindEvents();
    setConnectionUi(false, "OFFLINE");
    resetScores();
    renderRoutine();
    renderSensorSlots();

    if (els.hudRadar) {
      els.hudRadar.dataset.level = "stable";
    }
  }

  return {
    init
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
