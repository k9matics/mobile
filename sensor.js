"use strict";

const Sensor = (() => {
  const CONFIG = {
    serviceUuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    txCharacteristicUuid: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    rxCharacteristicUuid: "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
  };

  let device = null;
  let server = null;
  let service = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;
  let connected = false;
  let notificationsActive = false;
  let lineBuffer = "";

  const listeners = {
    data: [],
    status: [],
    error: []
  };

  function on(type, callback) {
    if (!listeners[type]) return;
    listeners[type].push(callback);
  }

  function emit(type, value) {
    (listeners[type] || []).forEach(callback => callback(value));
  }

  function getDeviceName() {
    return device?.name || "UNBEKANNT";
  }

  function parseLine(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;

    const x = trimmed.match(/X:\s*(-?\d+(?:\.\d+)?)/i);
    const y = trimmed.match(/Y:\s*(-?\d+(?:\.\d+)?)/i);
    const z = trimmed.match(/Z:\s*(-?\d+(?:\.\d+)?)/i);

    if (!x || !y || !z) {
      return null;
    }

    return {
      timestamp: Date.now(),
      accX: Number(x[1]) || 0,
      accY: Number(y[1]) || 0,
      accZ: Number(z[1]) || 0,
      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,
      raw: trimmed
    };
  }

  function consumeTextChunk(text) {
    lineBuffer
