# Changelog

Todas las notas notables de cambios en este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0](https://github.com/Samuel-Prog-CSec/TFG-IoT/compare/v1.0.0...v2.0.0) (2026-07-07)


### ⚠ BREAKING CHANGES

* **frontend:** organización de carpetas del frontend reestructurada

### Features

* `extractSessionItems` para simplificar la extracción de datos de sesiones ([2729294](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2729294a3d2722c2f796733c5f231d04fe0f49cb))
* `GameEngine` con bloqueo de partidas y procesamiento por lotes ([18a0d1c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18a0d1ceda001723eb0df44e8df0ec5f22f605a8))
* **`sessionStatus`:** optimizada la recuperación de contadores de juego mediante agregación ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* actualización de dependencias y adición de componentes reutilizables ([052e286](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/052e286f6ceed917c0dbcac591fec5f19d12886d))
* actualización de la gestión y análisis de sesiones ([995008b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/995008b7c96dc6b740f7d81be22a7a92d263036c))
* actualizado el estado de tareas del Sprint 3 ([bc53500](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/bc53500b254bbd5b50c1d7ebdb67415e93df4eb7))
* alinear ESLint con SonarCloud añadiendo plugins de seguridad, regex, secrets y promises ([7862130](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7862130c1db5ff09ecfd2822c41ff1c9d6e8ba0e))
* añadida documentación sobre vulnerabilidades avanzadas en el TFG ([f4b30f0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f4b30f09615a07af448e181eb1d1c9fcab618f5a))
* añadido DeckEditPage para editar mazos de cartas con contexto y asignaciones de assets ([456dbad](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/456dbad2144c916ca6d7441abf8f25a2e4633eda))
* añadido el componente reutilizable `ConfirmationModal` ([3128433](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3128433a1822261307bc4931f0a43de32f524211))
* añadido logging de seguridad ([f54016d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f54016d728d1371d2ff9edc84c6c9a7652d6be28))
* añadido pipeline CI/CD e integración real con SonarQube ([a1edd48](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/a1edd48aabf2bc94a2aacad53a5c267b791db3ee))
* añadido servicio de estado de sesión para una gestión centralizada ([18a0d1c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18a0d1ceda001723eb0df44e8df0ec5f22f605a8))
* añadido un hook para el motion reducido del frontend ([f506caa](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f506caadb9738509108a86bf789cec8cd0adfadc))
* añadir celebración confetti en pantalla de fin de partida ([e395ec3](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e395ec3436056cd9eaf17e74f5bf27c9535f509d))
* auditoría integral pre-v1.0.0 — endurecimiento, perf, a11y y limpieza ([653c558](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/653c558a01268d0d8d1cc78effc928d37c4fc805))
* borrado de contextos en cascada, sesiones como historial y audio en pistas de Secuencia ([3743e6e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3743e6ebad7dc4d99da29e1a21c0831bfc2ab8b9))
* cambiado changelog al directorio raíz ([843e20c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/843e20ce48c0c765e2901946ba13a4cce234ce90))
* construir suite completa de analytics frontend con 4 páginas, 11 componentes y framework RAG ([c997062](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c9970624db4c656884e9f738003703581cdddb01))
* creadas tareas para el Sprint 4 ([3368ebb](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3368ebba44791945fc45c63b781a7496f0150938))
* creado `CardDeckDetailPage` para el display de información de mazos ([f506caa](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f506caadb9738509108a86bf789cec8cd0adfadc))
* creado proceso de gestión de dependencias en `03-Gestion_Dependencias.md` ([6d76705](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6d767059ac5b17f3b4091c385551fb898f27df52))
* crear skeletons especializados para gráficos y grids de cards ([1d1ab94](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1d1ab948071405bfca705faf6722bd2bea19d1ba))
* **dashboard:** implementación del sistema de analíticas avanzado y optimización de datos ([112023d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/112023df52cc4479a46d66022247a29aa1fbc34a))
* dashboards y BI — matriz cruzada, vista de centro e informes persistidos ([5b66237](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/5b6623718ab6fb7fd8b48f1bc34376f259eaeb75))
* desarrolladas pantallas de gameplay funcionales ([1abc812](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1abc8125e23fbe0de0050279fdd0c6a31bf505a2))
* **documentation:** movidas tareas al Sprint 4 ([d7e9d7a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d7e9d7a0c52e52510aa12cdcac770672238a2ae8))
* endurecer consentimiento parental, centralizar RGPD en super_admin y añadir UI de privacidad ([75db90e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/75db90ea612dc58af3319932a0600c7046199f0f))
* escala canónica de estrellas de 5 niveles, optimizaciones de analytics y limpieza ([80c10f5](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/80c10f54000d9e04a2891a879e9d60819f873d73))
* expandir analytics backend con 19 endpoints, framework KPI y corrección de datos ([aadd172](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/aadd17268da508387b1b1836a7b542eb91a7fe0e))
* **frontend:** revisión código y mejoras en la arquitectura ([6039945](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6039945ca56c2deaa349cf7300c0b9e814b81ac8))
* **game:** banner de errores de sensor y mejoras de UI en la partida ([a32f731](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/a32f7319bf0cc51babdaeb952bcb9cc892021194))
* **game:** completar y robustecer la mascota Otto ([821fd88](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/821fd889f0eafdc0043d510d324a61ffdc94c581))
* **game:** guía de Otto en el onboarding, saludo en login y rig pulido ([d98406b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d98406b79def2268a34e82a6c00d66eac34d5c0e))
* gestión de escaneos pendientes para RFID en las desconexiones de sockets ([1abc812](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1abc8125e23fbe0de0050279fdd0c6a31bf505a2))
* implementación de benchmarks de bloqueo de cartas Redis ([4b88450](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/4b884505b6cfc3864f0b1513e74d4f3965514ace))
* implementación de patrones State y Strategy para RFID y mecánicas de juego ([b8dc907](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b8dc90765a73e734ac6f5c0592f960c7c18c6603))
* implementada funcionalidad de transferencia de alumnos (CRUD) ([03bd101](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/03bd101a1749b3c4a1b377c13c7dbea38c987ee8))
* implementada la función de clonación de sesiones ([e120ba3](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e120ba3f94646e5c5e311eee879d7d338117cc54))
* implementada la gestión automática del modo RFID y la validación de sensores ([5c73d75](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/5c73d7514e77f2a416c3c97cc4c17d3775b23d93))
* implementadas mecánicas de juegos de memoria y asociación ([eec220c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/eec220c1c170bc806dfbc88ff64dcdb750fdc832))
* implementadas optimizaciones de lectura con consultas ajustadas y almacenamiento en caché ([3fc5152](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3fc51529efc2388fc52fea98a51134319790069c))
* implementadas páginas de gestión de contexto ([0adadf4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0adadf4395a9a8cadc58e81cf710e673c3ed6764))
* implementado `AbortController` para la cancelación de solicitudes al desmontar componentes ([18befa0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18befa0e6e86ebb9ffbac7463f787556c90adc29))
* implementado el contexto del modo RFID ([495cbfa](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/495cbfa1655d6cbfe40d31fb7b0f02dfc9d64fff))
* implementado refresh token solo con cookie `httpOnly` y body vacío ([2529484](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2529484c5c00d509bf099af33166a2c75a67a96c))
* implementar cache Redis para mecánicas, contextos y analytics ([8ca9a5e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8ca9a5ed3f8c02c6333274501214fe549ac32a52))
* implementar derecho de oposición a analytics, audit trail y planificación CSFLE ([d904077](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d9040772f95caee966ec4f815a88203ae6401d3f))
* implementar la capa dto v1 y el contrato de respuesta ([b390e2c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b390e2c24c4b4722af1d491031eb7890da3aabd1))
* implementar protección de datos de menores (RGPD/LOPDGDD) ([b9829f0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b9829f0e58f4bfc3dc044c00f9b05e36b05891f8))
* implementar seudonimización, exportación de datos y medidas RGPD adicionales ([0a87840](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0a87840fe214348d65cb77ec5de7d2869f0dd4de))
* incluída configuración de Nginx para el frontend. ([964b335](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/964b335160600d62f2a5aaefa0389c01a137bed6))
* incluido temporizador, solo se anuncian umbrales críticos definidos ([1abc812](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1abc8125e23fbe0de0050279fdd0c6a31bf505a2))
* integración de Sentry para mejorar la monitorización ([fd2d821](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fd2d82154b311168eac1cd57ebe0bd1e7416708e))
* limitada la capacidad de profesores para gestionar usuarios ([0adadf4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0adadf4395a9a8cadc58e81cf710e673c3ed6764))
* mecanica Secuencia + pulido de las 3 mecánicas ([#315](https://github.com/Samuel-Prog-CSec/TFG-IoT/issues/315)) ([ff91ae6](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ff91ae6738a186453abb7a0b469f96850017ab8b))
* mejora de las medidas de seguridad y la calidad del código ([540eb9f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/540eb9f82c0809160b8da899f6e268e72eb0a1ce))
* mejorada la experiencia de juego con reconexión y recuperación táctil ([1fffa9e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1fffa9ed5a9078872d9b6cf5fcd5b6183712c7ae))
* mejorada la gestión del contexto y la subida de assets a Supabase Storage ([4646618](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/46466187ebba873acbd92198548f97833125d908))
* mejoradas las comprobaciones del origen de `WebSockets` ([002a6a7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/002a6a7cd4ca40e587e4b3fcb8d6b57c764c8be9))
* mejorado el manejo de assets y la configuración de subida ([8ca379f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8ca379ff39875252a77cae376f799ce335bb391a))
* mejorados mensajes de retroalimentación en interacciones durante partidas ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* mejorar CI, corregir bugs y refinar UI de gameplay y analytics ([59f4b88](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/59f4b884c7f7681dd0f1ca15d46625e6d2839f4f))
* migración de la arquitectura RFID a la API Web Serial ([91fac75](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/91fac75bfb9e934752e245d5482f228498934ba0))
* migrar el despliegue de Koyeb a una VPS Contabo autoalojada ([6435d62](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6435d6283d61fb4c75febb7227f219866efd374c))
* multi-environment deploy de Docker ([ad44702](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ad4470297232b77a2a91879307606f25824e16b2))
* nuevos endpoints para analiticas y dashboards ([437e337](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/437e3377283a40121067ad3293a9eccf33623cbe))
* paquete UI/UX Sprint 6 — tema, atmósferas, motion, logout undo ([#319](https://github.com/Samuel-Prog-CSec/TFG-IoT/issues/319)) ([00d7aa0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/00d7aa0e9ed2647233d39c9eb278d9138581d389))
* protección de datos de menores — eje RGPD completo ([40ada5d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/40ada5d4dd332aa5806453e0243bd3c82aa8f7e5))
* pulido de las 3 mecánicas, reglas canónicas puntuación y SessionDetail mecánica-aware ([ba023d5](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ba023d5366797aabee493dccdcfd6f2c56fc0756))
* pulido UI/UX, accesibilidad AA, filtros de analytics y rendimiento ([1b58f11](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1b58f1183e0e3b44f6529432cab7d4eeb177f588))
* **redis,flags:** feature flags, BullMQ worker, WS rate limit y RFID mode distribuidos ([9431ef2](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/9431ef2cac3f457add361f7c7d633429d5cf6c73))
* refuerzo de seguridad para la validación del payload ([002a6a7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/002a6a7cd4ca40e587e4b3fcb8d6b57c764c8be9))
* **rfid:** activar enforcement HMAC end-to-end consciente del origen ([3ea6eb4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3ea6eb4667e2414288aff91c71b1b6345663cabc))
* **rfid:** endurecimiento integral del pipeline de comunicación con sensor ([4d7dc66](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/4d7dc66a36885f05dd5da109f4abdacb475acc52))
* **rfid:** integrar firma HMAC anti-replay en el firmware del sensor ([22b4d4e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/22b4d4e394e090f195f65df1e4c6bc219f3c9515))
* **rfid:** observabilidad de seguridad HMAC con metricas y alerta de anomalias ([08a96ca](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/08a96ca44e9407e29b98c76228cb98047d8e6ae6))
* robustez de partidas, mascota coherente y locución configurable de la consigna ([5cf7f3b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/5cf7f3b9d5a3cb8dcc9daa69a3528d25ada0452b))
* scripts Lua para la reserva, liberación y renovación de tarjetas atómicas ([4b88450](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/4b884505b6cfc3864f0b1513e74d4f3965514ace))
* se agregó el panel de aprobación de profesores ([daf74ff](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/daf74ff6e9fe44c9373087c2ded9c9bd36f1362a))
* **security:** mejoradas las medidas de seguridad y del manejo de datos ([e7f49aa](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e7f49aa2c935d960daacb1d75104649df508201c))
* seguimiento de la caché de autenticación de `WebSocket` ([18a0d1c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18a0d1ceda001723eb0df44e8df0ec5f22f605a8))
* seguridad con autenticación de WebSockets y API ([795593f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/795593ff57f474561f006eb69ebaac25e33e589a)), closes [#71](https://github.com/Samuel-Prog-CSec/TFG-IoT/issues/71)
* **seguridad:** fortalecer los websockets con autenticación, salas, rate limiting y métricas ([cfe013b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/cfe013bfc342b0ffc0a567a342b43260125458d1))
* servicios (junto con frontend y backend) preparados para Dockerización. ([964b335](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/964b335160600d62f2a5aaefa0389c01a137bed6))
* sistema de assets multimedia mejorado con audio vinculado, LQIP y auditoría UX ([6835c4e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6835c4e9cd5567e5edb39868ba5a7e27bf9fbc42))
* Sprint 6 cloud foundation + CD + security/observability/performance v1.0.0 ([#320](https://github.com/Samuel-Prog-CSec/TFG-IoT/issues/320)) ([c9470bf](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c9470bf63f2f5ebc74a400122268b05777b16fc3))
* suite completa de analytics — backend, frontend y tests ([26105c0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/26105c016a3e514cbe711c7530f8e34644610849))
* tarjetas RFID como tokens fungibles (ADR-012) ([5a31fae](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/5a31faebadb3b8749567365f481674aeed3e4b30))
* **tests:** añadidos tests para el componente `GameSession` ([1abc812](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1abc8125e23fbe0de0050279fdd0c6a31bf505a2))
* **tests:** pruebas para nuevas funciones (recuperación táctil) ([1fffa9e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1fffa9ed5a9078872d9b6cf5fcd5b6183712c7ae))
* **ui,a11y:** empty states contextualizados, variantes de modal y a11y keyboard-first ([ad8b364](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ad8b364d36263b5e44f85f120671c0f46cdde5c6))
* **ui,motion:** sistema signature Tactile RFID + Paper pan-app ([eff7f52](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/eff7f52212792fab117a02b4af8b894214a31bb3))
* **ui:** pulir UI y diseño estético ([44b933d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/44b933ddd2b73cf69e979e9ccfd41d6b046172c2))
* **validacion:** endurecer esquemas Zod y validar todas las requests ([a925198](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/a92519804df934355db5fe63a1cfe8cab80b7045))
* **validators:** actualizados esquemas para imponer el tipo de cadena en `displayData` y `rules` ([3bf083f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3bf083f26917c9ae86550bb7ba427b0d4ba4d592))


### Bug Fixes

* `DeckCreationWizard` y `DeckEditPage` con espaciado y relleno mejorados ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* `DeckEditPage` y `SessionsPage` con un manejo de datos mejorado ([2729294](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2729294a3d2722c2f796733c5f231d04fe0f49cb))
* **`gamePlayValidator`:** requerido `roundNumber` en `addEventSchema` ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* `MemoryBoard` indica visualmente los estados de error/acierto ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* accesibilidad WCAG, microcopy y bugs de score, GameOver y socket ([68a3a5f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/68a3a5fa69d4a1053751f8fc0f0229ea7eeb1206))
* actualizado `.gitignore` ([6d0b568](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6d0b56837ddb92c12eb686f38597e18ab2b48821))
* actualizado `sonar-project.properties` para excluir código C/C++ del análisis ([663b6e6](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/663b6e65c9b0c5c16c054a9201c3d7bd9e4bf180))
* actualizado `sonar-project.properties` para excluir tests en frontend ([3368ebb](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3368ebba44791945fc45c63b781a7496f0150938))
* actualizado `SonarSource/sonarcloud-github-action@v5` ([8e1be63](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8e1be63c7b5cf37b3ff5860957f3ce1e1fafae49))
* actualizar lodash a 4.18.1 para resolver vulnerabilidades de seguridad ([2fbaff3](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2fbaff31326895fb22f2d39a1532afcbcd9e8c90))
* actualizar versión del frontend a 0.2.0 en package.json ([99f35d7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/99f35d7445bcd73455dec7fbdd1b1bef63974c9a))
* ajustes varios backend y frontend post-QA ([136b2b7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/136b2b7f65ed553d17b91108eddf0c711cc2e53c))
* alinear el fallback del refresh token a 7d y el minimo de Node a 24.14.0 ([e5e4edb](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e5e4edbbd6ac853b6f2f2142f2c99602ccd9f732))
* ampliados Rate limmits a unos números más realistas ([18befa0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18befa0e6e86ebb9ffbac7463f787556c90adc29))
* añadido soporte para reduced-motion en animaciones donde faltaba ([ec11150](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ec11150e4fab7d307cc2194e41ac3fa7dbb8002c))
* añadir autenticación por contraseña a Redis en Docker Compose ([ae511bc](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ae511bc8be241ab412fc0ce2cf4c1a609addf9e6))
* arreglado bug que impedía empezar partidas ([1447c2a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1447c2aceec6230634fc773ab7ec9b00e887ddb8))
* arreglado bug que impedía visualizar algunas pantallas ([18befa0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18befa0e6e86ebb9ffbac7463f787556c90adc29))
* arreglado busgs visuales ([1139fe1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1139fe1206cd26c5c8907b8dbc2d810beba1c449))
* aumentaron los intentos de reconexión de sockets y el delay ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* bugs corregidos de renndimiento y filtros ([63eb15c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/63eb15c16301650a8d0a39fc9012dc1134564c78))
* **build:** actualizadas versiones de Node.js y MongoDB en la configuración CI ([f09e087](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f09e0874b514d2f3522847e2de5c25cfd47ee445))
* **build:** corregida version de  MongoDB a 8.0 ([3f3f7f6](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3f3f7f67586476b6a17bc7cea64762973c3f87e1))
* **CI:** cambiada versión de `sonarqube-scan-action` a `v6` porque `v5` era obsoleta/vulnerable ([c24b06e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c24b06e438cc9d78eb2118f3c7f71817e3264c3a))
* corregida vulnerabilidad moderada en brace-expansion ([c11ecb9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c11ecb9e48fc69cee333a2ae8341738c3600de88))
* corregido `dependabot` para evitar ruido de pull requests frecuentes ([d07c00f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d07c00fd2cdaf114ca53047065b8232a7c260098))
* corregido el problema que cargaba los seeders siempre y de build del contenedor ([73d9809](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/73d980956ff1f18d46b83c029bc8c5789e6fdb3e))
* corregidos warnings de los linters y elimiando feature flags ([93d925a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/93d925a1c167df4b5d2118238634ad2f43847a88))
* corregir permisos admin en mechanics y URLs de assets Números ([24a4667](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/24a4667b589c7fd1e026a62c5362167722f9b809))
* corregir tildes y mejorar la validación de pares en sesiones de memoria ([0d1c20d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0d1c20dfe5300cbc049e91bb27113186c63adfb2))
* dependencias vulnerables y outdated ([48d3d20](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/48d3d20e20e6f2cb32bd7f7cec66b5092b04b7ad))
* **dependencies:** actualizadas versiones framer-motion y recharts; add prop-types ([ccef50f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ccef50fe6683888270168b1d2932c958095f88b1))
* ejecutados fix de linters en backend y frontend. ([964b335](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/964b335160600d62f2a5aaefa0389c01a137bed6))
* eliminado caret de la dependencia `file-type` ([e239865](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e2398658368bab20dc6874cd64b3ed5dba43eca0))
* excepcion de licencia para dos falsos positivos en Dependency Review ([6aa5f6a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6aa5f6a056b1b8bae4de625a1b7aeb8362465ba5))
* excluir nuevas advisories browser-safe de axios y follow-redirects en security gate ([0f586f0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0f586f0aafee2bf8d336ee4f9e6d4f4ad68178b7))
* fijar axios a 1.14.0 y excluir SSRF browser-safe del security gate ([ba804c3](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ba804c323b06e6a61bfe91a97c2668e05a30df48))
* **firmware:** inyectar el secret HMAC vía pre-script de PlatformIO ([dc4809d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/dc4809d04d1cc203933557edb7474c988e308e20))
* **game:** fit-to-viewport y columnas adaptativas en pantallas de partida ([07051f0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/07051f010ba3af1bb50479389e6b78e0e1763738))
* **game:** robustez y corrección de las 3 mecánicas de juego ([7053fb9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7053fb9c26914789ed689fea1cb83113e67269db))
* incluido coverage de test del frontend para SonarCloud ([48d3d20](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/48d3d20e20e6f2cb32bd7f7cec66b5092b04b7ad))
* integridad de analytics, robustez de graficos y seeders deterministas ([314fb16](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/314fb16c655be284d7437e23a16682436b566d8a))
* integridad de datos analytics, Nginx y subsistema de notificaciones ([c10e1a6](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c10e1a6d4f62533c7888c5cbdb3f7132c50c9672))
* **lint:** corregidos warnings del linter en frontend y backend ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* mantener el onboarding completado al salir de una partida ([f83b35c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f83b35c5cc6bd3a26f5f2dcd9c1fa3ef5ee2b1a2))
* mejora de `GameOverScreen` con estadísticas de resumen detalladas ([fe3bd38](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fe3bd387965957f83aafcb0a72be60c297bcb170))
* mejorada API con un mejor manejo de errores y parámetros ([2729294](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2729294a3d2722c2f796733c5f231d04fe0f49cb))
* mejorado la carga de assets en lugar de emojis en las cartas ([0adadf4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0adadf4395a9a8cadc58e81cf710e673c3ed6764))
* mejorados `CreateSession` y `GameSession` para enrutamiento y obtención de mejor puntuación ([fe3bd38](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fe3bd387965957f83aafcb0a72be60c297bcb170))
* mejorados seeders desactualizados ([1139fe1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1139fe1206cd26c5c8907b8dbc2d810beba1c449))
* **microcopy:** de-jergar etiquetas, alertas y mensajes de error para docentes ([9a0f8fc](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/9a0f8fc63bef7b84b760f607cc82a208ec7395c2))
* pulido pre-release de analytics, gameplay y detalle de sesión ([4d188b1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/4d188b1c8e3f149cda6d5508b97bc039318aac1c))
* pulido UI/UX de mascota, cartas físicas blancas y juego sin filtrar la respuesta ([879c5ea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/879c5ea3dab0942e13e6812f40de776d1929daf0))
* **qa,game,ui:** sesión QA senior pre-release v0.5.0 — score clamp, emojis→Lucide, layout gameplay ([2b32c6b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2b32c6b742dc91b844e9058380b23050c9c43976))
* **qa,sonar:** bugs y hallazgos SonarQube Cloud post-release ([4f50117](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/4f5011743b627042862416b0ef1bc8712ede763f))
* **qa,ui,auth:** auditoría QA v0.5.0 — bugs críticos auth y polish UI/UX completo ([b9f2952](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b9f295235db17c7056e30f1d93e104581e7956cc))
* **redis,security:** lazy promotion del rate-limit distribuido y resiliencia ante caidas de Redis ([8d3d913](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8d3d9137bdebbf270a1dfe7910671600e4915bca))
* refactorización de componentes `memory` para mejorar rendimiento y accesibilidad ([fe3bd38](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fe3bd387965957f83aafcb0a72be60c297bcb170))
* refactorizados seeders para adaptarse mejor al sistema actual ([18befa0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/18befa0e6e86ebb9ffbac7463f787556c90adc29))
* refuerzo de seguridad/RGPD, leaderboard en porcentaje y estados de UI ([0cb1519](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0cb1519b546e241a47750af3b2b0f289bae5cbc3))
* resolver hang infinito de tests frontend en CI ([688b047](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/688b0477c7ecbc7f9390fcfe22bda8f53f99c4cb))
* resolver todos los warnings de ESLint en backend y frontend (226 → 0) ([bea273b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/bea273b1f503aa303a5715de81efc7034738a7ca))
* resolver vulnerabilidades de dependencias y OOM del CI en Backend Tests ([30a6694](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/30a66944082e8b67a217dd772c4df13b4cdf837e))
* robustez de producción de las partidas en las 3 mecánicas ([6e74d3c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6e74d3cd6b8c607c4402762c22a9aab817fe1b9c))
* robustez de producción en coste Redis, notificaciones, observabilidad y estados de error ([fc83494](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fc8349441c99f0bedd87a4d7f2b37d7c6dfeac23))
* robustez de producción en UI, Redis/Upstash, transacciones e índices ([ca9c3ac](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ca9c3ac8163d3e3eba033213398ef886fbeb0536))
* robustez y seguridad de producción en realtime, partidas, analytics y UI ([6dea966](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6dea966c5207ee72314ce96c0f0fd8e119a952af))
* **router:** corregir enrutado y estadísticas ([44b933d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/44b933ddd2b73cf69e979e9ccfd41d6b046172c2))
* **session:** corregir slider de penalización — relleno proporcional al thumb ([62585ea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/62585eaf6b8f5c9ca5cf86638f9ce656e1333f98))
* **sessions:** corregidos textos en detalle y página de sesiones ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* **sonar:** ajustada configuración de SonarQube ([f09e087](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f09e0874b514d2f3522847e2de5c25cfd47ee445))
* subida de assets, audio de partida, trust proxy y rate-limit free-tier ([fd33b9d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fd33b9dcd526c0e81e8fd9219495dbdf2abb6ae9))
* subir timeout del job SonarCloud para no cancelar el CI completo ([1eb04b6](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1eb04b613fb1501021d6c897abfa60575b5a1e95))
* unificar el limite de tarjetas a 2-20 en mazos y partidas ([d71588c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d71588cf9ae6429f37107ad29d89305d21732321))


### Performance

* aplicar lean() automático en queries de listado y añadir índices compuestos ([9e64344](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/9e64344e6e1f136f92010bcdda92962b25eb4dc9))
* eliminar fuente muerta Space Grotesk y memoizar objetos inline en GameSession ([2e0cf9a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2e0cf9a76f030de2f04a9c9017462956811c923c))
* extraer constantes de animación de CharacterMascot a nivel de módulo ([2b1ef87](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2b1ef879504a4b3584281d8d7171d22f07790572))
* memoización frontend y lean/proyección en agregaciones backend ([f173aff](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f173aff28047efb31dbdc8a6d19171022a078046))
* optimización end-to-end pre-release v1.0.0 ([6c9790a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6c9790aaf442864b4892b63157b386a4ebfe4f16))
* **redis:** cobertura cache analytics, cache auth, idempotencia startPlay, hardening fallback ([a52e62e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/a52e62e9feb1e86f332e52b65bae3f5606a95424))


### Refactor

* **`auth`:** eliminado el token de actualización del DTO de respuesta de autenticación ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* **`authValidator`:** simplificado el esquema del token de actualización a un objeto vacío ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* `ContextDetailPage` muestra las vistas previas de assets ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* `GameSession` gestiona la retroalimentación y el estado de ánimo de la mascota ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* actualización de `dependabot` para actualizaciones mensuales ([6b4f7c7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6b4f7c7ebe946a3cfbb6063ed45a6b62608b7f5c))
* actualizado el uso de dependencias de imagenes y audio por nuevas versiones ([48d3d20](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/48d3d20e20e6f2cb32bd7f7cec66b5092b04b7ad))
* actualizado favicon a uno más representativo ([e3083bf](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e3083bf891e111714092b9b9e8916bca71b46226))
* actualizados estilos y componentes de varias páginas ([20e1099](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/20e1099750e4e6866e102786f58c0ad80f6577a5))
* ampliadas las tareas y mejorada su definición para el Sprint 3 ([99f35d7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/99f35d7445bcd73455dec7fbdd1b1bef63974c9a))
* añadidas carpetas al `exclusions` de `SonarQube` ([d07c00f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d07c00fd2cdaf114ca53047065b8232a7c260098))
* **auth-forms:** mejoradas animaciones y validaciones en login y registro ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* conflictos cross-deck atómicos, RFID en Redis y docs actualizadas ([14b3516](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/14b3516c253887840276f6fb9b88c80c28560d6d))
* consolidar umbrales RAG, completar filtros dashboard y mejoras UX de analytics ([f4dd720](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f4dd7209eb299de6df69524d09a5510726f1762c))
* eliminadas referencias a `cardId` y estandarizado el uso de `uid` ([545f0b2](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/545f0b24b32feedef6cbfd82d0ee942bad03e759))
* eliminar referencias a `cardId` en tests ([0fb3be1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0fb3be1c79ee2d37384bcc21ae8cfcd9b5903b93))
* flujo de memoria con board_ready, mejoras UX globales y protección de rutas por rol ([1e3bb7e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1e3bb7e03cec43bb98e53cb8854890b536e41d58))
* **frontend:** reorganizados imports de componentes UI y unificados estilos en varias paginas ([c24b06e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c24b06e438cc9d78eb2118f3c7f71817e3264c3a))
* **game:** métricas de partida veraces, ScoreDisplay bidireccional y eliminar FeedbackOverlay ([ab5c66c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab5c66c29c7c77bf0cf9aa9e22310312c9fd087a))
* mantenimiento UX frontend, patrones backend y fix memory leak en tests ([92c78f9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/92c78f9225adf78f93f873da4bee5e0536b6be2a))
* mejora de accesibilidad y optimización de la UI en varias páginas ([b5c966f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b5c966f680d82552c3d171a6b6563917febc62e9))
* mejora en el uso del patrón Repository ([437e337](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/437e3377283a40121067ad3293a9eccf33623cbe))
* mejorada la lista de tareas para el sprint 3 ([843e20c](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/843e20ce48c0c765e2901946ba13a4cce234ce90))
* mejorar animaciones, micro-interacciones y feedback visual en frontend ([c324749](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/c324749648e46f4d54b1d6f216cc563d22242df5))
* migrar todos los controllers a filterBuilder declarativo ([07083dc](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/07083dcb5b809e425acd5af30c9a547001a62e7f))
* migrar todos los controllers a responseHelper (M-001) ([808fff5](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/808fff5e7b9bbfcce8fb8ee03457553b07d7e757))
* modularizar GameEngine, mejorar estabilidad y observabilidad del backend ([43289e1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/43289e1d106433daf228f46aebc6fc8fb95d231d))
* **student-management:** optimizados modales y accesibilidad ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* tareas de mantenimiento Sprint 5 ([dfd6ae7](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/dfd6ae7f6d26f01ea19cdbd4ffbcac29f9eec7d9))
* **ui-text:** mejorada redacción general en componentes ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* **UI:** se mejoraron las páginas con nuevos iconos y elementos de UI optimizados ([1447c2a](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1447c2aceec6230634fc773ab7ec9b00e887ddb8))
* unificado flujo de errores centralizado ([20e1099](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/20e1099750e4e6866e102786f58c0ad80f6577a5))


### Documentation

* **`requirements`:** actualizados los criterios de registro del evento de inicio de ronda ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* **`security`:** mejorada la documentación de mantenimiento de seguridad con nuevas medidas ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* **`sprint4`:** marcadas tareas como completadas y actualizar el progreso ([0ac24e9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0ac24e91530c37d722027ed69a32e63eeeb9f7fb))
* actualizada documentación de la gestión de assets ([0adadf4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0adadf4395a9a8cadc58e81cf710e673c3ed6764))
* actualizadas tareas del Sprint 5 ([1515b10](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1515b10edd08a5ece681bbbf4b5227faee188aa4))
* actualizadas tareas sprint 3 ([d07c00f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d07c00fd2cdaf114ca53047065b8232a7c260098))
* actualizadas tareas Sprint 5 ([367e081](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/367e0814967c0e9c199aedab8e24d2e237325ba8))
* actualizar documentación de UI/UX y gameplay, y limpiar planes de diseño ([452fdf8](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/452fdf89aa195315b8aeccfa41b9de59baf4f5d9))
* actualizar READMEs y OpenAPI tras la migracion a VPS ([6f7e2d1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6f7e2d158a405aba06c470b4c6657059255b14db))
* actualzadas tareas de refactorizar modelo Card ([0fb3be1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0fb3be1c79ee2d37384bcc21ae8cfcd9b5903b93))
* documentar propósito de try-catch en controllers y corregir versión API ([48a5ae0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/48a5ae0fa39b83ce40766704bea56fb21754366b))
* limpieza de documentos temporales ([626d6f9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/626d6f9eed42401c07226d5eac016c6fadef2dbd))
* nueva ADR para reflejar la eliminación de `cardId` y lo correspondiente ([545f0b2](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/545f0b24b32feedef6cbfd82d0ee942bad03e759))
* nuevas medidas de seguridad y funciones de observabilidad ([fd2d821](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/fd2d82154b311168eac1cd57ebe0bd1e7416708e))
* recuperada documentación de Redis y assets de Supabase ([f506caa](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f506caadb9738509108a86bf789cec8cd0adfadc))
* registrar decision de arquitectura del HMAC RFID activado ([2016a4e](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2016a4e253378cd8a05dadd7e1089298ebda5242))
* **rfid:** documentar HMAC activado, observabilidad y errores de sensor ([f4f8c02](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f4f8c02e9102b529145435e076d2aee4edfe095a))
* **sprint3:** definir plan detallado de tareas y requerimientos ([a6bd7d1](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/a6bd7d1836a044a568c471521b4153d461282f30))


### Mantenimiento

* actualización de versión a 0.3.0 ([7d4ac09](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7d4ac0947afbef79312716f0b7e9e7e3db4204b8))
* actualizadas dependencias del frontend y backend ([d07c00f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/d07c00fd2cdaf114ca53047065b8232a7c260098))
* actualizadas dependencias en `package.json` ([7ec8063](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7ec806305b7e13ce16d92fd7953d679317b9fed8))
* actualizadas dependencias y mejorado proceso de CI ([6d76705](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6d767059ac5b17f3b4091c385551fb898f27df52))
* actualizadas dependencias y resuelta vulnerabilidad de vite 8.0.0-8.0.4 ([8832f20](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8832f20b1ae4908b5ab6fcaee6a68c5f8fda4893))
* actualizado `.gitignore` ([3134b17](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3134b178780921db17332fa49d18d5788dffdc98))
* añadir límites de memoria y filesystem read-only al compose base ([3c2a421](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3c2a4214d028728ec54623ac0a80ddf720f33326))
* **api:** eliminado servicio mock y mejorado manejo de errores ([ab6f77f](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/ab6f77f892be9f3f58842e8351a63a62b7a24522))
* auditoría QA y polish pre-release v0.5.0 ([2dbcd88](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/2dbcd881cf38b5f8f30c4563604dbe7c3853f878))
* **ci:** step Security report (completo) no bloquea el job ([33f1a78](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/33f1a78a71f62ae129d9f28eab74fc98352b6ce0))
* corregir scripts de lint en Windows. ([964b335](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/964b335160600d62f2a5aaefa0389c01a137bed6))
* **deps:** actualizar deps frontend y desactivar regla de React Compiler ([#314](https://github.com/Samuel-Prog-CSec/TFG-IoT/issues/314)) ([0d8cecd](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/0d8cecdff7ed4dcc809c6c38427afd0c64ebcbc5))
* eliminar dependencias fantasma de backend y frontend ([7298d8d](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7298d8d6bc541c547d317aa9451604cd1d9d7740))
* eliminar errores y warnings de ESLint en backend y frontend ([3b79d94](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/3b79d94ac22bee228a09e9305550f1a75123b0cc))
* fusionar preparativos de version 1.0.0 desde Maintenance ([b72afea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/b72afeaf5d8288f7d0bc05780356c4ecef07455b))
* **lint:** cero warnings en backend y frontend ([1cd19e0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/1cd19e09857b39e8e02d9dfb55415b9a105dad35))
* **maintenance:** cierre Sprint 5 — paquete fixes 15 propuestas pre-release v0.5.0 ([cd40a29](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/cd40a29b2cc4d939e028152b6cb1dec056ac5d75))
* merge develop into main para release 0.3.0 ([e6990a4](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/e6990a47e84b7873f4006ccd18534a5b5707c30b))
* merge develop into main para release 0.4.0 ([7dc7533](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/7dc75338de4c573a5c1066628ceb0a1213b3bcb1))
* polish UI/UX y fixes de QA intensiva pre-release v0.5.0 ([8e513b3](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8e513b329a76c3bbb86b681fc11a8d2e306e6fd8))
* preparar version 1.0.0 para la release ([f8274b9](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/f8274b9a244ba6abe79583e98861774f35733520))
* **quality:** resolver hallazgos SonarCloud (hotfix v0.5.1) ([4836161](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/48361619e50a4b0b9983be46d0a75bb32da79d67))
* reducir a cero warnings de lint y ajustar exclusiones SonarCloud ([8377dcc](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/8377dcc46168756c570e0039520d6d4ecc50f46d))
* **release:** cierre v0.5.0 — paquete final QA, audit dependencias y plan Sprint 6 ([23acbde](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/23acbde84d2c88241e87dfbb64897439bfeaf45d))
* **release:** version 0.1.0 ([236da11](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/236da11fce5b327dfc2fc870016b5521596e8619))
* **security:** limpiar audit y workflows tras CI rojo del Sprint 6 ([6f25fc0](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/6f25fc0fb503539a87e19d9237659cd251f76581))
* sincronizar version labels Docker con package.json ([779747b](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/779747bd31da1cff1a7c99d35b135b5f5375928a))
* **UI:** mejoraró la UI con un uso consistente de los iconos y ajustes de padding ([65eceea](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/65eceea3e2e2aa493e723852e962c2566f39e70b))
* versión actualizada a 0.5.0 ([20e1099](https://github.com/Samuel-Prog-CSec/TFG-IoT/commit/20e1099750e4e6866e102786f58c0ad80f6577a5))

## [Unreleased] - Sprint 6

### Motion signature ampliada (T-954) + Notificaciones tiempo real (T-955)

Cierre del paquete UI/UX iniciado en T-951…T-953. Dos pilares para v1.0.0:

#### Añadido

- **Atmósferas dinámicas por contexto:** el aurora del fondo, el gradient primary de `ButtonPremium` y el glow de las cards se tintan al contexto pedagógico activo (Geografía, Animales, Colores, Números, Formas). Funciona via CSS vars + atributo `[data-atmosphere]` en `<html>`. Crossfade 400ms entre rutas. Light mode usa variantes soft mezcladas con marfil para no romper el blend `multiply`.
- **Hero transitions** en las 3 parejas `DeckCard ↔ CardDeckDetailPage`, `SessionCard ↔ SessionDetail`, `ContextCard ↔ ContextDetailPage` con `useSharedLayoutTransition` (respeta reduced-motion).
- **Scroll parallax aurora** en AppLayout: los 3 orbes se desplazan a velocidades distintas (`useScroll + useTransform`) cuando el usuario hace scroll. Reduced-motion lo desactiva.
- **Sistema de notificaciones tiempo real persistidas** con 5 tipos canónicos (`play_completed`, `registration_pending`, `student_at_risk`, `context_shared`, `system_announcement`). Backend completo: modelo Mongoose con TTL 90d, dedup window 60s en Redis, service + controller + routes (`/api/notifications`), DTO V1, emisión Socket.IO al room `user_<id>`. Triggers reales desde `gamePlayService.completePlay`, `authController.register` y `gameContextController.createContext`.
- **NotificationBell + Panel** en la sidebar con badge contador, pulse subtle on unread, micro-celebración (scale+rotate) al recibir `play_completed` con 3⭐, panel popover con focus trap, infinite scroll cursor, empty state signature (sobre de papel cerrado SVG inline). Atajo `Shift+B`.
- **InlineSuccessBadge** + hook `useInlineSuccess` para confirmaciones de éxito (✓ Guardado) adyacentes al botón Save. Integrado en `CreateSession`, `SessionEdit`, `DeckCreationWizard`, `DeckEditPage`, `AdminContexts`, `ContextsPage`. Sonner toast queda reservado para errores y destructivos.
- **Atmósfera + mecánica en GameSession:** el fondo de la partida combina `mechanicTheme.backdropTintClass` con la atmósfera del contexto, generando un fondo único por cada combinación.

#### Cambiado

- `ButtonPremium` variant primary lee `--color-atmosphere-primary` / `--color-atmosphere-primary-alt` / `--color-atmosphere-glow` con fallback al brand cuando no hay atmósfera activa.
- AppLayout aurora consume `--color-atmosphere-aurora-{1,2,3}` en lugar de `--color-aurora-*` directos.
- `socket.join('user_'+userId)` confirmado en el authMiddleware de Socket.IO para que las notificaciones lleguen al cliente correcto.

#### ADRs

- ADR-130 — Atmósferas dinámicas por contexto + scroll parallax aurora.
- ADR-131 — Sistema de notificaciones tiempo real persistidas.
- ADR-132 — InlineSuccessBadge como complemento de Sonner toast.
- ADR-133 — Divergencia formal Light / Dark (aurora, atmósferas, sombras).
- ADR-134 — Hero transitions reusables (`useSharedLayoutTransition`).

### Mecánica Secuencia (T-921 + T-922 + T-923)

Tercera y última mecánica del proyecto. El alumno memoriza una secuencia ordenada de N cartas (3 a 7 según configuración) durante unos segundos definidos por el profesor; tras un flip de "vuelta a boca abajo" debe reproducirla escaneando las tarjetas en el mismo orden. Tres dificultades (fácil con pistas progresivas, medio con segundo intento, difícil one-shot) y un sistema de bloqueo de carta que **avanza el cursor sin reiniciar la secuencia** — decisión pedagógica para evitar frustración acumulativa.

#### Añadido

- **Backend Secuencia:** nuevo `SequenceStrategy` con fases memorizing → reproducing, evento `sequence_phase_*` y `sequence_card_result` / `sequence_round_result` en Socket.IO. Ocho métricas específicas (sequencesCompleted, maxSequenceLengthAchieved, partialReproductions, hintsUsed, etc.) persistidas en `GamePlay.metrics` y agregadas en `analyticsService.getStudentSummary`.
- **Sistema de pistas progresivas (easy):** primera pista parcial con caracteres ocultos (`L?ó?`), segunda pista completa (`León`), tercer fallo bloquea la carta. El algoritmo prioriza preservar primera letra y vocales acentuadas si las hay; si no, caracteres en índices pares.
- **Animaciones signature crupier:** reparto inicial con stagger 90 ms y spring físico (entrada desde fuera de pantalla con rotación), recogida final con stagger inverso. Respeta `prefers-reduced-motion`.
- **Frontend Secuencia:** nueva familia de componentes en `components/game/sequence/` (SequenceBoard, SequenceCard, PhaseTransitionOverlay, SequenceProgressDots, FallbackTouchPanelSequence) + `SequenceGameplayPanel` orquestador. Tres SFX nuevos en `soundEffectsService` (cardDeal, cardSweep, sequenceComplete) usando Web Audio API.
- **Wizard `StepSequenceRules`:** sliders min/max longitud, displaySeconds, dificultad con descripción contextual, regenerador de plan en tiempo real.
- **GameOver per-mechanic:** refactor con compositor `GameOverStats` que delega a `GameOverStatsAssociation`/`Memory`/`Sequence`. Cada mecánica define sus métricas e iconos sin contaminar las demás. El bloque Secuencia destaca la mejor longitud alcanzada como hero metric.
- **Analytics Secuencia:** `SequenceProgressChart` (Recharts, tint ámbar) + `SequenceHighlightCard` integrados en `StudentProfile` cuando el alumno tiene partidas Secuencia. Empty state con copy útil si todavía no hay datos.
- **Single source of truth para mecánicas:** `frontend/src/constants/mechanicLabels.js` centraliza label, icono Lucide, tint y descripción. `StepMechanic` lo consume.
- **Seeders demo:** 5 templates de Secuencia (3 dificultades × varios contextos) en `06-sessions.js` + métricas Secuencia derivadas del perfil del alumno en `07-gameplays.js`.

#### Cambiado

- `frontend/src/pages/GameSession.jsx` refactorizado: el boolean `sessionIsMemory` se reemplaza por un derived `mechanicMode = 'association' | 'memory' | 'sequence'` (los aliases booleanos se mantienen como variables locales derivadas para no romper los call-sites existentes).
- `final_summary` del backend ahora incluye `mode` explícito; el frontend lo usa como source of truth en lugar de inferirlo localmente.
- `User.studentMetrics` extendido con `maxSequenceLengthAchieved` (récord histórico monótono).
- Mecánica `sequence` habilitada en seeder `03-mechanics.js` con `availability: 'available'`.

#### ADRs

- ADR-102 — Mecánica Secuencia: estado intra-ronda, validación ordenada y dificultades.
- ADR-103 — Refactor `sessionIsMemory` → `mechanicMode` y compositor `GameOverStats`.
- ADR-104 — Animaciones signature crupier (reparto + recogida) para Secuencia.

## [0.5.0] - 2026-04-24

Cierre del Sprint 5 y última versión previa a la 1.0.0. Cinco ejes principales: backend robustecido (errores unificados, capa de datos completa, limitación de tráfico distribuida), suite completa de analytics (backend y frontend), protección de datos de menores conforme a RGPD y LOPDGDD, refactor de tarjetas RFID a tokens reutilizables y un nuevo lenguaje de movimiento "táctil + papel" aplicado a toda la app. Veintiocho tareas cerradas de treinta y una, con algunas menores diferidas al siguiente sprint. Incluye además un paquete de mantenimiento final que pule gameplay, dashboards y panel de administración antes del corte v1.0.0.

### Añadido

#### Analytics y dashboards

- **Backend de analytics expandido:** decenas de nuevos endpoints para métricas de estudiantes, distribución, tendencias, mapas de calor y rankings, con un marco de indicadores y umbrales semánticos (riesgo, promedio, bueno, excelente) y comparativa entre periodos con deltas.
- **Suite completa de analytics frontend:** cuatro páginas y once componentes nuevos (Dashboard ampliado, Perfil Individual de Estudiante, Vista Comparativa, Insights & Reports) con el mismo marco semántico aplicado a tarjetas, gráficos y alertas.
- **Vista comparativa de estudiantes:** tabla ordenable con filtros, exportación a CSV y navegación cruzada al perfil individual.
- **Perfil individual de estudiante:** métricas detalladas con superposición de la media de la clase, trayectoria de aprendizaje y desglose por mecánica y contexto.
- **Dashboard con indicadores expandidos:** ocho indicadores reales del profesor autenticado, filtros interactivos, alertas accionables y mapa de calor por día y hora con leyenda y tooltips mejorados.
- **Componentes de UI reutilizables:** breadcrumbs, cabeceras de página y estados de error consistentes en todas las páginas nuevas.
- **Skeletons especializados** para gráficos y rejillas de tarjetas mientras cargan datos.

#### Tarjetas RFID como tokens reutilizables

- Las tarjetas dejan de ser entidades preregistradas por el administrador. Ahora el profesor las asigna directamente al crear o editar un mazo, mediante escaneo en vivo. La gestión administrativa de tarjetas desaparece y las páginas correspondientes se eliminan. El gameplay no cambia: el emparejamiento por identificador de tarjeta sigue funcionando idéntico.

#### Backend — fundamentos y observabilidad

- **Flujo de errores centralizado:** validación, rutas no encontradas y errores asíncronos pasan por un único punto y se registran de forma estructurada.
- **Acceso a datos consolidado:** nuevas operaciones de escritura, soporte para transacciones y mejor separación entre la base de datos y la lógica de negocio.
- **Respuestas y filtros uniformes:** la API comparte formato de respuesta y construcción declarativa de filtros en todos los endpoints.
- **Limitación de tráfico distribuida:** los topes por tipo de operación (autenticación, registro, creación, eventos, analytics, subidas, exportación) se aplican coherentemente entre instancias del backend gracias a Redis. Nuevos límites en pausa y reanudación de partidas.
- **Cache de analytics:** las consultas pesadas a dashboards se sirven desde caché con tiempos de vida ajustados por endpoint y se invalidan al terminar cada partida.
- **Cache de identidad de usuario:** cada petición autenticada deja de leer la base de datos repetidamente; los datos de sesión se cachean por unos segundos. Métricas de aciertos y fallos expuestas en el endpoint de métricas operativas.
- **Inicio de partida idempotente:** en despliegues con varias instancias, iniciar una misma partida no genera eventos duplicados.
- **Monitorización del rate limiter:** si Redis falla y se cae al modo en memoria, el incidente se registra en el sistema de errores y se contabiliza para alertar al equipo.
- **Worker dedicado para tareas en background:** la limpieza programada de datos de retención corre en un contenedor separado.
- **Límite de eventos en tiempo real distribuido:** los topes por segundo en el canal de juego se aplican coherentemente entre instancias.
- **Modo RFID coordinado entre instancias:** el cambio de modo (juego, asignación, idle) se propaga al instante a todos los servidores conectados.
- **Cache distribuida para mecánicas y contextos** y bloqueo atómico de tarjetas para evitar conflictos cuando varias partidas usan los mismos mazos.

#### UI/UX y motion

- **Lenguaje de movimiento "táctil + papel":** la interfaz comparte una identidad visual con efectos de escaneo, ilustraciones de papel que entran y salen con suavidad, modal destructivo con flip 3D, micro-flash al reanudar partida y logo con respiración suave en login y registro.
- **Estados vacíos ilustrados, modales más expresivos y refuerzo de accesibilidad:** anuncios para lectores de pantalla, foco automático al primer error de formulario, mapa de calor navegable por teclado, iconos diferenciados para daltonismo, sidebar con etiqueta de rol y banner para super-admin.
- **Confetti** en pantalla de fin de partida y celebración de récords con delta sobre la mejor puntuación previa.
- **Tema visual por contexto educativo:** cada mazo y elemento adopta los colores del contexto pedagógico al que pertenece, con efecto de baraja física en las tarjetas y ondas radar en el widget de RFID.
- **Sistema de assets multimedia mejorado:** audio vinculado a tarjetas, placeholders de baja calidad para imágenes y auditoría de UX completa.
- **Página de privacidad para profesores** y banner de consentimiento parental visible en el alta de estudiantes.
- **Pódium Top 5 con medallas:** el ranking de mejores alumnos se rediseña con un pódium 1-2-3 visual y degradados oro, plata y bronce, alturas escalonadas y posiciones cuatro y cinco listadas debajo.
- **Mazos con vista previa real:** las tarjetas de mazo en "Mis Mazos" muestran un mosaico con las primeras seis miniaturas reales en lugar de un placeholder genérico. Si faltan imágenes se muestra un fallback con las iniciales del nombre del mazo.
- **Indicador de scroll en Actividad Reciente:** aparece un chevron derecho cuando hay más actividad fuera de pantalla, con desplazamiento por tarjeta y desaparición automática al llegar al final.
- **Confirmación al cerrar sesión:** el botón de salida del sidebar pide confirmación antes de hacer logout, evitando salidas accidentales con trabajo a medias.
- **Mini-gráfica y última partida en cada sesión:** cada tarjeta de sesión incluye una gráfica resumida con la evolución de puntuaciones recientes y la fecha de la última partida, dando contexto rápido sin abrir el detalle.
- **Hover unificado en tarjetas:** el comportamiento al pasar el ratón y al pulsar es consistente en mazos, contextos, alumnos y sesiones, con elevación y sombra suaves que respetan la preferencia de movimiento reducido.
- **Saludo personalizado con nombre destacado:** el header del Dashboard muestra el nombre del profesor con un degradado, y se aplica una capitalización española correcta que respeta artículos y preposiciones.

#### Tests, infraestructura y CI

- **Cobertura de tests:** más de mil trescientos tests entre backend y frontend pasan en verde en CI. Suites nuevas dedicadas a caché, idempotencia, cierre robusto de modales y muchas pruebas unitarias añadidas en una sola pasada.
- **CI más estricto:** el linter detecta vulnerabilidades de seguridad, expresiones regulares peligrosas, secretos y promesas mal formadas. Cero warnings en backend y frontend tras una pasada masiva. Resuelto un cuelgue infinito de tests frontend en CI.
- **Despliegue endurecido:** contenedores con límites de memoria y filesystem solo lectura, autenticación obligatoria en Redis, tareas en background en contenedor separado y etiquetas de versión sincronizadas.

#### Mantenimiento final pre-release

- **Buscador en selectores grandes:** cuando un desplegable supera las veinte opciones aparece automáticamente un buscador con filtrado en vivo, atajo Esc para limpiar y anuncio para lectores de pantalla. Aplica a selectores de alumno en jugar, asignar estudiante, generador de informes y filtros de mazo.
- **Aviso de espera con cuenta atrás:** cuando el sistema pide esperar entre intentos aparece un banner con barra de progreso que se vacía sola hasta liberar la acción, en lugar del aviso efímero anterior. Soporta lectores de pantalla y movimiento reducido.
- **Confirmación visual de tap en panel táctil:** tras pulsar una carta, un overlay sutil de unos milisegundos confirma que el sistema ha registrado la acción, evitando dobles taps por ansiedad.
- **Métrica de rescates por ventana de gracia** en el panel de métricas para administradores: cuántos escaneos se han rescatado gracias a la nueva ventana de gracia entre rondas.

### Cambiado

- **Datos del usuario autenticado más simples y cacheables:** los flujos que antes guardaban directamente sobre el documento de base de datos se han migrado a la nueva capa de acceso a datos, con invalidación automática del cache de identidad ante cualquier cambio de credenciales o perfil.
- **Motor de juego modularizado:** el componente que orquesta las partidas se ha dividido en módulos especializados, mejorando la estabilidad y la observabilidad sin alterar el gameplay.
- **Dashboards con datos reales:** se eliminan los datos simulados; todos los indicadores reflejan al profesor autenticado.
- **Lecturas optimizadas:** consultas de listado más rápidas, índices compuestos añadidos y eliminación de efectos secundarios al servir datos.
- **Sistema de color unificado:** alrededor de doscientos colores escritos a mano se han migrado a tokens semánticos en wizard de sesiones, gameplay, login, registro y resto de páginas, permitiendo cambios de marca o tema sin tocar componentes uno a uno.
- **Pipeline RFID endurecido:** vigilante de actividad, latido de salud, ventana temporal configurable y validación estricta del origen de cada lectura.
- **Mecánica de Memoria sin estados intermedios:** el tablero solo se muestra cuando el servidor confirma que está listo, evitando flashes y posiciones extrañas al iniciar.
- **Onboarding contextual** parcialmente implementado, con el tramo final diferido al siguiente sprint.
- **Ventana de gracia entre rondas en Asociación:** en partidas con tiempos cortos (≤15 s), los escaneos justo en el límite del temporizador ya no se descartan; el servidor da unos milisegundos extra invisibles antes de cerrar la ronda. El reloj visible para el alumno sigue marcando "0 s" cuando expira.
- **Antirrebote diferenciado por fuente de escaneo:** el cooldown anti-duplicado deja de ser uniforme. El sensor físico mantiene un cooldown amplio (anti-rebote del hardware), mientras que el panel táctil de Asociación y los taps en cartas de Memoria tienen un cooldown corto. Memoria táctil deja de mostrar el aviso "Espera un momento" al encadenar toques rápidos legítimos.
- **Alertas con marca de tiempo real:** cada alerta refleja el momento exacto del incidente que la disparó (última partida del estudiante, último escaneo) en lugar de la hora actual al servir la respuesta. Se acabaron las alertas todas con la misma hora.
- **Indicadores con delta neutro cuando no hay periodo previo:** "Alumnos en Riesgo" y "Partidas Hoy" muestran un guion en lugar de una línea vacía cuando no existe periodo anterior con el que comparar, comunicando con claridad la falta de baseline.
- **Constantes del dominio centralizadas:** los valores admitidos por la API y la base de datos viven ahora en un único lugar, con un test que detecta automáticamente desincronizaciones entre capas.
- **Transiciones de página continuas:** el cambio de ruta deja de mostrar un frame con dos páginas solapadas o un hueco vacío entre ellas.
- **Deltas coloreados según semántica:** las tarjetas de indicadores del Dashboard ya no pintan siempre en verde los incrementos. Métricas como "Errores" o "Abandonos" se colorean en rojo cuando suben y en verde cuando bajan.
- **Leyenda de Curvas de Aprendizaje reubicada arriba:** ya no se solapa con el eje horizontal ni con los tooltips, dejando más espacio vertical y mejorando la lectura.
- **Indicador "Alumnos en Riesgo" coherente con la tabla:** el contador del Dashboard y la tabla detallada usan ahora la misma fuente de datos, eliminando porcentajes a 0% pese a haber alumnos en riesgo.
- **Pantalla de fin de partida correcta en modo táctil:** en partidas de Asociación sin sensor RFID, el resumen final dejaba de contar aciertos por una condición de carrera y por un guardia de coherencia demasiado estricto. Ambos problemas corregidos: el alumno ve el conteo real de su partida.
- **Porcentajes con un decimal:** los porcentajes de aciertos en perfiles y comparativas pasan de cuatro decimales a uno solo, eliminando ruido visual del estilo 42,7222 %.
- **Selección de contexto más robusta:** la creación y edición de mazos aceptan las distintas formas en que la API entrega los identificadores, evitando errores en flujos sucesivos.
- **Redirección de la ruta antigua de alumnos:** los enlaces guardados al listado de alumnos siguen funcionando y llevan al usuario a la nueva vista comparativa.

### Arreglado

- **Críticos pre-release:**
  - Las partidas con puntuación negativa (penalizaciones grandes) ya pueden guardarse correctamente; antes la base de datos las rechazaba.
  - El asistente de creación de mazos volvía a fallar mostrando una pantalla de error tras retomar un borrador; resuelto.
  - El listado de contextos ya no se rompe cuando un filtro deja la lista a cero resultados.
  - Los indicadores de Informes mostraban siempre cero por una incompatibilidad interna de datos; ahora reflejan los valores reales.
  - El eje vertical de Curvas de Aprendizaje se desbordaba en algunos casos; ahora se acota correctamente.
- **Limitación de tráfico realmente distribuida:** los topes se aplicaban en memoria local de cada instancia por un orden incorrecto al arrancar. Tras la corrección, los contadores viven en Redis desde la primera petición.
- **Resiliencia ante caídas momentáneas de Redis:** el backend ya no entra en ciclo de reinicio cuando Redis tiene un parón breve.
- **Métricas operativas completas:** el endpoint de métricas expone ahora los contadores de Redis (caché de identidad y fallbacks de rate limiter).
- **Direcciones IPv6 normalizadas** en los limiters de tráfico, agrupándolas correctamente para evitar evasiones triviales.
- **Liberación explícita del bloqueo de inicio al terminar una partida:** si el cliente reintenta, ya no encuentra un bloqueo aún caliente.
- **Limiters fail-open ante fallos transitorios** de Redis: la app sigue funcionando en lugar de devolver error 500.
- **Permisos de administración corregidos** en la edición de mecánicas y rutas de assets de la mecánica de Números.
- **Filtración de memoria en tests resuelta** y tests frontend ya no se cuelgan indefinidamente en CI.
- **Tildes correctas en sesiones de Memoria:** nombres como "Triángulo", "Murciélago" o "Plátano" se normalizan bien y el emparejamiento de pares ya no falla por mismatch de acentos. Validación reforzada tras tres pasadas masivas en QA.
- **Pulido visual general:** el contador "Total" en Mis Mazos ya muestra el número correcto cuando hay mazos activos, las previews de contextos son legibles, el slider de penalización refleja el sentido correcto, los emojis del gameplay se sustituyen por iconos consistentes, las alertas no duplican nombres y se han depurado textos y pistas.
- **Crítico — el juego era inutilizable sin sensor RFID:** el servidor rechazaba los toques en el panel táctil cuando no había un lector físico conectado, dejando la app injugable en modo escritorio. Resuelto.
- **Crítico — las tarjetas no se liberaban entre partidas:** un error en el cálculo interno de claves dejaba las reservas de tarjetas atrapadas tras cada partida, impidiendo reutilizarlas. Resuelto.
- **Caché de alertas:** cambiar el tope de elementos (de "Top 5" a "Top 10") devolvía la lista anterior; ahora se actualiza correctamente.
- **Confirmación al eliminar imágenes y audios:** el botón borraba sin preguntar; ahora pide confirmación como el resto de eliminaciones.
- **Aviso de "Borrador encontrado"** al crear un mazo: ya no vuelve a aparecer tras descartarlo en el mismo asistente.
- **Detalle de sesión** ya no carga datos por duplicado al abrirlo.
- **Aviso 401 fugaz al iniciar sesión:** se diferencian los rechazos esperados (sesión sin refrescar) de los errores reales para no asustar al usuario al arrancar la app.
- **Transición de páginas en la zona admin** sin solapamiento: la cabecera no se duplica al cambiar de pestaña.
- **El recuento y URLs de los assets de un contexto** se actualizan al instante tras subir o eliminar imágenes y audios; ya no se ven datos obsoletos.
- **Saludo del Dashboard** con la capitalización española correcta del nombre.
- **Eventos legítimos del motor de juego ya no quedan inalcanzables vía API** por una desalineación entre validador y modelo de datos.
- **Banner de espera en Memoria con auto-cierre:** ya no se queda visible aunque la ronda haya avanzado; se cierra solo cuando el cooldown termina.
- **Política de evicción de Redis ajustada para no expulsar claves bajo presión de memoria:** preserva tareas programadas (limpieza diaria), tokens revocados y bloqueos de inicio de partida que dependen de existir hasta su tiempo de vida.
- **Modales de confirmación se cierran solos al terminar la acción confirmada:** antes podían quedarse visibles bloqueando la UI tras eliminar un asset, contexto, mazo o sesión, también si la operación lanzaba un error.
- **Consigna de Asociación con género neutro:** ya no aparecen frases incorrectas como "la Cerdo" o "la Caballo" en el fallback automático. La consigna personalizada del profesor sigue teniendo prioridad cuando se define en el wizard.
- **El switch de Animaciones del sidebar** ya no puede disparar accidentalmente envíos de formulario.
- **Cara trasera de las cartas en Memoria realmente oculta a lectores de pantalla:** antes algunos lectores anunciaban el nombre de la carta antes de revelarla.
- **Fondo continuo bajo la barra lateral en páginas largas:** ya no aparece una franja de otro color al hacer scroll por debajo del primer viewport.
- **Indicadores del perfil de alumno con alturas iguales:** las tarjetas con línea comparativa ya no rompen la rejilla.
- **Trayectoria de Aprendizaje y Resumen del Alumno con alturas iguales** en su fila.
- **Sin huecos verticales en el Dashboard** entre Actividad Reciente y la columna lateral.

### Seguridad

- **Protección de datos de menores (cumplimiento RGPD y LOPDGDD):**
  - Auditoría completa de datos personales, registro de actividades de tratamiento y evaluación de impacto documentada.
  - Minimización de datos: la fecha de nacimiento ya no se almacena para los estudiantes.
  - Consentimiento parental obligatorio al crear un estudiante, gestionado y reflejado en la UI.
  - Seudonimización en analytics y separación de datos identificativos; los logs no contienen datos personales de menores.
  - Borrado efectivo y política de retención con plazos concretos.
  - Endpoints para portabilidad, rectificación con audit trail y derecho de oposición a analytics comportamentales.
  - Audit trail de acceso a datos y página de privacidad para profesores.
  - Evaluación de riesgo de re-identificación en aulas pequeñas.
  - Protocolo documentado de notificación de brechas.
  - Sentry documentado como procesador internacional; cifrado en cliente planificado para producción.
  - Centralización de operaciones de privacidad en el rol de super-admin.
- **Endurecimiento de infraestructura:** autenticación por contraseña en Redis, filesystem solo lectura y límites de memoria en contenedores.
- **Vulnerabilidades resueltas** en varias dependencias de backend y frontend. Dependencias actualizadas vía Dependabot.

### Documentación

- Decisiones de arquitectura del sprint registradas en el documento interno de decisiones: caché de analytics, caché de identidad, idempotencia de inicio de partida, observabilidad del rate limiter, accesibilidad keyboard-first, lenguaje de movimiento "táctil + papel", tarjetas como tokens reutilizables, ventana de gracia, antirrebote por fuente, política de evicción Redis y layout, entre otras.
- Documento unificado de protección de datos de menores (auditoría, registro de tratamiento, brechas y k-anonimidad).
- Sprint 5 cerrado con tareas y propuestas trazadas; tareas diferidas marcadas para el siguiente sprint.
- Nuevas propuestas catalogadas tras los hallazgos de QA y planificadas para el siguiente sprint.
- Guías técnicas actualizadas en backend (arquitectura Redis, optimizaciones, rate limiting, flujos en tiempo real, performance, seguridad, logging, analytics) y frontend (gameplay en tiempo real, antirrebote en cliente, banner de espera). Documentación de despliegue actualizada con la nueva política de evicción y el worker de tareas.
- Memoria académica del TFG (LaTeX) en redacción paralela.

## [0.4.0] - 2026-03-22

### Añadido

- **Gameplay completo Asociación y Memoria (E2E):** Pantalla de partida real integrada con backend vía Socket.IO para ejecutar partidas completas de ambas mecánicas sin simulación local, con vistas diferenciadas por mecánica, métricas en vivo (HUD) y resumen final ampliado. (#135)
- **Wizard de sesión adaptativo:** El wizard de creación adapta fases y validaciones según la mecánica seleccionada; mecánicas no disponibles (ej. `sequence`) se muestran como "Próximamente" y quedan bloqueadas tanto en UI como en backend (`SESSION_ENABLED_MECHANICS`). (#140)
- **Clonación de sesiones:** Función "Volver a jugar" que clona sesiones existentes resincronizando `cardMappings` y `contextId` con el estado actual del mazo; reglas específicas por mecánica para `boardLayout` (Memory) y `associationChallengePlan` (Association). (#141)
- **Contrato RFID backend-authoritative:** Contrato unificado de control de modos RFID entre frontend y backend con política single-owner por usuario, validación estricta de sensor y eliminación de derivación por ruta en frontend. (#142)
- **Gestión de contextos educativos (Frontend):** Nuevas páginas de listado y detalle de contextos con soporte para subida de assets a Supabase Storage.
- **Bloqueo distribuido de tarjetas (Redis):** Scripts Lua atómicos (`reserveCards`, `releaseCards`, `renewLease`) con ejecución vía `EVALSHA` + fallback `EVAL`, lectura batch por pipeline (`existsMany`, `hgetallMany`) y métricas de ejecución. (#147)
- **Integración Sentry completa:** Monitorización de errores en frontend (ErrorBoundary, tracing de navegación, source maps vía `@sentry/vite-plugin`) y backend (scopes de identidad de usuario, captura de errores WebSocket). (#149)
- **Reconexión de juego:** Experiencia de juego mejorada con reconexión automática, recuperación de estado y manejo robusto de desconexiones y desincronización.
- **Feedback de partida:** Sistema de retroalimentación mejorado con mensajes contextuales para aciertos, fallos, combos y timeouts durante gameplay.
- **Accesibilidad `prefers-reduced-motion`:** Hook `useReducedMotion` transversal aplicado en wizard, gameplay, modales y componentes animados con degradación progresiva que mantiene usabilidad completa. (#151, #153)
- **Tests:** Nuevas suites para `GameSession` (frontend), clonación de sesiones, bloqueo Redis, mecánica Memory, persistencia atómica de eventos, disponibilidad de mecánicas y borrado de contextos con dependencias.
- **Benchmarks:** Scripts de benchmarking para operaciones Redis (`benchmark-redis-ops.js`) y lectura de sesiones (`benchmark-session-reads.js`).

### Cambiado

- **Refresh token cookie-only:** Migración completa a cookie `httpOnly` exclusiva; eliminados envío y recepción de refresh token en body y localStorage. CSRF double-submit obligatorio también en refresh. Backend rechaza payload legado con `refreshToken` en body (400). (#137)
- **Estado de GameSession centralizado:** Transiciones de estado (`created` → `active` → `completed`) centralizadas en `sessionStatusService` basadas en el estado real de partidas (`GamePlay`), integradas en flujos de inicio, pausa, reanudación, finalización y abandono. (#139)
- **Lecturas sin write-on-read:** Endpoints `GET` de sesiones ejecutan lectura `lean` sin side-effects de escritura; caché de ownership por socket para reducir consultas redundantes; contadores de juego optimizados por agregación. (#145)
- **Persistencia atómica de eventos:** `GamePlay` usa operadores `$push` + `$inc` + `$slice` para persistencia por ronda (`addEventAtomic`), reduciendo write amplification y desactivando por defecto la persistencia de `round_start`. (#146)
- **GameEngine robusto:** Serialización por `playId` para operaciones críticas, hooks por mecánica sin condicionales ad-hoc, caché TTL de auth en socket, procesamiento batch configurable en cleanup/recovery y métricas operativas ampliadas. (#136, #143)
- **UI/UX general:** Reorganización de imports y componentes, nuevos iconos, animaciones mejoradas en login/registro, unificación de estilos; clases Tailwind dinámicas reemplazadas por mapas estáticos de variantes. (#152)
- **Dependencias:** Actualizadas dependencias en backend y frontend; proceso de CI mejorado con Dependabot mensual.

### Seguridad

- **Payload guard global:** Middleware `securityPayloadGuard` para detección y bloqueo de payloads con `__proto__`, `constructor.prototype` y operadores NoSQL (`$`), aplicado en HTTP y WebSocket. (#144)
- **Validación Origin en WebSocket:** Validación explícita de `Origin` en handshake con whitelist de seguridad, como doble capa junto con CORS base. (#144)
- **RFID hardening:** Ventana temporal configurable (`RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS`), formato estricto de `sensorId` y validación de `source` en eventos RFID de cliente. (#144)
- **Integridad de dominio:** Restricción de modificación de `createdBy` en `PUT /api/users/:id`; transferencias solo por endpoint dedicado; guardas de borrado de contextos con dependencias activas. (#148)
- **Cookie httpOnly exclusiva:** Refresh token solo vía cookie segura; eliminada exposición en body de respuesta y fallback legado en logout. (#137)

### Corregido

- Incoherencias de validación entre Zod y Mongoose en campos de sesión (`penaltyPerError` rechazaba valor 0, `numberOfCards` con límites divergentes).
- Bugs visuales en múltiples páginas del frontend.
- Manejo de datos mejorado en `DeckEditPage` y `SessionsPage`.
- Pantalla de fin de partida (`GameOverScreen`) rediseñada con estadísticas de resumen detalladas.
- Soporte de `reduced-motion` añadido en animaciones que carecían de ello.

### Documentación

- Documentación técnica de seguridad de tokens JWT (`backend/docs/Seguridad_tokens_JWT.md`).
- Arquitectura Redis ampliada y corregida (`backend/docs/Arquitectura_Redis.md`).
- Análisis de optimización Redis con comparativa antes/después (`backend/docs/Redis_Optimization_Analysis.md`).
- Notas de rendimiento (`backend/docs/Performance_Notes.md`) y flujos RFID en runtime (`backend/docs/RFID_Runtime_Flows.md`).
- API actualizada a v0.4.0 (`backend/docs/API_v0.4.0.md`).
- Auditoría integral de gameplay Sprint 4 (`documentation/Sprint4_Gameplay_Mejoras_Mantenimiento.md`).

## [0.3.0] - 2026-02-13

### Añadido

- **RFID Web Serial (Frontend):** Migración del flujo de lectura RFID al cliente (navegador) con soporte para conexión/desconexión, estados y control por modo operativo.
- **Integración Frontend-Backend completa:** Conexión real de la UI con API REST y Socket.IO para auth, usuarios, sesiones, mazos y métricas.
- **Autenticación WebSocket obligatoria:** Handshake autenticado y control de acceso reforzado para eventos en tiempo real.
- **Rate limiting en Socket.IO:** Límites por tipo de evento para reducir riesgo de abuso/DoS en canales de juego.
- **Capa DTO de respuestas:** Estandarización de payloads para reducir exposición de datos y mejorar consistencia de API.
- **Multi-sensor RFID (base):** Soporte de identificación de sensor en eventos para escenarios con más de un lector.
- **Modos RFID de flujo:** Control explícito para procesar lecturas según contexto (juego, registro, asignación, idle).
- **Frontend de operación docente:**
  - Panel de aprobación de profesores.
  - Flujo de sesión única por usuario.
  - Gestión de mazos en UI.
  - Wizard de sesión mejorado.
  - Dashboard analytics ampliado.
- **Infraestructura Docker:** Dockerfiles y compose para entorno local/dev/prod con documentación asociada.

### Cambiado

- **Arquitectura RFID:** Se desprioriza la dependencia de lectura serie en backend para favorecer despliegue cloud con lectura Web Serial desde frontend.
- **Validación de API:** Hardening de esquemas y validadores con Zod en rutas críticas.
- **Flujos en tiempo real:** Endurecimiento del pipeline Socket para mejorar estabilidad y trazabilidad en sesiones activas.

### Seguridad

- **Hardening de WebSocket:** autenticación obligatoria + control de frecuencia por evento.
- **Security logging:** Mejoras de registro orientadas a auditoría y detección de eventos de riesgo.
- **Validación estricta de entrada:** Reforzada en endpoints y eventos críticos para reducir superficie OWASP (input tampering / payloads malformados).

### Corregido

- Ajustes de integración frontend/backend para eliminar inconsistencias de contrato en flujos de sesión y datos de UI.
- Mejoras de robustez en rutas y validaciones para reducir errores por datos incompletos o no normalizados.

### Documentación

- Actualización de documentación de arquitectura y uso extendido de WebSocket/Web Serial.
- Actualización de tareas y cierre de Sprint 3 con trazabilidad técnica.
- Consolidación de documentación operativa para despliegue con Docker.

## [0.2.0] - 2026-01-09

### Añadido

- **Super Admin:** Rol `super_admin` con capacidad de aprobar/rechazar nuevos profesores. Endpoint de aprobación de usuarios.
- **Sesiones:** Implementada sesión única por dispositivo (invalida sesiones anteriores automáticamente).
- **Redis:** Integración completa con Redis para:
  - Blacklist de tokens y rotación de refresh tokens (7 días).
  - Persistencia de estados de partida (GamePlay).
  - Rate limiting y caché distribuida.
- **Pausa/Reanudación:** Funcionalidad para pausar y reanudar partidas en tiempo real (congelando el timer).
- **Mazos de Cartas (CardDecks):** Sistema para que los profesores creen, guarden y reutilicen configuraciones de cartas.
- **Gestión de Assets:**
  - Nuevos servicios: `imageProcessingService` y `audioValidationService`.
  - Validación estricta por "magic bytes".
  - Conversión automática de imágenes a WebP y generación de thumbnails.
  - Soporte exclusivo para audio MP3/OGG.
- **Transferencias:** Endpoint para transferir alumnos entre profesores manteniendo sus métricas.
- **Infraestructura:**
  - Script `drop-db` para desarrollo.
  - Health checks (`/health`) y endpoint de métricas (`/api/metrics`).
  - Configuración robusta de puerto serie con detección automática.

### Cambiado

- **Seguridad:** SVG eliminado de formatos permitidos por riesgo XSS. Solo WebP para imágenes.
- **Límites:** Eliminado límite duro de partidas simultáneas (ahora es warning suave).
- **Modelos:** Actualizado modelo `User` con `accountStatus` y `currentSessionId`.
- **API:** Endpoints de assets separados en `/images` y `/audio` con validaciones específicas.

### Documentación

- **Protocolo RFID:** Documentación técnica completa con diagramas de secuencia y estados en `backend/docs/RFID_Protocol.md`.
- **Arquitectura:** Nuevos diagramas PlantUML para la arquitectura del sistema y flujos de datos.

## [0.1.0] - 2025-12-15

### Añadido

- **Autenticación:** Sistema completo JWT con Access/Refresh tokens y validación de roles.
- **Gestión de Usuarios:** CRUD para profesores y estudiantes.
- **Hardware RFID:** Integración con servicio `serialport` y simulación para desarrollo.
- **Motor de Juego:** `GameEngine` con soporte para WebSocket (Socket.IO) en tiempo real.
- **Mecánicas:** Base para mecánicas de juego, comenzando con asociación simple.
- **Tests:** Suite completa de tests e2e e integración (Auth, Flujo de Juego, Serial).
- **Documentación:** API REST documentada en `/docs/API_v0.3.0.md`.

### Corregido

- Solucionado problema de "Open Handles" en tests (timers de auth y RFID).
- Resuelto conflicto de nombres en `ValidationError` (error 500).
- Configuración de seguridad ajustada para entornos de test.
