"use strict";

/*
  K9MATICS HARNESS v2.4.1
  Sensor-Anbindung für:
  Seeed Studio XIAO nRF52840
  Adafruit Bluefruit BLEUart
  Nordic UART Service

  Firmware-Datenformat:
  X:0.12 Y:-0.04 Z:1.08
*/

const Sensor = (() => {
  const CONFIG = {
    deviceNamePrefix: "K9MATICS",

    serviceUuid:
      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E",

    txCharacteristicUuid:
      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E",

    rxCharacteristicUuid:
      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
  };

  let device = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;
  let connected = false;

  const listeners = {
    data: [],
    status: [],
    error: []
  };

  function on(type, callback) {
    if (!listeners[type]) {
      listeners[type] = [];
    }

    listeners[type].push(callback);
  }

  function emit(type, value) {
    (listeners[type] || []).forEach(callback => {
      callback(value);
    });
  }

  function parseK9maticsPacket(text) {
    const cleanedText = text.trim();

    const match = cleanedText.match(
      /X:\s*(-?\d+(?:\.\d+)?)\s+Y:\s*(-?\d+(?:\.\d+)?)\s+Z:\s*(-?\d+(?:\.\d+)?)/i
    );

    if (!match) {
      throw new Error(
        `UNBEKANNTES PAKET: ${cleanedText}`
      );
    }

    return {
      accX: Number(match[1]),
      accY: Number(match[2]),
      accZ: Number(match[3]),

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      raw: cleanedText
    };
  }

  function decodeNotification(dataView) {
    const bytes = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset,
      dataView.byteLength
    );

    return new TextDecoder("utf-8")
      .decode(bytes)
      .replace(/\0/g, "")
      .trim();
  }

  function handleNotification(event) {
    try {
      c
