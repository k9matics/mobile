"use strict";

/*
  CANINE GAIT HUD
  analysis.js
  Version 2.2

  Bewegungsberechnung für alle Hundegrößen.
  Hinweis:
  Die Werte sind technische Indikatoren und
  keine tierärztliche Diagnose.
*/

const Analysis = (() => {
  const history = [];
  const MAX_HISTORY = 300;

  let reference = null;

  function clamp(value, min, max) {
    return Math.min(
      Math.max(value, min),
      max
    );
  }

  function magnitude(x, y, z) {
    const safeX = Number(x) || 0;
    const safeY = Number(y) || 0;
    const safeZ = Number(z) || 0;

    return Math.sqrt(
      safeX * safeX +
      safeY * safeY +
      safeZ * safeZ
    );
  }

  function calculateTilt(accX, accY, accZ) {
    const x = Number(accX) || 0;
    const y = Number(accY) || 0;
    const z = Number(accZ) || 0;

    const roll =
      Math.atan2(y, z) *
      180 /
      Math.PI;

    const pitch =
      Math.atan2(
        -x,
        Math.sqrt(y * y + z * z)
      ) *
      180 /
      Math.PI;

    return {
      roll,
      pitch
    };
  }

  function addSample(sample) {
    history.push(sample);

    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    return calculate();
  }

  function getDynamicValues() {
    return history.map(item => {
      return Number(item.dynamicAcceleration) || 0;
    });
  }

  function calculateAverage(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length;
  }

  function calculateRegularity() {
    if (history.length < 20) {
      return 0;
    }

    const values = getDynamicValues();
    const mean = calculateAverage(values);

    if (mean < 0.01) {
      return 0;
    }

    const variance =
      values.reduce((sum, value) => {
        return sum + Math.pow(
          value - mean,
          2
        );
      }, 0) / values.length;

    const standardDeviation =
      Math.sqrt(variance);

    const coefficient =
      standardDeviation / mean;

    return clamp(
      100 - coefficient * 100,
      0,
      100
    );
  }

  function calculateAsymmetry() {
    if (history.length < 40) {
      return 0;
    }

    const leftValues = history
      .filter(item => item.roll >= 0)
      .map(item => {
        return Math.abs(
          Number(item.dynamicAcceleration) || 0
        );
      });

    const rightValues = history
      .filter(item => item.roll < 0)
      .map(item => {
        return Math.abs(
          Number(item.dynamicAcceleration) || 0
        );
      });

    if (
      !leftValues.length ||
      !rightValues.length
    ) {
      return 0;
    }

    const leftAverage =
      calculateAverage(leftValues);

    const rightAverage =
      calculateAverage(rightValues);

    const denominator = Math.max(
      (leftAverage + rightAverage) / 2,
      0.01
    );

    return clamp(
      Math.abs(
        leftAverage - rightAverage
      ) /
      denominator *
      100,
      0,
      100
    );
  }

  function estimateCadence() {
    if (history.length < 15) {
      return 0;
    }

    const values = getDynamicValues();
    const peaks = [];

    for (let index = 1; index < values.length - 1; index++) {
      const previous = values[index - 1];
      const current = values[index];
      const next = values[index + 1];

      if (
        current > previous &&
        current > next &&
        current > 0.08
      ) {
        peaks.push(index);
      }
    }

    if (peaks.length < 2) {
      return 0;
    }

    const intervals = [];

    for (let index = 1; index < peaks.length; index++) {
      const currentTime =
        history[peaks[index]].timestamp;

      const previousTime =
        history[peaks[index - 1]].timestamp;

      const seconds =
        (currentTime - previousTime) / 1000;

      if (seconds > 0.15 && seconds < 5) {
        intervals.push(seconds);
      }
    }

    if (!intervals.length) {
      return 0;
    }

    const averageInterval =
      calculateAverage(intervals);

    return 60 / averageInterval;
  }

  function detectGait(cadence) {
    if (history.length < 20) {
      return "WARTEN";
    }

    if (cadence < 1.2) {
      return "RUHE";
    }

    if (cadence < 2.4) {
      return "SCHRITT";
    }

    if (cadence < 4.5) {
      return "TRAB";
    }

    return "LAUFEN";
  }

  function calculate() {
    const cadence = estimateCadence();
    const regularity = calculateRegularity();
    const asymmetry = calculateAsymmetry();

    let status = "NORMAL";

    if (history.length < 20) {
      status = "ZU WENIG DATEN";
    } else if (asymmetry >= 35) {
      status = "AUFFÄLLIGE ASYMMETRIE";
    } else if (regularity < 45) {
      status = "UNREGELMÄSSIGE BEWEGUNG";
    } else if (
      reference &&
      asymmetry >
      reference.asymmetry + 20
    ) {
      status = "VERÄNDERUNG ZUR REFERENZ";
    }

    return {
      gait: detectGait(cadence),
      cadence,
      regularity,
      asymmetry,
      status
    };
  }

  function setReference() {
    const result = calculate();

    reference = {
      timestamp: Date.now(),
      regularity: result.regularity,
      asymmetry: result.asymmetry
    };

    return reference;
  }

  function reset() {
    history.length = 0;
    reference = null;
  }

  function getHistory() {
    return [...history];
  }

  return {
    magnitude,
    calculateTilt,
    addSample,
    calculate,
    setReference,
    reset,
    getHistory
  };
})();
