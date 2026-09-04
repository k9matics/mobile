"use strict";

/*
  K9MATICS HARNESS v2.7

  Unterstützte Sensordaten:

  1. Einzelner Zahlenwert:
     7
     42
     255

  2. X/Y/Z-Textformat:
     X:0.12 Y:-0.04 Z:1.08

  Der Zahlenmodus ist ein Verbindungstest.
  Der X/Y/Z-Modus ist die echte IMU-Auswertung.
*/

window.K9Sensor = (() => {
  const CONFIG = {
    deviceName: "K9MATICS",

    serviceUuid:
      "6e400001-b5a3-f393-e0a9-e50e24dcca9e",

    txCharacteristicUuid:
      "6e400003-b5a3-f393-e0a9-e50e24dcca9e",

    rxCharacteristicUuid:
      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
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

  function parseXYZPacket(text) {
    const match = text.match(
      /X:\s*(-?\d+(?:\.\d+)?)\s+Y:\s*(-?\d+(?:\.\d+)?)\s+Z:\s*(-?\d+(?:\.\d+)?)/i
    );

    if (!match) {
      return null;
    }

    return {
      accX: Number(match[1]),
      accY: Number(match[2]),
      accZ: Number(match[3]),

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      packetType: "xyz",
      raw: text
    };
  }

  function parseSingleNumberPacket(text) {
    const clean = text.trim();

    if (!/^-?\d+(?:\.\d+)?$/.test(clean)) {
      return null;
    }

    const rawValue = Number(clean);

    /*
      Der einzelne Wert ist aktuell kein echter
      X/Y/Z-Sensorwert. Wir geben ihn sichtbar aus
      und erzeugen eine Testbewegung für die UI.
    */
    const scaledValue = rawValue / 100;

    return {
      accX: 0,
      accY: 0,
      accZ: scaledValue,

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      packetType: "single-value",
      raw: clean
    };
  }

  function parsePacket(text) {
    const clean = text.trim();

    if (!clean) {
      throw new Error("LEERES SENSORPAKET");
    }

    const xyzPacket = parseXYZPacket(clean);

    if (xyzPacket) {
      return xyzPacket;
    }

    const singleNumberPacket =
      parseSingleNumberPacket(clean);

    if (singleNumberPacket) {
      return singleNumberPacket;
    }

    throw new Error(
      `UNBEKANNTES SENSORPAKET: ${clean}`
    );
  }

  function handleNotification(event) {
    try {
      const receivedText = decodeNotification(
        event.target.value
      );

      const lines = receivedText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      lines.forEach(line => {
        const packet = parsePacket(line);

        emit("data", {
          timestamp: Date.now(),

          accX: packet.accX,
          accY: packet.accY,
          accZ: packet.accZ,

          gyroX: packet.gyroX,
          gyroY: packet.gyroY,
          gyroZ: packet.gyroZ,

          packetType: packet.packetType,
          raw: packet.raw
        });
      });
    } catch (error) {
      emit(
        "error",
        `DATENFEHLER: ${error.message}`
      );
    }
  }

  function handleDisconnect() {
    connected = false;
    txCharacteristic = null;
    rxCharacteristic = null;

    emit("status", "K9MATICS GETRENNT");
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "WEB BLUETOOTH NICHT VERFÜGBAR. BITTE CHROME AUF ANDROID NUTZEN."
      );
    }

    emit("status", "K9MATICS AUSWÄHLEN");

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,

      optionalServices: [
        CONFIG.serviceUuid
      ]
    });

    if (!device) {
      throw new Error(
        "KEIN BLUETOOTH-GERÄT AUSGEWÄHLT"
      );
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnect
    );

    emit(
      "status",
      `VERBINDE: ${device.name || CONFIG.deviceName}`
    );

    const server = await device.gatt.connect();

    const service = await server.getPrimaryService(
      CONFIG.serviceUuid
    );

    txCharacteristic =
      await service.getCharacteristic(
        CONFIG.txCharacteristicUuid
      );

    rxCharacteristic =
      await service.getCharacteristic(
        CONFIG.rxCharacteristicUuid
      );

    txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await txCharacteristic.startNotifications();

    connected = true;

    emit(
      "status",
      `VERBUNDEN: ${device.name || CONFIG.deviceName}`
    );
  }

  async function disconnect() {
    try {
      if (txCharacteristic) {
        await txCharacteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(
        "Notifications konnten nicht beendet werden.",
        error
      );
    }

    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }

    device = null;
    txCharacteristic = null;
    rxCharacteristic = null;
    connected = false;

    emit("status", "K9MATICS GETRENNT");
  }

  async function sendCommand(command) {
    if (!connected || !rxCharacteristic) {
      throw new Error(
        "K9MATICS IST NICHT VERBUNDEN"
      );
    }

    const bytes = new TextEncoder()
      .encode(`${command}\n`);

    if (
      rxCharacteristic.properties
        .writeWithoutResponse
    ) {
      await rxCharacteristic
        .writeValueWithoutResponse(bytes);
    } else {
      await rxCharacteristic.writeValue(bytes);
    }
  }

  function isConnected() {
    return connected;
  }

  return {
    on,
    connect,
    disconnect,
    sendCommand,
    isConnected
  };
})();
