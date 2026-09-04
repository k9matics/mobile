"use strict";

/*
  HARNELYZER
  Bewegungsberechnung
*/

const Analysis = (() => {
  const history = [];
  const MAX_HISTORY = 240;

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
    const z = Number(accZ) || 1;

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

  function average(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length;
  }

  function addSample(sample) {
    history.push(sample);

    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    return calculate();
  }

  function calculateCadence() {
    if (history.length < 30) {
      return 0;
    }

    const peaks = [];

    for (
      let i = 1;
      i < history.length - 1;
      i++
    ) {
      const previous =
        history[i - 1].dynamicAcceleration;

      const current =
        history[i].dynamicAcceleration;

      const next =
        history[i + 1].dynamicAcceleration;

      if (
        current > previous &&
        current > next &&
        current > 0.08
      ) {
        peaks.push(history[i]);
      }
    }

    if (peaks.length < 2) {
      return 0;
    }

    const intervals = [];

    for (let i = 1; i < peaks.length; i++) {
      const seconds =
        (peaks[i].timestamp -
          peaks[i - 1].timestamp) /
        1000;

      if (seconds > 0.2 && seconds < 4) {
        intervals.push(seconds);
      }
    }

    if (!intervals.length) {
      return 0;
    }

    return 60 / average(intervals);
  }

  function calculateRegularity() {
    if (history.length < 30) {
      return 0;
    }

    const values = history.map(item => {
      return item.dynamicAcceleration;
    });

    const mean = average(values);

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

    const deviation =
      Math.sqrt(variance);

    return clamp(
      100 - (deviation / mean) * 100,
      0,
      100
    );
  }

  function calculateAsymmetry() {
    if (history.length < 40) {
      return 0;
    }

    const left = history
      .filter(item => item.roll >= 0)
      .map(item => item.dynamicAcceleration);

    const right = history
      .filter(item => item.roll < 0)
      .map(item => item.dynamicAcceleration);

    if (!left.length || !right.length) {
      return 0;
    }

    const leftAverage = average(left);
    const rightAverage = average(right);

    const denominator = Math.max(
      (leftAverage + rightAverage) / 2,
      0.01
    );

    return clamp(
      Math.abs(leftAverage - rightAverage) /
        denominator *
        100,
      0,
      100
    );
  }

  function gaitFromCadence(cadence) {
    if (history.length < 25) {
      return "WARTEN";
    }

    if (cadence < 1) {
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
    const cadence = calculateCadence();
    const regularity = calculateRegularity();
    const asymmetry = calculateAsymmetry();

    let status = "NORMAL";

    if (history.length < 25) {
      status = "ZU WENIG DATEN";
    } else if (asymmetry >= 35) {
      status = "ASYMMETRIE ERKANNT";
    } else if (regularity < 45) {
      status = "UNREGELMÄSSIG";
    } else if (
      reference &&
      asymmetry > reference.asymmetry + 20
    ) {
      status = "ABWEICHUNG ZUR REFERENZ";
    }

    return {
      gait: gaitFromCadence(cadence),
      cadence,
      regularity,
      asymmetry,
      status
    };
  }

  function setReference() {
    const result = calculate();

    reference = {
      asymmetry: result.asymmetry,
      regularity: result.regularity,
      timestamp: Date.now()
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
    setReference,
    reset
  };
})();
