"use strict";

const Analysis = (() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 2) {
    const p = 10 ** digits;
    return Math.round(value * p) / p;
  }

  function calcMotion(packet) {
    return Math.sqrt(
      packet.accX * packet.accX +
      packet.accY * packet.accY +
      packet.accZ * packet.accZ
    );
  }

  function calcRoll(packet) {
    return Math.atan2(packet.accY, packet.accZ) * (180 / Math.PI);
  }

  function calcPitch(packet) {
    return Math.atan2(
      -packet.accX,
      Math.sqrt(packet.accY * packet.accY + packet.accZ * packet.accZ)
    ) * (180 / Math.PI);
  }

  function detectGait(packet) {
    const motion = calcMotion(packet);
    if (motion >= 1.75) return "GALOPP";
    if (motion >= 1.35) return "TRAB";
    return "SCHRITT";
  }

  function estimateCadence(packet) {
    const motion = calcMotion(packet);
    return clamp(Math.round(58 + motion * 28), 40, 180);
  }

  function estimateRegularity(packet) {
    const roll = Math.abs(calcRoll(packet));
    const pitch = Math.abs(calcPitch(packet));
    return clamp(Math.round(96 - roll * 0.7 - pitch * 0.35), 0, 100);
  }

  function estimateAsymmetry(packet) {
    const roll = Math.abs(calcRoll(packet));
    return clamp(Math.round(roll * 1.8), 0, 100);
  }

  function summarize(packet) {
    const motion = calcMotion(packet);
    const roll = calcRoll(packet);
    const pitch = calcPitch(packet);

    return {
      motion: round(motion, 2),
      roll: round(roll, 1),
      pitch: round(pitch, 1),
      gait: detectGait(packet),
      cadence: estimateCadence(packet),
      regularity: estimateRegularity(packet),
      asymmetry: estimateAsymmetry(packet)
    };
  }

  return {
    calcMotion,
    calcRoll,
    calcPitch,
    detectGait,
    estimateCadence,
    estimateRegularity,
    estimateAsymmetry,
    summarize
  };
})();
