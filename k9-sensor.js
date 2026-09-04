"use strict";

/*
  K9MATICS HARNESS v2.6

  XIAO nRF52840 + Adafruit Bluefruit BLEUart.
  Nordic UART Service.

  Firmwareformat:
  X:0.12 Y:-0.04 Z:1.08

  Die Service-UUID wird als 128-Bit-Array
  übergeben, weil der Browser im Screenshot
  die String-Schreibweise abgelehnt hat.
*/

window.K9Sensor = (() => {
  const NUS_SERVICE_UUID = new Uint8Array([
    0x6e, 0x40, 0x00, 0x01,
    0xb5, 0xa3,
    0xf3, 0x93,
    0xe0, 0xa9,
    0xe5, 0x0e, 0x24, 0xdc, 0xca, 0x9e
  ]);

  const NUS_TX_UUID =
    "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

  const NUS_RX_UUID =
    "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

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

  function parsePacket(text) {
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

  function handleNotification(event) {
    try {
      const notificationText =
        decodeNotification(event.target.value);

      const lines = notificationText
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
        NUS_SERVICE_UUID
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
      `VERBINDE: ${device.name || "K9MATICS"}`
    );

    const server =
      await device.gatt.connect();

    const service =
      await server.getPrimaryService(
        NUS_SERVICE_UUID
      );

    txCharacteristic =
      await service.getCharacteristic(
        NUS_TX_UUID
      );

    rxCharacteristic =
      await service.getCharacteristic(
        NUS_RX_UUID
      );

    txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await txCharacteristic.startNotifications();

    connected = true;

    emit(
      "status",
      `VERBUNDEN: ${device.name || "K9MATICS"}`
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
