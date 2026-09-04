"use strict";

/*
  HARNELYZER
  BLE-Sensorverbindung

  Aktuell erwartete UUIDs:
  Service:
  19B10000-E8F2-537E-4F6C-D104768A1214

  Characteristic:
  19B10001-E8F2-537E-4F6C-D104768A1214
*/

const Sensor = (() => {
  const CONFIG = {
    serviceUuid:
      "19B10000-E8F2-537E-4F6C-D104768A1214",

    characteristicUuid:
      "19B10001-E8F2-537E-4F6C-D104768A1214",

    showAllDevicesForTest: true
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
    listeners[type].push(callback);
  }

  function emit(type, value) {
    listeners[type].forEach(callback => {
      callback(value);
    });
  }

  function deviceName() {
    return device?.name ||
      "UNBEKANNTES GERÄT";
  }

  function parsePacket(dataView) {
    if (dataView.byteLength === 1) {
      const raw = dataView.getUint8(0);

      return {
        accX: 0,
        accY: 0,
        accZ: 1 + (raw - 128) / 128,
        gyroX: 0,
        gyroY: 0,
        gyroZ: 0,
        raw
      };
    }

    const bytes = new Uint8Array(
      dataView.buffer,
      dataView.byteOffset,
      dataView.byteLength
    );

    const text = new TextDecoder()
      .decode(bytes)
      .trim();

    const values = text.split(",").map(
      value => Number(value.trim())
    );

    if (values.length >= 3) {
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

    throw new Error("UNGÜLTIGES DATENPAKET");
  }

  function handleValue(event) {
    try {
      const parsed = parsePacket(
        event.target.value
      );

      emit("data", {
        ...parsed,
        timestamp: Date.now()
      });
    } catch (error) {
      emit(
        "error",
        `PAKETFEHLER: ${error.message}`
      );
    }
  }

  function handleDisconnect() {
    connected = false;
    characteristic = null;

    emit("status", "SENSOR GETRENNT");
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "WEB BLUETOOTH NICHT VERFÜGBAR"
      );
    }

    emit("status", "GERÄT AUSWÄHLEN");

    if (CONFIG.showAllDevicesForTest) {
      device =
        await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,

          optionalServices: [
            CONFIG.serviceUuid
          ]
        });
    } else {
      device =
        await navigator.bluetooth.requestDevice({
          filters: [
            {
              services: [
                CONFIG.serviceUuid
              ]
            }
          ]
        });
    }

    device.addEventListener(
      "gattserverdisconnected",
      handleDisconnect
    );

    emit(
      "status",
      `VERBINDE: ${deviceName()}`
    );

    const server =
      await device.gatt.connect();

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
      handleValue
    );

    await characteristic.startNotifications();

    connected = true;

    emit(
      "status",
      `VERBUNDEN: ${deviceName()}`
    );
  }

  async function disconnect() {
    if (
      device?.gatt &&
      device.gatt.connected
    ) {
      device.gatt.disconnect();
    }

    handleDisconnect();
  }

  return {
    on,
    connect,
    disconnect
  };
})();
