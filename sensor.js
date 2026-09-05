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
    lineBuffer += text;
    const normalized = lineBuffer.replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    lineBuffer = parts.pop() || "";

    parts.forEach(line => {
      const parsed = parseLine(line);
      if (parsed) {
        emit("data", parsed);
      }
    });
  }

  function handleNotification(event) {
    try {
      const bytes = new Uint8Array(
        event.target.value.buffer,
        event.target.value.byteOffset,
        event.target.value.byteLength
      );

      const text = new TextDecoder().decode(bytes);
      consumeTextChunk(text);
    } catch (error) {
      emit("error", `PAKETFEHLER: ${error.message}`);
    }
  }

  function handleDisconnected() {
    connected = false;
    notificationsActive = false;
    server = null;
    service = null;
    txCharacteristic = null;
    rxCharacteristic = null;
    lineBuffer = "";
    emit("status", "SENSOR GETRENNT");
  }

  async function selectDevice() {
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [CONFIG.serviceUuid]
    });
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error("WEB BLUETOOTH NICHT VERFÜGBAR");
    }

    if (connected) {
      emit("status", `${getDeviceName()} VERBUNDEN`);
      return;
    }

    emit("status", "GERÄT AUSWÄHLEN");
    device = await selectDevice();

    if (!device) {
      throw new Error("KEIN GERÄT AUSGEWÄHLT");
    }

    device.addEventListener("gattserverdisconnected", handleDisconnected);

    emit("status", `VERBINDE: ${getDeviceName()}`);

    if (!device.gatt) {
      throw new Error("GERÄT HAT KEIN GATT");
    }

    server = await device.gatt.connect();
    service = await server.getPrimaryService(CONFIG.serviceUuid);
    txCharacteristic = await service.getCharacteristic(CONFIG.txCharacteristicUuid);
    rxCharacteristic = await service.getCharacteristic(CONFIG.rxCharacteristicUuid);

    txCharacteristic.addEventListener("characteristicvaluechanged", handleNotification);
    await txCharacteristic.startNotifications();

    notificationsActive = true;
    connected = true;

    emit("status", `${getDeviceName()} VERBUNDEN`);
  }

  async function disconnect() {
    try {
      if (txCharacteristic && notificationsActive) {
        txCharacteristic.removeEventListener("characteristicvaluechanged", handleNotification);
        await txCharacteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(error);
    }

    notificationsActive = false;

    if (device?.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    }

    handleDisconnected();
  }

  async function send(text) {
    if (!rxCharacteristic) {
      throw new Error("RX-CHARACTERISTIC NICHT VERFÜGBAR");
    }

    const payload = new TextEncoder().encode(String(text));
    await rxCharacteristic.writeValue(payload);
  }

  function isConnected() {
    return connected;
  }

  return {
    on,
    connect,
    disconnect,
    send,
    isConnected
  };
})();
