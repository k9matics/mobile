"use strict";

/*
  HARNELYZER
  Projektversion: zentral aus version.js
  Datei: sensor.js

  BLE-Sensorverbindung.
  UUIDs müssen bei Web Bluetooth in Kleinbuchstaben stehen.
*/

const Sensor = (() => {
  const CONFIG = {
    serviceUuid:
      "19b10000-e8f2-537e-4f6c-d104768a1214",

    characteristicUuid:
      "19b10001-e8f2-537e-4f6c-d104768a1214",

    /*
      true:
      Zeigt alle sichtbaren BLE-Geräte, auch Geräte
      ohne Namen. Für deinen aktuellen Test nötig.
    */
    showAllDevicesForTest: true
  };

  let device = null;
  let server = null;
  let service = null;
  let characteristic = null;

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
    if (device && device.name) {
      return device.name;
    }

    return "UNBEKANNTES GERÄT";
  }

  function parseByte(dataView) {
    if (dataView.byteLength < 1) {
      throw new Error("LEERES DATENPAKET");
    }

    const raw = dataView.getUint8(0);

    return {
      accX: 0,
      accY: 0,

      /*
        Byte 0 bis 255 wird für die Anzeige
        in einen Bereich ungefähr von 0 g bis 2 g
        übertragen.
      */
      accZ: 1 + (raw - 128) / 128,

      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,

      raw
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
      .map(value => Number(value.trim()));

    if (values.length < 3) {
      throw new Error(
        "CSV-PAKET BRAUCHT accX,accY,accZ"
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

  function parsePacket(dataView) {
    /*
      1 Byte ist dein bisheriger Firmware-Testmodus.
      Größere Pakete werden als CSV interpretiert.
    */
    if (dataView.byteLength === 1) {
      return parseByte(dataView);
    }

    return parseCsv(dataView);
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
    characteristic = null;

    emit("status", "SENSOR GETRENNT");
  }

  async function selectDevice() {
    if (CONFIG.showAllDevicesForTest) {
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
          services: [
            CONFIG.serviceUuid
          ]
        }
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
        `BEREITS VERBUNDEN: ${getDeviceName()}`
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
        "GERÄT HAT KEIN GATT-PROFIL"
      );
    }

    server = await device.gatt.connect();

    emit("status", "SUCHE BLE-SERVICE");

    service = await server.getPrimaryService(
      CONFIG.serviceUuid
    );

    emit("status", "SUCHE DATENKANAL");

    characteristic =
      await service.getCharacteristic(
        CONFIG.characteristicUuid
      );

    if (
      !characteristic.properties.notify &&
      !characteristic.properties.indicate
    ) {
      throw new Error(
        "DATENKANAL UNTERSTÜTZT KEIN NOTIFY"
      );
    }

    characteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotification
    );

    await characteristic.startNotifications();

    notificationsActive = true;
    connected = true;

    emit(
      "status",
      `VERBUNDEN: ${getDeviceName()}`
    );
  }

  async function disconnect() {
    try {
      if (
        characteristic &&
        notificationsActive
      ) {
        characteristic.removeEventListener(
          "characteristicvaluechanged",
          handleNotification
        );

        await characteristic.stopNotifications();
      }
    } catch (error) {
      console.warn(
        "NOTIFICATIONS NICHT SAUBER GESTOPPT",
        error
      );
    }

    notificationsActive = false;

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

  return {
    on,
    connect,
    disconnect,
    isConnected
  };
})();
