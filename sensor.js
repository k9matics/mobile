"use strict";

/*
  HARNELYZER
  Projektversion: zentral aus version.js
  Datei: sensor.js

  BLE-Verbindung für K9MATICS
  Nordic UART Service
*/

const Sensor = (() => {
  const CONFIG = {
    deviceNamePrefix: "K9MAT",

    serviceUuid:
      "6e400001-b5a3-f393-e0a9-e50e24dcca9e",

    txCharacteristicUuid:
      "6e400003-b5a3-f393-e0a9-e50e24dcca9e",

    rxCharacteristicUuid:
      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
  };

  let device = null;
  let server = null;
  let service = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;

  let connected = false;
  let notificationsActive = false;

  const listeners = {
    data: [],
    status: [],
    error: []
  };

  function on(type, callback) {
    if (!listeners[type]) {
      return;
    }

    listeners[type].push(callback);
  }

  function emit(type, value) {
    const callbacks = listeners[type] || [];

    callbacks.forEach(callback => {
      callback(value);
    });
  }

  function getDeviceName() {
    return device?.name || "UNBEKANNT";
  }

  function parseLine(text) {
    const trimmed = String(text || "").trim();

    if (!trimmed) {
      throw new Error("LEERES DATENPAKET");
    }

    const matches = {
      x: trimmed.match(/X:s*(-?d+(?:.d+)?)/i),
      y: trimmed.match(/Y:s*(-?d+(?:.d+)?)/i),
      z: trimmed.match(/Z:s*(-?d+(?:.d+)?)/i)
    };

    if (
      !matches.x ||
      !matches.y ||
      !matches.z
    ) {
      throw new Error(
        `UNBEKANNTES FORMAT: ${trimmed}`
      );
    }

    return {
      accX: Number(matches.x[1]) || 0,
      accY: Number(matches.y[1]) || 0,
      accZ: Number(matches.z[1]) || 0,
      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,
      raw: trimmed
    };
  }

  function parsePacket(dataView) {
    const bytes = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset,
      dataView.byteLength
    );

    const text = new TextDecoder()
      .decode(bytes)
      .trim();

    return parseLine(text);
  }

  function handleNotification(event) {
    try {
      const values = parsePacket(
        event.target.value
      );

      emit("data", {
        timestamp: Date.now(),

        accX: values.accX,
        accY: values.accY,
        accZ: values.accZ,

        gyroX: values.gyroX,
        gyroY: values.gyroY,
        gyroZ: values.gyroZ,

        raw: values.raw
      });
    } catch (error) {
      emit(
        "error",
        `PAKETFEHLER: ${error.message}`
      );
    }
  }

  function handleDisconnected() {
    connected = false;
    notificationsActive = false;

    server = null;
    service = null;
    txCharacteristic = null;
    rxCharacteristic = null;

    emit("status", "SENSOR GETRENNT");
  }

  async function selectDevice() {
    return navigator.bluetooth.requestDevice({
      filters: [
        {
          namePrefix:
            CONFIG.deviceNamePrefix
        }
      ],

      optionalServices: [
        CONFIG.serviceUuid
      ]
    });
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "WEB BLUETOOTH NICHT VERFÜGBAR"
      );
    }

    if (connected) {
      emit(
        "status",
        `${getDeviceName()} VERBUNDEN`
      );

      return;
    }

    emit("status", "GERÄT AUSWÄHLEN");

    device = await selectDevice();

    if (!device) {
      throw new Error("KEIN GERÄT AUSGEWÄHLT");
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnected
    );

    emit(
      "status",
      `VERBINDE: ${getDeviceName()}`
    );

    if (!device.gatt) {
      throw new Error(
        "GERÄT HAT KEIN GATT"
      );
    }

    server = await device.gatt.connect();

    service = await server.getPrimaryService(
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

    if (
      !txCharacteristic.properties.notify &&
      !txCharacteristic.properties.indicate
    ) {
      throw new Error(
        "TX-CHARACTERISTIC HAT KEIN NOTIFY"
      );
    }

    txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await txCharacteristic.startNotifications();

    notificationsActive = true;
    connected = true;

    emit(
      "status",
      `${getDeviceName()} VERBUNDEN`
    );
  }

  async function disconnect() {
    try {
      if (
        txCharacteristic &&
        notificationsActive
      ) {
        txCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          handleNotification
        );

        await txCharacteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(error);
    }

    notificationsActive = false;

    if (
      device?.gatt &&
      device.gatt.connected
    ) {
      device.gatt.disconnect();
    }

    handleDisconnected();
  }

  function isConnected() {
    return connected;
  }

  async function send(text) {
    if (!rxCharacteristic) {
      throw new Error(
        "RX-CHARACTERISTIC NICHT VERFÜGBAR"
      );
    }

    const payload = new TextEncoder().encode(
      String(text)
    );

    await rxCharacteristic.writeValue(payload);
  }

  return {
    on,
    connect,
    disconnect,
    isConnected,
    send
  };
})();
