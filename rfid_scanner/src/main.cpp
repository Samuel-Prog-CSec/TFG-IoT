#include <Arduino.h>
// RFID RC522 SPI for Wemos D1 mini - Optimized for MERN integration

#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN   5   // GPIO5 (D1)
#define SS_PIN    15  // GPIO15 (D8)
// #define LED_PIN   2   // GPIO2 (D4) - LED builtin (deshabilitado por estabilidad)

MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(2000); // Esperar a que pase el ruido de boot del ESP8266
  Serial.println("RFID Scanner v1.0 - Ready for MERN integration");

  SPI.begin();
  pinMode(SS_PIN, OUTPUT);
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(SS_PIN, HIGH);
  digitalWrite(RST_PIN, HIGH);

  // Hardware reset for clones
  digitalWrite(RST_PIN, LOW);
  delay(50);
  digitalWrite(RST_PIN, HIGH);
  delay(50);

  mfrc522.PCD_Init();
  mfrc522.PCD_AntennaOn();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_38dB);

  byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.println("{\"event\":\"error\",\"type\":\"init_failure\",\"message\":\"RC522 communication failed\"}");
  } else {
    String json = "{\"event\":\"init\",\"status\":\"success\",\"version\":\"0x" + String(version, HEX) + "\"}";
    Serial.println(json);
  }
}

void loop() {
  static bool cardPresentFlag = false;
  static String lastUid = "";
  static unsigned long lastHeartbeat = 0;
  static int cardsDetected = 0;
  static int noDetectCount = 0;

  // Heartbeat cada 10 segundos
  if (millis() - lastHeartbeat > 10000) {
    String json = "{\"event\":\"status\",\"uptime\":" + String(millis()) + ",\"cards_detected\":" + String(cardsDetected) + ",\"free_heap\":" + String(ESP.getFreeHeap()) + "}";
    Serial.println(json);
    lastHeartbeat = millis();
  }

  // Check for new cards
  bool cardPresent = mfrc522.PICC_IsNewCardPresent();

  if (cardPresent) {
    noDetectCount = 0;
    // Intentar leer UID con reintentos cortos (algunos clones requieren varios intentos)
    bool readSerial = false;
    const int maxAttempts = 3;
    for (int attempt = 1; attempt <= maxAttempts; ++attempt) {
      readSerial = mfrc522.PICC_ReadCardSerial();
      if (readSerial) break;
      delay(50); // Pequeño delay entre intentos
    }

    if (readSerial) {
      // Obtener tipo de PICC
      MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);
      String uidStr = "";
      for (byte i = 0; i < mfrc522.uid.size; i++) {
        if (mfrc522.uid.uidByte[i] < 0x10) uidStr += "0";
        uidStr += String(mfrc522.uid.uidByte[i], HEX);
      }
      // Enviar info detallada de tarjeta
      String json = "{\"event\":\"card_detected\",\"uid\":\"" + uidStr + "\",\"type\":\"" + String(mfrc522.PICC_GetTypeName(piccType)) + "\",\"size\":" + String(mfrc522.uid.size) + "}";
      Serial.println(json);

      lastUid = uidStr;
      cardPresentFlag = true;
      cardsDetected++;

      // Halt PICC
      mfrc522.PICC_HaltA();
      // Stop encryption on PCD
      mfrc522.PCD_StopCrypto1();

      delay(500); // Pausa corta antes de buscar otra
    }
    else {
      // Si falla PICC_ReadCardSerial, intentar anticollision crudo
      byte acCmd[2] = { 0x93, 0x20 };
      byte backLen = 10;
      byte backBuf[10];
      byte validBits = 0;
      MFRC522::StatusCode st = mfrc522.PCD_TransceiveData(acCmd, 2, backBuf, &backLen, &validBits, 0, false);
      if (st == MFRC522::STATUS_OK && backLen == 5) {
        // Reconstruir UID
        for (byte i = 0; i < 4; i++) {
          mfrc522.uid.uidByte[i] = backBuf[i];
        }
        mfrc522.uid.size = 4;
        mfrc522.uid.sak = 0x08;

        String uidStr = "";
        for (byte i = 0; i < mfrc522.uid.size; i++) {
          if (mfrc522.uid.uidByte[i] < 0x10) uidStr += "0";
          uidStr += String(mfrc522.uid.uidByte[i], HEX);
        }
        // Enviar UID reconstruido con info básica
        String json = "{\"event\":\"card_detected\",\"uid\":\"" + uidStr + "\",\"type\":\"Unknown\",\"size\":" + String(mfrc522.uid.size) + "}";
        Serial.println(json);

        lastUid = uidStr;
        cardPresentFlag = true;
        cardsDetected++;

        // Halt PICC
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
        delay(500);
      } else {
        String json = "{\"event\":\"error\",\"type\":\"read_failure\",\"message\":\"Anticollision failed, status: " + String(st) + "\"}";
        Serial.println(json);
      }
    }
  } else {
    noDetectCount++;
    if (noDetectCount > 10 && cardPresentFlag) {
      String json = "{\"event\":\"card_removed\",\"uid\":\"" + lastUid + "\"}";
      Serial.println(json);
      cardPresentFlag = false;
      lastUid = "";
    }
    delay(100);
  }
}