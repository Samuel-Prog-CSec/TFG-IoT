1. En lugar de usar SerialPort para la comunicación SERVIDOR <----> ESP8266, ¿utilizar MQTT para una comunicación más eficiente y escalable? Evitamos problemas de 1 dispositivo conectado únicamente y permitimos que cada usuario disponga de su propio ESP8266. Implementación actual => SerialPort - único dispositivo conectado al servidor.
2. 'Alias' en el modelo 'Card', ¿debería eliminarse? Debido a la presencia de 'assignedValue' en 'GameSession', 'alias' parece redundante.
3. ¿Cuándo se asigna el valor a las tarjetas? ¿Durante la creación de la sesión de juego o en otro momento?
4. ¿Cómo se eligen las tarjetas para una sesión de juego? ¿Aleatoriamente o basándose en ciertos criterios?
5. ¿Cómo se saben los uids de las tarjetas para crear la sesión de juego? ¿Se escanean previamente o se consultan de la BD?
  - 5.1 En caso de que se consulten de la BD, necesitamos un modelo mas genérico para las tarjetas y otro más especifico para las tarjetas del juego.
6. ¿Juega sólo un jugador por sesión de juego? ¿O sólo uno por partida y como hay varias partidas por sesión pueden jugar varios jugadores?
7. ¿Cómo guardamos el progreso de un jugador? ¿Se almacena en 'GamePlay' (como está ahora) o necesitamos un modelo adicional para 'PlayerProgress'?
8. 'GameContext' ya referencia al id de su mecánica, ¿es necesario que 'GameMechanic' también tenga un campo 'availableContexts' que almacene los contextos disponibles?
9. ¿Tener en cuenta las respuestas a las preguntas en el backend o sólo almacenar los valores dados a las tarjetas y que se encargue el frontend de comparar pregunta-respuesta?
10. ¿El significado de las cartas para el Map de 'GameSession' debe poderse asignar libremente o deben ser valores ya establecidos en los 'assets' del 'GameContext' que tiene como referencia?
11. ¿Cómo validamos que un 'GameContext' es compatible con una 'GameMechanic'? ¿Qué criterios deben cumplirse? ¿Y cómo los verificamos?
12. ¿'GameContext' predefinidos con assets ya integrados o creados desde cero por el usuario admin (profesor)? ¿O ambos? ¿Y cómo gestionamos los assets en cada caso? ¿Se suben a la BD o se almacenan en un sistema de archivos?
  - 12.1 En caso de que los contextos sean predefinidos, ¿se eligen con qué assets se juega desde 'GamePlay'?
  - 12.2 En caso de que los contextos sean predefinidos, ¿se pueden agregar nuevos assets? Si se añaden nuevos assets, se añaden al crear la partida o en un menú de administración/configuración?
  - 12.3 Misma pregunta para el caso de crear contextos desde cero.
13. ¿Cómo gestionamos la subida de assets? ¿A través de un endpoint específico en el backend o mediante un servicio externo?
14. ¿Deberíamos aplicar denormalización al modelo 'GameSession.cardMappings' para incluir el 'uid' de la tarjeta junto con el 'cardId'?
  - 14.1 El rfidService nos da un uid (String, ej. "A1-B2-C3-..."), pero nuestro modelo GameSession.cardMappings solo tiene el cardId (ObjectId) para evitar redundancia. Esto obligaría al GameEngine a hacer una consulta a la base de datos (un populate) por cada escaneo para averiguar si el uid "A1-B2-C3" corresponde a ese cardId.
  - 14.2 El GameSession es un "contrato" para una partida, ¿sería válido que este contrato almacene tanto el identificador lógico (cardId) como el físico (uid) en el momento de su creación? ¿Rendimiento en tiempo real es más importante que la pureza de la normalización?
  - 14.3 Alternativamente, ¿deberíamos mantener la normalización y optimizar las consultas del GameEngine para minimizar el impacto en el rendimiento?

