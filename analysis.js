"use strict";

const Analysis = (() => {
  const history = [];
  const maxHistory = 300;

  let reference = null;

  function clamp(value, min, max) {
    return Math.min(
      Math.max(value, min),
      max
    );
  }

  function magnitude(x, y, z) {
    return Math.sqrt(
      x * x +
      y * y +
      z * z
    );
  }

  function calculateTilt(accX, accY, accZ) {
    const roll =
      Math.atan2(accY, accZ) *
      180 /
      Math.PI;

    const pitch =
      Math.atan2(
        -accX,
        Math.sqrt(
          accY * accY +
          accZ * accZ
        )
      ) *
      180 /
      Math.PI;

    return {
      roll,
      pitch
    };
  }

  function average(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length;
  }

  function standardDeviation(values) {
    if (values.length < 2) {
      return 0;
    }

    const mean = average(values);

    const variance = average(
      values.map(value => {
        return Math.pow(value - mean, 2);
      })
    );

    return Math.sqrt(variance);
  }

  function getRecentSamples(count = 80) {
    return history.slice(-count);
  }

  function calculateShift() {
    const samples = getRecentSamples();

    if (samples.length < 10) {
      return 0;
    }

    return average(
      samples.map(sample => sample.roll)
    );
  }

  function calculateStability() {
    const samples = getRecentSamples();

    if (samples.length < 20) {
      return 0;
    }

    const rollValues = samples.map(
      sample => sample.roll
    );

    const pitchValues = samples.map(
      sample => sample.pitch
    );

    const dynamicValues = samples.map(
      sample => sample.dynamicAcceleration
    );

    const variation =
      standardDeviation(rollValues) +
      standardDeviation(pitchValues) +
      standardDeviation(dynamicValues) * 15;

    return clamp(
      100 - variation * 4,
      0,
      100
    );
  }

  function calculateFitScore() {
    const stability = calculateStability();

    const shift =
      Math.abs(calculateShift());

    return clamp(
      stability - shift * 1.5,
      0,
      100
    );
  }

  function getFitLabel(score) {
    if (history.length < 20) {
      return "WARTEN";
    }

    if (score >= 80) {
      return "STABIL";
    }

    if (score >= 60) {
      return "PRÜFEN";
    }

    if (score >= 40) {
      return "INSTABIL";
    }

    return "AUFFÄLLIG";
  }

  function getStatus(result) {
    if (history.length < 20) {
      return "ZU WENIG DATEN";
    }

    if (result.fitScore < 40) {
      return "PRÜFUNG EMPFOHLEN";
    }

    if (Math.abs(result.shift) > 15) {
      return "SEITENVERSCHIEBUNG";
    }

    if (result.stability < 60) {
      return "GESCHIRR UNRUHIG";
    }

    if (
      reference &&
      result.fitScore <
      reference.fitScore - 20
    ) {
      return "ABWEICHUNG ZUR REFERENZ";
    }

    return "PASSFORM STABIL";
  }

  function addSample(sample) {
    history.push(sample);

    if (history.length > maxHistory) {
      history.shift();
    }

    return calculate();
  }

  function calculate() {
    const shift = calculateShift();
    const stability = calculateStability();
    const fitScore = calculateFitScore();

    const result = {
      shift,
      stability,
      fitScore,
      fitLabel: getFitLabel(fitScore),
      rotationAvailable: false
    };

    result.status = getStatus(result);

    return result;
  }

  function setReference() {
    const result = calculate();

    reference = {
      timestamp: Date.now(),
      fitScore: result.fitScore,
      stability: result.stability,
      shift: result.shift
    };

    return reference;
  }

  function reset() {
    history.length = 0;
    reference = null;
  }

  return {
    magnitude,
    calculateTilt,
    addSample,
    calculate,
    setReference,
    reset
  };
})();
