#include <Arduino.h>
// RFID RC522 SPI for Wemos D1 mini - Optimized for MERN integration
// T-905 B8: HMAC-SHA256 del UID canónico + counter monotónico EEPROM (anti-replay).
// Mejoras hardware conservadas: SPI 4MHz, reintentos VersionReg, verificación BCC
// en la anticolisión cruda, macro F() para strings en flash.

#include <SPI.h>
#include <MFRC522.h>
#include <EEPROM.h>
#include <bearssl/bearssl_hmac.h>
#include <bearssl/bearssl_hash.h>

#define RST_PIN   5   // GPIO5 (D1)
#define SS_PIN    15  // GPIO15 (D8)
// #define LED_PIN   2   // GPIO2 (D4) - LED builtin (deshabilitado por estabilidad)

// =============================================================================
// HMAC + Counter EEPROM (T-905 B8)
// =============================================================================
// El secret se inyecta en build-time vía -DRFID_HMAC_SECRET="..." en
// platformio.ini. NUNCA se commitea al repo. Ver README.md sección "Provisionado".
// Si la macro no está definida, queda un stub que el backend rechazará cuando
// RFID_HMAC_ENABLED=true, forzando provisionar correctamente antes de prod.
#ifndef RFID_HMAC_SECRET
  #define RFID_HMAC_SECRET "stub-secret-replace-via-build-flags-before-production"
#endif

// EEPROM layout: offset 0..3 = counter monotónico (uint32_t little-endian).
// Persistimos en BATCH: cada CTR_PERSIST_INTERVAL scans escribimos el "techo".
// En boot saltamos al techo persistido para garantizar monotonicidad estricta.
// Reduce el wear-out de EEPROM (~100k ciclos) de 1 escritura/scan a 1 cada 100.
const uint32_t CTR_PERSIST_INTERVAL = 100;
const size_t   EEPROM_SIZE = 16;

uint32_t currentCounter = 0;
uint32_t persistedCeiling = 0; // siguiente "techo" persistido en EEPROM

void loadCounterFromEEPROM() {
  EEPROM.begin(EEPROM_SIZE);
  uint32_t ceiling = 0;
  for (size_t i = 0; i < 4; i++) {
    ceiling |= ((uint32_t)EEPROM.read(i)) << (i * 8);
  }
  // EEPROM virgen (0xFFFFFFFF) → empezamos desde 0.
  if (ceiling == 0xFFFFFFFF) {
    ceiling = 0;
  }
  currentCounter = ceiling;
  persistedCeiling = ceiling + CTR_PERSIST_INTERVAL;
  // Reservar el siguiente techo ya mismo.
  for (size_t i = 0; i < 4; i++) {
    EEPROM.write(i, (persistedCeiling >> (i * 8)) & 0xFF);
  }
  EEPROM.commit();
}

void maybePersistCounter() {
  if (currentCounter < persistedCeiling) {
    return;
  }
  persistedCeiling = currentCounter + CTR_PERSIST_INTERVAL;
  for (size_t i = 0; i < 4; i++) {
    EEPROM.write(i, (persistedCeiling >> (i * 8)) & 0xFF);
  }
  EEPROM.commit();
}

// Convierte un buffer a string hex en minúsculas.
String toHex(const uint8_t* buf, size_t len) {
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    char tmp[3];
    snprintf(tmp, sizeof(tmp), "%02x", buf[i]);
    out += tmp;
  }
  return out;
}

// HMAC-SHA256(secret, "uid:counter") en hex. El uid llega YA en mayúsculas
// (forma canónica del sistema), de modo que coincida con lo que recalcula el backend.
String computeHmac(const String& uid, uint32_t counter) {
  String message = uid + ":" + String(counter);
  br_hmac_key_context kc;
  br_hmac_key_init(&kc, &br_sha256_vtable, RFID_HMAC_SECRET, strlen(RFID_HMAC_SECRET));
  br_hmac_context ctx;
  br_hmac_init(&ctx, &kc, 0);
  br_hmac_update(&ctx, message.c_str(), message.length());
  uint8_t digest[32];
  br_hmac_out(&ctx, digest);
  return toHex(digest, 32);
}

MFRC522 mfrc522(SS_PIN, RST_PIN);

