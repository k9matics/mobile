"use strict";

/*
  CANINE GAIT HUD
  sensor.js
  Version 2.2

  XIAO nRF52840
  Service UUID:
  19B10000-E8F2-537E-4F6C-D104768A1214

  Characteristic UUID:
  19B10001-E8F2-537E-4F6C-D104768A1214

  Aktuelles Datenformat:
  1 Byte, unsigned integer
*/

const Sensor = (() => {
  const CONFIG = {
    serviceUuid:
      "19B10000-E8F2-537E-4F6C-D104768A1214",

    characteristicUuid:
      "19B10001-E8F2-537E-4F6C-D104768A1214",

    packetFormat: "byte",

    /*
      true:
      Zeigt alle sichtbaren BLE-Geräte an.
      Nimm für den Test jedes "Unbekannte Gerät"
      einzeln und prüfe, ob die Verbindung klappt.

      false:
      Sucht später nur nach GAIT_SENSOR.
    */
    showAllDevicesForTest: true,

    expectedDeviceName: "GAIT_SENSOR"
  };

  let device = null;
  let server = null;
  let service = null;
  let characteristic = null;

  let connected = false;
  let notificationActive = false;

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
    const callbacks = listeners[type] || [];

    callbacks.forEach(callback => {
      callback(value);
    });
  }

  function emitStatus(text) {
    emit("status", text);
  }

  function emitError(text) {
    emit("error", text);
  }

  function getDeviceLabel(selectedDevice) {
    if (!selectedDevice) {
      return "UNBEKANNTES GERÄT";
    }

    if (
      selectedDevice.name &&
      selectedDevice.name.trim() !== ""
    ) {
      return selectedDevice.name;
    }

    return "UNBEKANNTES GERÄT";
  }

  function parseByte(dataView) {
    if (!dataView || dataView.byteLength < 1) {
      throw new Error("LEERES DATENPAKET");
    }

    const rawValue = dataView.getUint8(0);

    /*
      Ein Byte kann keine vollständigen
      X/Y/Z- und Gyro-Werte enthalten.

      Daher wird der Wert zunächst als
      Bewegungsstärke in Z-Richtung genutzt,
      damit sich RAW-Anzeige und Graph bewegen.

      Für echte Ganganalyse muss die Firmware
      später CSV oder ein Binärpaket mit
      mindestens accX, accY und accZ senden.
    */
    const normalizedValue =
      (rawValue - 128) / 128;

    return {
      accX: 0,
      accY: 0,
      accZ: 1 + normalizedValue,

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      raw: rawValue
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

    const values = text.split(",").map(value => {
      return Number(value.trim());
    });

    if (values.length < 3) {
      throw new Error(
        "CSV BRAUCHT MINDESTENS accX,accY,accZ"
      );
    }

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

  function parseJson(dataView) {
    const bytes = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset,
      dataView.byteLength
    );

    const text = new TextDecoder()
      .decode(bytes)
      .trim();

    const parsed = JSON.parse(text);

    return {
      accX: Number(parsed.accX) || 0,
      accY: Number(parsed.accY) || 0,
      accZ: Number(parsed.accZ) || 0,

      gyroX: Number(parsed.gyroX) || 0,
      gyroY: Number(parsed.gyroY) || 0,
      gyroZ: Number(parsed.gyroZ) || 0,

      raw: text
    };
  }

  function parseFloat32LittleEndian(dataView) {
    if (dataView.byteLength < 12) {
      throw new Error(
        "FLOAT32-PAKET IST KÜRZER ALS 12 BYTE"
      );
    }

    return {
      accX: dataView.getFloat32(0, true),
      accY: dataView.getFloat32(4, true),
      accZ: dataView.getFloat32(8, true),

      gyroX: dataView.byteLength >= 16
        ? dataView.getFloat32(12, true)
        : 0,

      gyroY: dataView.byteLength >= 20
        ? dataView.getFloat32(16, true)
        : 0,

      gyroZ: dataView.byteLength >= 24
        ? dataView.getFloat32(20, true)
        : 0,

      raw: `FLOAT32 ${dataView.byteLength}B`
    };
  }

  function parsePacket(dataView) {
    if (CONFIG.packetFormat === "byte") {
      return parseByte(dataView);
    }

    if (CONFIG.packetFormat === "csv") {
      return parseCsv(dataView);
    }

    if (CONFIG.packetFormat === "json") {
      return parseJson(dataView);
    }

    if (CONFIG.packetFormat === "float32-le") {
      return parseFloat32LittleEndian(dataView);
    }

    throw new Error(
      `UNBEKANNTES FORMAT: ${CONFIG.packetFormat}`
    );
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
      emitError(
        `PAKETFEHLER: ${error.message}`
      );
    }
  }

  function handleDisconnected() {
    connected = false;
    notificationActive = false;

    server = null;
    service = null;
    characteristic = null;

    emitStatus("SENSOR GETRENNT");
  }

  async function requestDevice() {
    if (CONFIG.showAllDevicesForTest) {
      /*
        Wichtig:
        Bei acceptAllDevices dürfen keine filters
        gleichzeitig angegeben werden.
      */
      return navigator.bluetooth.requestDevice({
        acceptAllDevices: true,

        optionalServices: [
          CONFIG.serviceUuid
        ]
      });
    }

    return navigator.bluetooth.requestDevice({
      filters: [
        {
          namePrefix: CONFIG.expectedDeviceName
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
        "WEB BLUETOOTH WIRD NICHT UNTERSTÜTZT"
      );
    }

    if (connected) {
      emitStatus(
        `BEREITS VERBUNDEN: ${getDeviceLabel(device)}`
      );

      return;
    }

    emitStatus("GERÄT AUSWÄHLEN");

    device = await requestDevice();

    if (!device) {
      throw new Error("KEIN GERÄT AUSGEWÄHLT");
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnected
    );

    emitStatus(
      `VERBINDE: ${getDeviceLabel(device)}`
    );

    if (!device.gatt) {
      throw new Error(
        "DIESES GERÄT HAT KEIN GATT"
      );
    }

    server = await device.gatt.connect();

    emitStatus("SUCHE SERVICE");

    service = await server.getPrimaryService(
      CONFIG.serviceUuid
    );

    emitStatus("SUCHE DATENKANAL");

    characteristic =
      await service.getCharacteristic(
        CONFIG.characteristicUuid
      );

    const supportsNotify =
      characteristic.properties.notify ||
      characteristic.properties.indicate;

    const supportsRead =
      characteristic.properties.read;

    /*
      Zuerst Benachrichtigungen versuchen.
      Falls diese Firmware nur Read unterstützt,
      wird weiter unten ein erster Wert gelesen.
    */
    if (supportsNotify) {
      characteristic.addEventListener(
        "characteristicvaluechanged",
        handleNotification
      );

      await characteristic.startNotifications();

      notificationActive = true;
    }

    if (!supportsNotify && supportsRead) {
      const initialValue =
        await characteristic.readValue();

      const parsed = parsePacket(initialValue);

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
    }

    if (!supportsNotify && !supportsRead) {
      throw new Error(
        "CHARACTERISTIC HAT WEDER NOTIFY NOCH READ"
      );
    }

    connected = true;

    if (notificationActive) {
      emitStatus(
        `VERBUNDEN: ${getDeviceLabel(device)}`
      );
    } else {
      emitStatus(
        `VERBUNDEN (NUR LESEN): ${getDeviceLabel(device)}`
      );
    }
  }

  async function disconnect() {
    try {
      if (characteristic && notificationActive) {
        characteristic.removeEventListener(
          "characteristicvaluechanged",
          handleNotification
        );

        await characteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(
        "Notifications konnten nicht gestoppt werden:",
        error
      );
    }

    notificationActive = false;

    if (
      device &&
      device.gatt &&
      device.gatt.connected
    ) {
      device.gatt.disconnect();
    }

    handleDisconnected();
  }

  function isConnected() {
    return connected;
  }

  function setPacketFormat(format) {
    const supportedFormats = [
      "byte",
      "csv",
      "json",
      "float32-le"
    ];

    if (!supportedFormats.includes(format)) {
      throw new Error(
        `FORMAT NICHT UNTERSTÜTZT: ${format}`
      );
    }

    CONFIG.packetFormat = format;
  }

  return {
    on,
    connect,
    disconnect,
    isConnected,
    setPacketFormat
  };
})();
