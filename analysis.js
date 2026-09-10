"use strict";

/*
  HARNELYZER — Analysebasis v0.1.0

  Zweck:
  - Aus einem einzelnen Rücken-/Geschirrsensor verständliche,
    geschirrbezogene Indikatoren berechnen.
  - Referenz ohne Geschirr mit späteren Geschirrtests vergleichen.
  - Datenmodell bleibt mit mehreren Sensoren kompatibel.

  Hinweis:
  Die Ergebnisse sind Bewegungs- und Passformindikatoren.
  Sie sind keine veterinärmedizinische Diagnose.
*/

const Analysis = (() => {
  const QUALITY = {
    minSamples: 80,
    minDurationMs: 8000,
    usefulMotionRatio: 0.35,
    stableMotionRatio: 0.55
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  function mean(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function median(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  function standardDeviation(values) {
    if (!Array.isArray(values) || values.length < 2) return 0;

    const average = mean(values);
    const variance = mean(
      values.map(value => (value - average) ** 2)
    );

    return Math.sqrt(variance);
  }

  function coefficientOfVariation(values) {
    const average = Math.abs(mean(values));
    if (average < 0.0001) return 0;
    return standardDeviation(values) / average;
  }

  function safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function calcMotion(packet) {
    const x = safeNumber(packet?.accX);
    const y = safeNumber(packet?.accY);
    const z = safeNumber(packet?.accZ);

    return Math.sqrt(x * x + y * y + z * z);
  }

  function calcDynamicMotion(packet) {
    return Math.abs(calcMotion(packet) - 1);
  }

  function calcRoll(packet) {
    const y = safeNumber(packet?.accY);
    const z = safeNumber(packet?.accZ);

    return Math.atan2(y, z) * (180 / Math.PI);
  }

  function calcPitch(packet) {
    const x = safeNumber(packet?.accX);
    const y = safeNumber(packet?.accY);
    const z = safeNumber(packet?.accZ);

    return Math.atan2(
      -x,
      Math.sqrt(y * y + z * z)
    ) * (180 / Math.PI);
  }

  function normalizePacket(packet, fallbackRole = "back-main") {
    return {
      timestamp: safeNumber(packet?.timestamp, Date.now()),
      sensorId: String(packet?.sensorId || "sensor-01"),
      role: String(packet?.role || fallbackRole),
      accX: safeNumber(packet?.accX),
      accY: safeNumber(packet?.accY),
      accZ: safeNumber(packet?.accZ, 1),
      gyroX: safeNumber(packet?.gyroX),
      gyroY: safeNumber(packet?.gyroY),
      gyroZ: safeNumber(packet?.gyroZ),
      packetType: String(packet?.packetType || "xyz"),
      raw: String(packet?.raw || "")
    };
  }

  function getSensorPackets(samples, role = "back-main") {
    if (!Array.isArray(samples)) return [];

    const normalized = samples.map(sample => normalizePacket(sample));
    const matchingRole = normalized.filter(sample => sample.role === role);

    return matchingRole.length > 0 ? matchingRole : normalized;
  }

  function calculateDurationMs(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return 0;

    const times = samples
      .map(sample => safeNumber(sample.timestamp))
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (times.length < 2) return 0;
    return Math.max(0, times[times.length - 1] - times[0]);
  }

  function isMoving(packet) {
    const dynamicMotion = calcDynamicMotion(packet);
    const lateral = Math.abs(safeNumber(packet?.accX));
    const vertical = Math.abs(safeNumber(packet?.accY));

    return dynamicMotion > 0.055 || lateral > 0.08 || vertical > 0.08;
  }

  function isUsefulWalkingPacket(packet) {
    const dynamicMotion = calcDynamicMotion(packet);
    const roll = Math.abs(calcRoll(packet));
    const pitch = Math.abs(calcPitch(packet));

    return (
      isMoving(packet) &&
      dynamicMotion < 1.35 &&
      roll < 60 &&
      pitch < 60
    );
  }

  function detectGaitFromMetrics(metrics) {
    if (!metrics || metrics.sampleCount === 0) return "KEINE DATEN";

    if (metrics.motionRatio < 0.12) return "RUHE";

    if (metrics.dynamicMotionMean < 0.15) return "SCHRITT";

    if (metrics.dynamicMotionMean < 0.42) return "TRAB";

    return "SCHNELL";
  }

  function estimateCadenceFromPeaks(samples) {
    if (!Array.isArray(samples) || samples.length < 10) return 0;

    const points = samples.map(sample => calcDynamicMotion(sample));
    const times = samples.map(sample => safeNumber(sample.timestamp));

    const baseline = mean(points);
    const threshold = baseline + standardDeviation(points) * 0.35;
    const peakTimes = [];

    for (let index = 1; index < points.length - 1; index += 1) {
      const isPeak =
        points[index] > threshold &&
        points[index] > points[index - 1] &&
        points[index] >= points[index + 1];

      if (!isPeak) continue;

      const previousPeak = peakTimes[peakTimes.length - 1];
      const currentTime = times[index];

      if (!previousPeak || currentTime - previousPeak >= 220) {
        peakTimes.push(currentTime);
      }
    }

    if (peakTimes.length < 2) return 0;

    const intervals = [];

    for (let index = 1; index < peakTimes.length; index += 1) {
      const interval = peakTimes[index] - peakTimes[index - 1];

      if (interval >= 220 && interval <= 1800) {
        intervals.push(interval);
      }
    }

    if (intervals.length === 0) return 0;

    const averageInterval = mean(intervals);
    if (averageInterval <= 0) return 0;

    return clamp(Math.round(60000 / averageInterval), 0, 220);
  }

  function calculateQuality(samples) {
    const sampleCount = samples.length;
    const durationMs = calculateDurationMs(samples);
    const usefulSamples = samples.filter(isUsefulWalkingPacket);
    const movingSamples = samples.filter(isMoving);

    const usefulRatio = sampleCount > 0
      ? usefulSamples.length / sampleCount
      : 0;

    const motionRatio = sampleCount > 0
      ? movingSamples.length / sampleCount
      : 0;

    const countScore = clamp(sampleCount / QUALITY.minSamples, 0, 1);
    const durationScore = clamp(durationMs / QUALITY.minDurationMs, 0, 1);
    const usefulScore = clamp(
      usefulRatio / QUALITY.usefulMotionRatio,
      0,
      1
    );
    const movementScore = clamp(
      motionRatio / QUALITY.stableMotionRatio,
      0,
      1
    );

    const score = Math.round(
      (countScore * 0.25 +
        durationScore * 0.25 +
        usefulScore * 0.30 +
        movementScore * 0.20) * 100
    );

    let label = "UNZUREICHEND";
    let advice = "Bitte länger und möglichst gleichmäßig gehen.";

    if (score >= 75) {
      label = "GUT";
      advice = "Genug vergleichbare Bewegung erkannt.";
    } else if (score >= 50) {
      label = "BRAUCHBAR";
      advice = "Messung ist nutzbar, eine längere Strecke wäre besser.";
    } else if (sampleCount < QUALITY.minSamples) {
      advice = "Zu wenige Messwerte. Bitte länger laufen.";
    } else if (durationMs < QUALITY.minDurationMs) {
      advice = "Messung zu kurz. Bitte mindestens 15–30 Sekunden gehen.";
    } else if (motionRatio < QUALITY.usefulMotionRatio) {
      advice = "Zu wenig gleichmäßige Bewegung erkannt.";
    }

    return {
      score,
      label,
      advice,
      sampleCount,
      durationMs,
      durationSeconds: round(durationMs / 1000, 1),
      usefulRatio: round(usefulRatio, 2),
      motionRatio: round(motionRatio, 2)
    };
  }

  function buildMetrics(samples, role = "back-main") {
    const packets = getSensorPackets(samples, role);

    if (packets.length === 0) {
      return {
        role,
        sampleCount: 0,
        durationMs: 0,
        motionMean: 0,
        dynamicMotionMean: 0,
        dynamicMotionVariation: 0,
        rollMean: 0,
        rollVariation: 0,
        pitchMean: 0,
        pitchVariation: 0,
        lateralBias: 0,
        cadence: 0,
        motionRatio: 0,
        gait: "KEINE DATEN",
        quality: calculateQuality([])
      };
    }

    const motions = packets.map(calcMotion);
    const dynamicMotions = packets.map(calcDynamicMotion);
    const rolls = packets.map(calcRoll);
    const pitches = packets.map(calcPitch);
    const usefulPackets = packets.filter(isUsefulWalkingPacket);
    const movingPackets = packets.filter(isMoving);

    const metrics = {
      role,
      sampleCount: packets.length,
      durationMs: calculateDurationMs(packets),
      motionMean: mean(motions),
      dynamicMotionMean: mean(dynamicMotions),
      dynamicMotionVariation: coefficientOfVariation(dynamicMotions),
      rollMean: mean(rolls),
      rollVariation: standardDeviation(rolls),
      pitchMean: mean(pitches),
      pitchVariation: standardDeviation(pitches),
      lateralBias: mean(packets.map(packet => safeNumber(packet.accX))),
      cadence: estimateCadenceFromPeaks(usefulPackets),
      motionRatio: packets.length > 0
        ? movingPackets.length / packets.length
        : 0,
      quality: calculateQuality(packets)
    };

    metrics.gait = detectGaitFromMetrics(metrics);

    return {
      ...metrics,
      motionMean: round(metrics.motionMean, 2),
      dynamicMotionMean: round(metrics.dynamicMotionMean, 3),
      dynamicMotionVariation: round(metrics.dynamicMotionVariation, 3),
      rollMean: round(metrics.rollMean, 1),
      rollVariation: round(metrics.rollVariation, 1),
      pitchMean: round(metrics.pitchMean, 1),
      pitchVariation: round(metrics.pitchVariation, 1),
      lateralBias: round(metrics.lateralBias, 3),
      motionRatio: round(metrics.motionRatio, 2)
    };
  }

  function classifySymmetry(metrics) {
    const score = clamp(
      100 -
        Math.abs(metrics.rollMean) * 1.35 -
        metrics.rollVariation * 1.1 -
        Math.abs(metrics.lateralBias) * 34,
      0,
      100
    );

    let label = "AUSGEGLICHEN";

    if (score < 55) {
      label = "DEUTLICH UNRUHIG";
    } else if (score < 75) {
      label = "LEICHT AUFFÄLLIG";
    }

    return {
      score: Math.round(score),
      label
    };
  }

  function classifyStability(metrics) {
    const instability =
      metrics.rollVariation * 1.15 +
      metrics.pitchVariation * 0.55 +
      metrics.dynamicMotionVariation * 24;

    const score = clamp(100 - instability, 0, 100);

    let label = "STABIL";

    if (score < 55) {
      label = "INSTABIL";
    } else if (score < 75) {
      label = "LEICHT BEWEGLICH";
    }

    return {
      score: Math.round(score),
      label
    };
  }

  function classifyRegularity(metrics) {
    const cadencePenalty = metrics.cadence === 0 ? 22 : 0;
    const score = clamp(
      100 -
        metrics.dynamicMotionVariation * 62 -
        metrics.rollVariation * 0.55 -
        cadencePenalty,
      0,
      100
    );

    let label = "REGELMÄSSIG";

    if (score < 55) {
      label = "UNRUHIG";
    } else if (score < 75) {
      label = "LEICHT VARIABEL";
    }

    return {
      score: Math.round(score),
      label
    };
  }

  function summarize(packet) {
    const normalized = normalizePacket(packet);
    const metrics = buildMetrics([normalized], normalized.role);

    return {
      motion: round(calcMotion(normalized), 2),
      roll: round(calcRoll(normalized), 1),
      pitch: round(calcPitch(normalized), 1),
      gait: detectGaitFromMetrics(metrics),
      cadence: metrics.cadence,
      regularity: classifyRegularity(metrics).score,
      asymmetry: 100 - classifySymmetry(metrics).score
    };
  }

  function analyzeSession(session) {
    const samples = Array.isArray(session?.samples) ? session.samples : [];
    const role = session?.primaryRole || "back-main";
    const metrics = buildMetrics(samples, role);
    const stability = classifyStability(metrics);
    const symmetry = classifySymmetry(metrics);
    const regularity = classifyRegularity(metrics);

    const usable = metrics.quality.score >= 50;

    return {
      id: session?.id || null,
      type: session?.type || "unknown",
      label: session?.label || "MESSUNG",
      primaryRole: role,
      sensorRoles: Array.isArray(session?.sensorRoles)
        ? session.sensorRoles
        : [role],
      createdAt: session?.createdAt || null,
      metrics,
      quality: metrics.quality,
      gait: metrics.gait,
      cadence: metrics.cadence,
      stability,
      symmetry,
      regularity,
      usable,
      summary: buildSessionSummary({
        gait: metrics.gait,
        stability,
        symmetry,
        regularity,
        quality: metrics.quality
      })
    };
  }

  function buildSessionSummary(result) {
    if (result.quality.score < 50) {
      return result.quality.advice;
    }

    return [
      `Gangart: ${result.gait}.`,
      `Stabilität: ${result.stability.label.toLowerCase()}.`,
      `Laufbild: ${result.regularity.label.toLowerCase()}.`,
      `Symmetrie: ${result.symmetry.label.toLowerCase()}.`
    ].join(" ");
  }

  function differenceScore(referenceValue, testValue, tolerance) {
    if (!Number.isFinite(referenceValue) || !Number.isFinite(testValue)) {
      return 0;
    }

    const difference = Math.abs(testValue - referenceValue);
    return clamp(100 - (difference / Math.max(tolerance, 0.001)) * 100, 0, 100);
  }

  function compareSessions(referenceSession, harnessSession) {
    const reference = analyzeSession(referenceSession);
    const harness = analyzeSession(harnessSession);

    if (!reference.usable || !harness.usable) {
      return {
        ready: false,
        reference,
        harness,
        passform: { score: 0, label: "NICHT VERGLEICHBAR" },
        stability: { score: 0, label: "NICHT VERGLEICHBAR" },
        movement: { score: 0, label: "NICHT VERGLEICHBAR" },
        symmetry: { score: 0, label: "NICHT VERGLEICHBAR" },
        summary:
          "Für einen Vergleich brauchen Referenz und Geschirrtest jeweils genügend gleichmäßige Bewegung."
      };
    }

    const sameGait =
      reference.gait === harness.gait ||
      reference.gait === "SCHRITT" ||
      harness.gait === "SCHRITT";

    const gaitPenalty = sameGait ? 0 : 15;

    const stabilityScore = Math.round(
      clamp(
        differenceScore(
          reference.metrics.rollVariation,
          harness.metrics.rollVariation,
          12
        ) * 0.55 +
          differenceScore(
            reference.metrics.pitchVariation,
            harness.metrics.pitchVariation,
            18
          ) * 0.25 +
          differenceScore(
            reference.metrics.dynamicMotionVariation,
            harness.metrics.dynamicMotionVariation,
            0.45
          ) * 0.20 -
          gaitPenalty,
        0,
        100
      )
    );

    const symmetryScore = Math.round(
      clamp(
        differenceScore(
          reference.symmetry.score,
          harness.symmetry.score,
          28
        ) -
          gaitPenalty,
        0,
        100
      )
    );

    const movementScore = Math.round(
      clamp(
        differenceScore(
          reference.regularity.score,
          harness.regularity.score,
          28
        ) * 0.60 +
          differenceScore(
            reference.cadence || 80,
            harness.cadence || 80,
            48
          ) * 0.40 -
          gaitPenalty,
        0,
        100
      )
    );

    const passformScore = Math.round(
      clamp(
        stabilityScore * 0.45 +
          symmetryScore * 0.30 +
          movementScore * 0.25,
        0,
        100
      )
    );

    const result = {
      ready: true,
      reference,
      harness,
      sameGait,
      passform: scoreLabel(passformScore, "PASSFORM"),
      stability: scoreLabel(stabilityScore, "STABILITÄT"),
      movement: scoreLabel(movementScore, "LAUFBILD"),
      symmetry: scoreLabel(symmetryScore, "SYMMETRIE")
    };

    result.summary = buildComparisonSummary(result);
    return result;
  }

  function scoreLabel(score, kind) {
    let label = "PRÜFEN";

    if (score >= 85) {
      label = "SEHR GUT";
    } else if (score >= 70) {
      label = "GUT";
    } else if (score >= 55) {
      label = "LEICHTE ABWEICHUNG";
    } else {
      label = "DEUTLICHE ABWEICHUNG";
    }

    return {
      kind,
      score,
      label
    };
  }

  function buildComparisonSummary(result) {
    if (!result.ready) {
      return result.summary;
    }

    const parts = [];

    if (!result.sameGait) {
      parts.push("Gangarten unterscheiden sich; Vergleich ist vorsichtig zu bewerten.");
    }

    if (result.passform.score >= 85) {
      parts.push("Das Geschirr verhält sich sehr ähnlich zur persönlichen Referenz.");
    } else if (result.passform.score >= 70) {
      parts.push("Das Geschirr wirkt insgesamt passend und stabil.");
    } else if (result.passform.score >= 55) {
      parts.push("Leichte Unterschiede zur Referenz sind erkennbar.");
    } else {
      parts.push("Deutlich mehr Bewegungsabweichung als in der Referenz erkannt.");
    }

    if (result.stability.score < 70) {
      parts.push("Besonders die Geschirrstabilität sollte kontrolliert werden.");
    }

    return parts.join(" ");
  }

  function detectMotionEvents(samples, role = "back-main") {
    const packets = getSensorPackets(samples, role);
    if (packets.length < 5) return [];

    const dynamics = packets.map(calcDynamicMotion);
    const baseline = mean(dynamics);
    const sd = standardDeviation(dynamics);
    const peakThreshold = Math.max(0.22, baseline + sd * 1.4);
    const restThreshold = 0.05;
    const minGapMs = 350;

    const events = [];
    let lastEventTs = -Infinity;
    let restStartTs = null;
    let restStartIndex = null;

    packets.forEach((packet, index) => {
      const ts = safeNumber(packet.timestamp);
      const dynamicMotion = dynamics[index];
      const roll = calcRoll(packet);
      const pitch = calcPitch(packet);
      const tilt = Math.sqrt(roll * roll + pitch * pitch);

      if (dynamicMotion > peakThreshold && ts - lastEventTs > minGapMs) {
        events.push({
          timestamp: ts,
          index,
          type: "peak",
          level: dynamicMotion > peakThreshold * 1.6 ? "alert" : "caution",
          label: "BEWEGUNGSSPITZE",
          detail: `${round(dynamicMotion, 2)} g dynamisch`
        });
        lastEventTs = ts;
      } else if (tilt > 26 && ts - lastEventTs > minGapMs) {
        events.push({
          timestamp: ts,
          index,
          type: "tilt",
          level: tilt > 42 ? "alert" : "caution",
          label: "STARKE NEIGUNG",
          detail: `${round(tilt, 1)}\u00b0 Neigung`
        });
        lastEventTs = ts;
      }

      if (dynamicMotion < restThreshold) {
        if (restStartTs === null) {
          restStartTs = ts;
          restStartIndex = index;
        }
      } else if (restStartTs !== null) {
        const restDuration = ts - restStartTs;
        if (restDuration > 1500) {
          events.push({
            timestamp: restStartTs,
            index: restStartIndex,
            type: "rest",
            level: "stable",
            label: "RUHEPHASE",
            detail: `${round(restDuration / 1000, 1)}s ruhig`
          });
        }
        restStartTs = null;
        restStartIndex = null;
      }
    });

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  function buildMotionSummary(session) {
    const samples = Array.isArray(session?.samples) ? session.samples : [];
    const role = session?.primaryRole || "back-main";
    const metrics = buildMetrics(samples, role);
    const events = detectMotionEvents(samples, role);

    const counts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    return {
      sessionId: session?.id || null,
      sessionType: session?.type || "unknown",
      sessionLabel: session?.label || "MESSUNG",
      sampleCount: metrics.sampleCount,
      durationMs: metrics.durationMs,
      durationSeconds: round(metrics.durationMs / 1000, 1),
      dynamicMotionMean: metrics.dynamicMotionMean,
      rollVariation: metrics.rollVariation,
      pitchVariation: metrics.pitchVariation,
      cadence: metrics.cadence,
      gait: metrics.gait,
      quality: metrics.quality,
      eventCount: events.length,
      peakEvents: counts.peak || 0,
      tiltEvents: counts.tilt || 0,
      restEvents: counts.rest || 0,
      events
    };
  }

  function getSupportedSensorRoles() {
    return [
      {
        id: "back-main",
        name: "Rücken / Geschirr",
        required: true,
        status: "active"
      },
      {
        id: "pelvis",
        name: "Becken / Kruppe",
        required: false,
        status: "planned"
      },
      {
        id: "neck",
        name: "Hals",
        required: false,
        status: "planned"
      },
      {
        id: "front-left",
        name: "Vorderbein links",
        required: false,
        status: "planned"
      },
      {
        id: "front-right",
        name: "Vorderbein rechts",
        required: false,
        status: "planned"
      },
      {
        id: "hind-left",
        name: "Hinterbein links",
        required: false,
        status: "planned"
      },
      {
        id: "hind-right",
        name: "Hinterbein rechts",
        required: false,
        status: "planned"
      }
    ];
  }

  return {
    normalizePacket,
    calcMotion,
    calcDynamicMotion,
    calcRoll,
    calcPitch,
    detectGaitFromMetrics,
    estimateCadenceFromPeaks,
    calculateQuality,
    analyzeSession,
    compareSessions,
    summarize,
    getSupportedSensorRoles,
    detectMotionEvents,
    buildMotionSummary
  };
})();