// Emite un card_detected firmado. Canoniza el UID a MAYÚSCULAS (igual que
// card_decks y el backend) ANTES de firmar y de serializar, para que el HMAC
// recalculado en el servidor sobre el uid recibido coincida byte a byte.
void emitCardEvent(String uidStr, const String& typeName, uint8_t size) {
  uidStr.toUpperCase();
  currentCounter++;
  maybePersistCounter();
  String hmac = computeHmac(uidStr, currentCounter);
  String json = "{\"event\":\"card_detected\",\"uid\":\"" + uidStr +
                "\",\"type\":\"" + typeName +
                "\",\"size\":" + String(size) +
                ",\"counter\":" + String(currentCounter) +
                ",\"hmac\":\"" + hmac + "\"}";
  Serial.println(json);
}

void setup() {
  Serial.begin(115200);
  delay(500); // Esperar a que pase el ruido de boot del ESP8266
  loadCounterFromEEPROM();
  Serial.println(F("{\"event\":\"init\",\"status\":\"starting\",\"version\":\"rfid_v1.1\"}"));

  SPI.begin();
  SPI.setFrequency(4000000); // 4MHz — estable para RC522

  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, HIGH);

  // Hardware reset del RC522
  digitalWrite(RST_PIN, LOW);
  delay(50);
  digitalWrite(RST_PIN, HIGH);
  delay(50);

  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(MFRC522::RxGain_38dB);

  // Verificar comunicacion con reintentos (clones a veces tardan en responder)
  byte version = 0x00;
  for (byte attempt = 0; attempt < 5; attempt++) {
    version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
    if (version != 0x00 && version != 0xFF) break;
    delay(100);
  }

  if (version == 0x00 || version == 0xFF) {
    Serial.println(F("{\"event\":\"error\",\"type\":\"init_failure\",\"message\":\"RC522 communication failed — check SPI wiring\"}"));
  } else {
    String json = "{\"event\":\"init\",\"status\":\"success\",\"version\":\"0x" + String(version, HEX) +
                  "\",\"hmac\":\"enabled\",\"counter\":" + String(currentCounter) + "}";
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
    String json = "{\"event\":\"status\",\"uptime\":" + String(millis()) +
                  ",\"cards_detected\":" + String(cardsDetected) +
                  ",\"free_heap\":" + String(ESP.getFreeHeap()) +
                  ",\"counter\":" + String(currentCounter) + "}";
    Serial.println(json);
    lastHeartbeat = millis();
  }

  bool cardPresent = mfrc522.PICC_IsNewCardPresent();

  if (cardPresent) {
    noDetectCount = 0;
    // Reintentos cortos de lectura (algunos clones requieren varios intentos)
    bool readSerial = false;
    const int maxAttempts = 3;
    for (int attempt = 1; attempt <= maxAttempts; ++attempt) {
      readSerial = mfrc522.PICC_ReadCardSerial();
      if (readSerial) break;
      delay(50); // Pequeño delay entre intentos
    }

    if (readSerial) {
      MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);
      String uidStr = "";
      for (byte i = 0; i < mfrc522.uid.size; i++) {
        if (mfrc522.uid.uidByte[i] < 0x10) uidStr += "0";
        uidStr += String(mfrc522.uid.uidByte[i], HEX);
      }
      emitCardEvent(uidStr, String(mfrc522.PICC_GetTypeName(piccType)), mfrc522.uid.size);

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
      // Fallback: anticolisión cruda para clones con firmware no estándar
      byte acCmd[2] = { 0x93, 0x20 };
      byte backLen = 10;
      byte backBuf[10];
      byte validBits = 0;
      MFRC522::StatusCode st = mfrc522.PCD_TransceiveData(acCmd, 2, backBuf, &backLen, &validBits, 0, false);
      if (st == MFRC522::STATUS_OK && backLen == 5) {
        byte bcc = 0;
        for (byte i = 0; i < 4; i++) {
          mfrc522.uid.uidByte[i] = backBuf[i];
          bcc ^= backBuf[i];
        }
        mfrc522.uid.size = 4;
        mfrc522.uid.sak = 0x04;

        if (bcc == backBuf[4]) {
          String uidStr = "";
          for (byte i = 0; i < mfrc522.uid.size; i++) {
            if (mfrc522.uid.uidByte[i] < 0x10) uidStr += "0";
            uidStr += String(mfrc522.uid.uidByte[i], HEX);
          }
          emitCardEvent(uidStr, "Unknown", mfrc522.uid.size);

          lastUid = uidStr;
          cardPresentFlag = true;
          cardsDetected++;

          mfrc522.PICC_HaltA();
          mfrc522.PCD_StopCrypto1();
          delay(500);
        } else {
          Serial.println(F("{\"event\":\"error\",\"type\":\"read_failure\",\"message\":\"BCC mismatch in anticollision\"}"));
        }
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
