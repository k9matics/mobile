"use strict";

/*
  K9MATICS HARNESS v2.2
  XIAO nRF52840 BLE-Verbindung.

  Aktueller Testmodus:
  - 1 Byte unsigned Integer
  - Characteristic wird über Notifications gelesen

  Wenn deine Firmware später X/Y/Z-Werte sendet,
  packetFormat auf "csv" oder "float32-le" umstellen.
*/

const Sensor = (() => {
  const CONFIG = {
    deviceNamePrefix: "K9MATICS",

    serviceUuid:
      "19B10000-E8F2-537E-4F6C-D104768A1214",

    characteristicUuid:
      "19B10001-E8F2-537E-4F6C-D104768A1214",

    packetFormat: "byte"
  };

  let device = null;
  let characteristic = null;
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
    (listeners[type] || []).forEach(
      callback => callback(value)
    );
  }

  function parseByte(dataView) {
    const value = dataView.getUint8(0);

    return {
      /*
        Ein einzelnes Byte hat noch keine
        echte Raumachsen-Bedeutung.

        Für den Verbindungstest erzeugen wir
        daraus einen sichtbaren Z-Wert.
      */
      accX: 0,
      accY: 0,
      accZ: value / 100,

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      raw: value
    };
  }

  function parseCsv(dataView) {
    const bytes = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset,
      dataView.byteLength
    );

    const text = new TextDecoder()
      .decode(bytes)
      .trim();

    const values = text
      .split(",")
      .map(Number);

    return {
      accX: values[0] || 0,
      accY: values[1] || 0,
      accZ: values[2] || 0,
      gyroX: values[3] || 0,
      gyroY: values[4] || 0,
      gyroZ: values[5] || 0,
      raw: text
    };
  }

  function parseFloat32(dataView) {
    return {
      accX: dataView.getFloat32(0, true),
      accY: dataView.getFloat32(4, true),
      accZ: dataView.getFloat32(8, true),

      gyroX:
        dataView.byteLength >= 16
          ? dataView.getFloat32(12, true)
          : 0,

      gyroY:
        dataView.byteLength >= 20
          ? dataView.getFloat32(16, true)
          : 0,

      gyroZ:
        dataView.byteLength >= 24
          ? dataView.getFloat32(20, true)
          : 0,

      raw: "FLOAT32"
    };
  }

  function parsePacket(dataView) {
    if (CONFIG.packetFormat === "byte") {
      return parseByte(dataView);
    }

    if (CONFIG.packetFormat === "csv") {
      return parseCsv(dataView);
    }

    if (CONFIG.packetFormat === "float32-le") {
      return parseFloat32(dataView);
    }

    throw new Error("UNBEKANNTES DATENFORMAT");
  }

  function handleNotification(event) {
    try {
      const parsed = parsePacket(
        event.target.value
      );

      emit("data", {
        timestamp: Date.now(),

        accX: parsed.accX,
        accY: parsed.accY,
        accZ: parsed.accZ,

        gyroX: parsed.gyroX,
        gyroY: parsed.gyroY,
        gyroZ: parsed.gyroZ,

        raw: parsed.raw
      });
    } catch (error) {
      emit(
        "error",
        `DATENFEHLER: ${error.message}`
      );
    }
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "WEB BLUETOOTH NICHT VERFÜGBAR"
      );
    }

    emit("status", "SENSOR AUSWÄHLEN");

    /*
      acceptAllDevices ist absichtlich aktiv,
      damit der Sensor auch erscheint, wenn
      sein beworbener Service nicht korrekt
      im Advertising-Paket steht.

      Danach greift die App trotzdem nur auf
      die konfigurierte Service-UUID zu.
    */
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,

      optionalServices: [
        CONFIG.serviceUuid
      ]
    });

    if (
      device.name &&
      !device.name
        .toUpperCase()
        .includes(CONFIG.deviceNamePrefix)
    ) {
      emit(
        "status",
        `GEWÄHLT: ${device.name}`
      );
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnect
    );

    emit("status", "VERBINDE");

    const server = await device.gatt.connect();

    const service =
      await server.getPrimaryService(
        CONFIG.serviceUuid
      );

    characteristic =
      await service.getCharacteristic(
        CONFIG.characteristicUuid
      );

    characteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await characteristic.startNotifications();

    connected = true;

    emit(
      "status",
      `VERBUNDEN: ${device.name || "K9MATICS"}`
    );
  }

  function handleDisconnect() {
    connected = false;
    characteristic = null;

    emit("status", "SENSOR GETRENNT");
  }

  async function disconnect() {
    try {
      if (characteristic) {
        await characteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(error);
    }

    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }

    characteristic = null;
    device = null;
    connected = false;

    emit("status", "SENSOR GETRENNT");
  }

  return {
    on,
    connect,
    disconnect,
    isConnected: () => connected
  };
})();
