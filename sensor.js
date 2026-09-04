const Sensor = (() => {
  const CONFIG = {
    serviceUuid:
      "19B10000-E8F2-537E-4F6C-D104768A1214",

    characteristicUuid:
      "19B10001-E8F2-537E-4F6C-D104768A1214",

    /*
      Aktuell laut deiner Angabe:
      BLEByteCharacteristic = 1 Byte

      Daher zunächst:
      packetFormat: "byte"
    */

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
    (listeners[type] || []).forEach(callback => {
      callback(value);
    });
  }

  function parseValue(dataView) {
    if (CONFIG.packetFormat === "byte") {
      const value = dataView.getUint8(0);

      /*
        Falls dein Byte ein Statuswert ist, wird er
        zunächst als Bewegungswert angezeigt.
      */

      return {
        accX: 0,
        accY: 0,
        accZ: value / 100,
        gyroX: 0,
        gyroY: 0,
        gyroZ: 0,
        raw: value
      };
    }

    if (CONFIG.packetFormat === "csv") {
      const bytes = new Uint8Array(
        dataView.buffer,
        dataView.byteOffset,
        dataView.byteLength
      );

      const text = new TextDecoder()
        .decode(bytes)
        .trim();

      const values = text.split(",").map(Number);

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

    if (CONFIG.packetFormat === "float32-le") {
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
          : 0
      };
    }

    throw new Error("Unbekanntes Datenformat.");
  }

  function handleNotification(event) {
    try {
      const parsed = parseValue(event.target.value);

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
      emit("error", `DATENFEHLER: ${error.message}`);
    }
  }

  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "Web Bluetooth wird in diesem Browser nicht unterstützt."
      );
    }

    emit("status", "SENSOR AUSWÄHLEN");

    device = await navigator.bluetooth.requestDevice({
      filters: [
        {
          services: [CONFIG.serviceUuid]
        }
      ],
      optionalServices: [
        CONFIG.serviceUuid
      ]
    });

    device.addEventListener(
      "gattserverdisconnected",
      disconnect
    );

    emit("status", "VERBINDE");

    const server = await device.gatt.connect();

    const service = await server.getPrimaryService(
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
      `VERBUNDEN: ${device.name || "XIAO SENSOR"}`
    );
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