#include <bluefruit.h>
#include <LSM6DS3.h>
#include <Wire.h>

LSM6DS3 myIMU(I2C_MODE, 0x6A);
BLEUart bleuart;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Bluefruit.begin();
  Bluefruit.setTxPower(4); 
  Bluefruit.setName("K9matics");
  Bluefruit.Advertising.restartOnDisconnect(true);
  
  bleuart.begin();
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.start(0); 

  Wire.begin();
  myIMU.begin();
}

void loop() {
  if (Bluefruit.connected()) {
    digitalWrite(LED_BUILTIN, LOW);
    
    float x = myIMU.readFloatAccelX();
    float y = myIMU.readFloatAccelY();
    float z = myIMU.readFloatAccelZ();

    // Alles zu einem einzigen sauberen String zusammenbauen
    String dataPacket = "X:" + String(x, 2) + " Y:" + String(y, 2) + " Z:" + String(z, 2);
    bleuart.println(dataPacket);
    
    delay(50); 
  } else {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(500);
    digitalWrite(LED_BUILTIN, LOW);
    delay(500);
  }
}
