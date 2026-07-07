# Pre-script de PlatformIO (T-905 B8): inyecta el secret HMAC en build-time.
#
# Reemplaza la sintaxis bash ${VAR:+...} del build_flags, que PlatformIO no
# soporta (la sustituye literalmente y rompe el parseo del .ini). Aquí leemos la
# env var del operador y, SOLO si existe, definimos el macro RFID_HMAC_SECRET
# como literal de cadena C. Si no existe, no definimos nada: queda el stub del
# main.cpp y el backend rechaza los scans cuando RFID_HMAC_ENABLED=true
# (fail-safe que fuerza provisionar el secret antes de producción).
#
# Provisionar con:  RFID_HMAC_SECRET=<hex64> pio run -t upload
import os

Import("env")  # noqa: F821 — `Import` lo inyecta SCons en el scope del script

secret = os.environ.get("RFID_HMAC_SECRET", "").strip()
if secret:
    # StringifyMacro envuelve el valor como literal de cadena C con el escapado
    # correcto por SO, evitando los problemas de comillas entre shells.
    env.Append(CPPDEFINES=[("RFID_HMAC_SECRET", env.StringifyMacro(secret))])
    print("[inject_hmac_secret] RFID_HMAC_SECRET inyectado (%d chars)." % len(secret))
else:
    print(
        "[inject_hmac_secret] AVISO: RFID_HMAC_SECRET no definido; "
        "el firmware usará el stub y el backend rechazará los scans con HMAC activo."
    )
