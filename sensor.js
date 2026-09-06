"use strict";

/*
  HARNELYZER — BLE Sensor Layer v0.1.0

  V1:
  - Ein Sensor in Rolle "back-main".
  - Erwartet Textpakete: X:0.12 Y:-0.04 Z:1.08
  - Optional: GX/GY/GZ für Gyroskopdaten.

  V2-Vorbereitung:
  - Jede Messung trägt sensorId und role.
  - Der SensorManager kann später mehrere SensorNodes verwalten.
*/

const Sensor = (() => {
  const CONFIG = {
    deviceName: "K9MATICS",
    primaryRole: "back-main",
    serviceUuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    notifyCharacteristicUuid: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    writeCharacteristicUuid: "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
  };

  let device = null;
  let server = null;
  let service = null;
  let notifyCharacteristic = null;
  let writeCharacteristic = null;
  let connected = false;
  let notificationsActive = false;
  let lineBuffer = "";
  let activeRole = CONFIG.primaryRole;

  const listeners = {
    data: [],
    status: [],
    error: []
  };

  function on(type, callback) {
    if (!listeners[type] || typeof callback !== "function") {
      return () => {};
    }

    listeners[type].push(callback);

    return () => {
      listeners[type] = listeners[type].filter(
        listener => listener !== callback
      );
    };
  }

  function emit(type, value) {
    (listeners[type] || []).forEach(callback => {
      try {
        callback(value);
      } catch (error) {
        console.error("SENSOR LISTENER FEHLER", error);
      }
    });
  }

  function getDeviceName() {
    return device?.name || CONFIG.deviceName;
  }

  function getSensorId() {
    return device?.id || "sensor-01";
  }

  function parseNumber(text, names) {
    for (const name of names) {
      const expression = new RegExp(
        `${name}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`,
        "i"
      );

      const match = String(text).match(expression);

      if (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) return value;
      }
    }

    return null;
  }

  function parseLine(text) {
    const trimmed = String(text || "").replace(/\0/g, "").trim();

    if (!trimmed) return null;

    const accX = parseNumber(trimmed, ["X", "AX"]);
    const accY = parseNumber(trimmed, ["Y", "AY"]);
    const accZ = parseNumber(trimmed, ["Z", "AZ"]);

    if (
      accX === null ||
      accY === null ||
      accZ === null
    ) {
      return null;
    }

    const gyroX = parseNumber(trimmed, ["GX", "GYROX"]);
    const gyroY = parseNumber(trimmed, ["GY", "GYROY"]);
    const gyroZ = parseNumber(trimmed, ["GZ", "GYROZ"]);

    return {
      timestamp: Date.now(),
      sensorId: getSensorId(),
      role: activeRole,
      accX,
      accY,
      accZ,
      gyroX: gyroX ?? 0,
      gyroY: gyroY ?? 0,
      gyroZ: gyroZ ?? 0,
      packetType:
        gyroX !== null || gyroY !== null || gyroZ !== null
          ? "imu-9dof"
          : "imu-acceleration",
      raw: trimmed
    };
  }

  function consumeTextChunk(text) {
    lineBuffer += String(text || "");

    const normalized = lineBuffer.replace(/\r/g, "\n");
    const lines = normalized.split("\n");

    lineBuffer = lines.pop() || "";

    lines.forEach(line => {
      const packet = parseLine(line);

      if (packet) {
        emit("data", packet);
      }
    });

    /*
      Manche Firmware sendet ein Paket ohne Zeilenumbruch.
      Bei vollständigem X/Y/Z-Satz wird es ebenfalls verarbeitet.
    */
    const bufferedPacket = parseLine(lineBuffer);

    if (bufferedPacket) {
      emit("data", bufferedPacket);
      lineBuffer = "";
    }
  }

  function handleNotification(event) {
    try {
      const view = event?.target?.value;

      if (!view) {
        throw new Error("LEERES BLUETOOTH-PAKET");
      }

      const bytes = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength
      );

      const text = new TextDecoder("utf-8").decode(bytes);
      consumeTextChunk(text);
    } catch (error) {
      emit("error", `DATENFEHLER: ${error.message || error}`);
    }
  }

  function handleDisconnected() {
    connected = false;
    notificationsActive = false;
    server = null;
    service = null;
    notifyCharacteristic = null;
    writeCharacteristic = null;
    lineBuffer = "";

    emit("status", "SENSOR GETRENNT");
  }

  async function connect(options = {}) {
    if (!navigator.bluetooth) {
      throw new Error(
        "WEB BLUETOOTH NICHT VERFÜGBAR. BITTE CHROME ODER EDGE NUTZEN."
      );
    }

    if (connected) {
      emit("status", `${getDeviceName()} VERBUNDEN`);
      return getInfo();
    }

    activeRole = String(options.role || CONFIG.primaryRole);

    emit("status", "SENSOR AUSWÄHLEN");

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [CONFIG.serviceUuid]
    });

    if (!device?.gatt) {
      throw new Error("GERÄT HAT KEINE BLUETOOTH-GATT-VERBINDUNG");
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnected,
      { once: true }
    );

    emit("status", `VERBINDE: ${getDeviceName()}`);

    server = await device.gatt.connect();
    service = await server.getPrimaryService(CONFIG.serviceUuid);

    notifyCharacteristic = await service.getCharacteristic(
      CONFIG.notifyCharacteristicUuid
    );

    try {
      writeCharacteristic = await service.getCharacteristic(
        CONFIG.writeCharacteristicUuid
      );
    } catch (error) {
      writeCharacteristic = null;
      console.warn("KEINE WRITE-CHARACTERISTIC", error);
    }

    notifyCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await notifyCharacteristic.startNotifications();

    notificationsActive = true;
    connected = true;

    emit("status", `${getDeviceName()} VERBUNDEN`);

    return getInfo();
  }

  async function disconnect() {
    try {
      if (notifyCharacteristic && notificationsActive) {
        notifyCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          handleNotification
        );

        await notifyCharacteristic.stopNotifications();
      }
    } catch (error) {
      console.warn("NOTIFICATIONS STOP FEHLER", error);
    }

    notificationsActive = false;

    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    } else {
      handleDisconnected();
    }
  }

  async function writeValue(payload) {
    if (!connected || !writeCharacteristic) {
      throw new Error("SENSOR HAT KEINEN SCHREIBKANAL");
    }

    if (typeof writeCharacteristic.writeValueWithResponse === "function") {
      return writeCharacteristic.writeValueWithResponse(payload);
    }

    if (typeof writeCharacteristic.writeValueWithoutResponse === "function") {
      return writeCharacteristic.writeValueWithoutResponse(payload);
    }

    if (typeof writeCharacteristic.writeValue === "function") {
      return writeCharacteristic.writeValue(payload);
    }

    throw new Error("SCHREIBEN NICHT UNTERSTÜTZT");
  }

  async function send(command) {
    const text = `${String(command || "").trim()}\n`;
    const payload = new TextEncoder().encode(text);

    await writeValue(payload);
    return true;
  }

  async function calibrate({ role = activeRole } = {}) {
    if (!connected) {
      throw new Error("ERST DEN SENSOR VERBINDEN");
    }

    emit("status", "KALIBRIERUNG WIRD GESTARTET");

    if (!writeCharacteristic) {
      emit("status", "KALIBRIERUNG: MANUELL BESTÄTIGT");
      return {
        sent: false,
        mode: "manual",
        role
      };
    }

    await send(`CALIBRATE:${role}`);

    emit("status", "KALIBRIERUNG GESENDET");

    return {
      sent: true,
      mode: "ble-command",
      role
    };
  }

  function isConnected() {
    return connected;
  }

  function getInfo() {
    return {
      connected,
      sensorId: getSensorId(),
      name: getDeviceName(),
      role: activeRole,
      supportsWrite: Boolean(writeCharacteristic)
    };
  }

  function getSupportedRoles() {
    return [
      "back-main",
      "pelvis",
      "neck",
      "front-left",
      "front-right",
      "hind-left",
      "hind-right"
    ];
  }

  return {
    on,
    connect,
    disconnect,
    send,
    calibrate,
    isConnected,
    getInfo,
    getSupportedRoles
  };
})();