# DUDAS OCTUBRE-NOVIEMBRE:

2. 'Alias' en el modelo 'Card', ¿debería eliminarse? Debido a la presencia de 'assignedValue' en 'GameSession', 'alias' parece redundante. ----> Es redundante
3. ¿Cuándo se asigna el valor a las tarjetas? ¿Durante la creación de la sesión de juego o en otro momento? ----> Durante la creacion de la sesion el profesor elige los valores de un asset.
4. ¿Cómo se eligen las tarjetas para una sesión de juego? ¿Aleatoriamente o basándose en ciertos criterios? ----> Las elige el profesor.
5. ¿Cómo se saben los uids de las tarjetas para crear la sesión de juego? ¿Se escanean previamente o se consultan de la BD? ----> Se encuentran en la BD.
6. ¿Juega sólo un jugador por sesión de juego? ¿O sólo uno por partida y como hay varias partidas por sesión pueden jugar varios jugadores? ----> Solo un jugador por partida, pueden haber varias partidas por sesion.
7. ¿Cómo guardamos el progreso de un jugador? ¿Se almacena en 'GamePlay' (como está ahora) o necesitamos un modelo adicional para 'PlayerProgress'? ----> GamePlay de momento.
8. 'GameContext' ya referencia al id de su mecánica, ¿es necesario que 'GameMechanic' también tenga un campo 'availableContexts' que almacene los contextos disponibles? ----> No.
10. ¿El significado de las cartas para el Map de 'GameSession' debe poderse asignar libremente o deben ser valores ya establecidos en los 'assets' del 'GameContext' que tiene como referencia? ----> Elige los valores al crear la sesion, de un contexto.
12. ¿'GameContext' predefinidos con assets ya integrados o creados desde cero por el usuario admin (profesor)? ¿O ambos? ¿Y cómo gestionamos los assets en cada caso? ¿Se suben a la BD o se almacenan en un sistema de archivos? ----> Hay contextos ya predefinidos, pero el profesor puede sumar assets a los ya creados y puede crear contextos nuevos tmb. Usar supabase para gestionar el almacenamiento.
13. ¿Cómo gestionamos la subida de assets? ¿A través de un endpoint específico en el backend o mediante un servicio externo? ----> Supabase para almacenarlos y consultarlos, un endpoint de API REST para la comunicacion.
14. ¿Deberíamos aplicar denormalización al modelo 'GameSession.cardMappings' para incluir el 'uid' de la tarjeta junto con el 'cardId'? ----> Si.
15. Actualmente, el modelo 'GameContext' referencia a un único 'GameMechanic'. ¿Deberíamos permitir que un 'GameContext' pueda estar asociado a múltiples 'GameMechanics' para mayor flexibilidad en la creación de sesiones de juego? Por ejemplo, el contexto "Geografía" podría ser utilizado tanto para una mecánica de "Asociación" como para una de "Secuencia". ----> Compatibilidad absoluta.
  - 15.1 Si permitimos múltiples 'GameMechanic' para un 'GameContext', ¿todos los contextos deben ser compatibles con todas las mecánicas? ¿O debemos definir reglas de compatibilidad específicas? ¿Cómo gestionamos estas reglas en el backend? ----> Todos los contextos son validos para para todas las mecanicas.
16. ¿Pueden haber varias partidas activas simultáneamente dentro de una misma 'GameSession' para permitir que distintos jugadores puedan juegar y no esperar turnos? ----> Si, se pueden asociar varias partidas a una misma sesion, el profesor crea la sesion (configuracion del juego) y las partidas (asociar un ninio a una sesion de juego para que pueda jugar y se contabilicen sus datos). Lo unico que comparten las partidas entre si, es la sesion, que la configuracion de esa sala de juego, luego las partidas son independientes con cada ninio y las juegan a su ritmo y con sus datos.
17. En el modelo 'GamePlay', ¿deberíamos incluir un campo para registrar la duración total de la partida o el tiempo empleado por cada jugador? Actualmente, sólo manejamos el tiempo máximo por ronda para manejar timeouts, pero no tenemos un seguimiento del tiempo total de juego. ----> Contabilizar tiempo de respueta que tarda en responder desde que se inicia la pregunta o la cuestion, hasta que el ninio responde para controlar los datos de la clase.
18. Cuando se crea una 'GameSession', ¿cómo manejamos la creación de partidas? ¿Se crean todas las partidas de una vez o se generan dinámicamente a medida que los jugadores se unen o avanzan en el juego? ----> Las crea el profesor y el ninio juega.

---

# DUDAS DICIEMBRE:

1. ¿Cómo eliminar los datos de los seeders? ¿Haciendo un drop de la base de datos o eliminando los datos de cada colección individualmente?

2. Cuando estamos en entorno de desarrollo/testing, ¿cómo podemos obtener un token JWT válido para hacer peticiones autenticadas a la API? ¿Deberíamos crear un endpoint especial para obtener tokens de prueba o hay otra forma recomendada?
  - 2.1. ¿Deben poderse desactivar las protecciones de autenticación en entorno de desarrollo para facilitar las pruebas?
  - 2.2. Actualmente se contemplan 2 opciones: desactivar seguridad en desarrollo o un script que genera tokens JWT de prueba para logear un user de prueba. ¿Cuál es la mejor práctica recomendada?

3. ¿Separamos las rutas y controladores de los assets y los contextos o los mantenemos juntos en uno solo (el de contextos)?
4. ¿Es correcto mantener un metadata en el modelos de Card para almacenar información adicional sobre las tarjetas, como descripciones, etiquetas o cualquier otro dato relevante que no encaje en los campos predefinidos? Choca con el uso de assets en contextos

5. En GamePlay mantenemos dos maps para filtrar por partidas que están en activo y para filtrar por tarjetas jugadas. ¿Es correcto mantener estos dos campos en memoria o deberíamos buscar otra forma de optimizar estas consultas? ¿Redis podría ser una solución adecuada para este caso?

6. El profesor puede crear contextos nuevos y añadir assets a contextos ya existentes. ¿Cómo gestionamos los permisos para estas acciones? ¿Deberíamos implementar un sistema de roles más granular para controlar quién puede crear o modificar contextos y assets? ¿O todos los usuarios con rol de profesor tienen estos permisos por defecto?

7. ¿El profesor debe estar linkado a un centro educativo? En caso de que se contemple que el sistema pueda funcionar en distintos centros a la vez, puede ser interesante esta distinción.
  - 7.1. En caso de que deba tener un campo de centro, ¿cómo gestionamos esta relación en el modelo de datos? ¿Deberíamos crear un modelo separado para 'School' y asociarlo con los usuarios que tienen rol de profesor?


## Arquitectura y Escalabilidad

8. **Gestión de sesiones WebSocket**: Actualmente el `gameEngine` mantiene los estados en memoria (`activePlays`, `cardToPlayMap`). Si el servidor se reinicia, ¿se pierden todas las partidas en curso? ¿Deberíamos persistir el estado de las partidas activas en MongoDB/Redis para recuperarlas tras un reinicio?

9. **Múltiples instancias del backend**: Si en el futuro desplegamos múltiples instancias del servidor (load balancing), ¿cómo sincronizamos el estado de las partidas entre instancias? ¿Deberíamos usar Redis Pub/Sub o Socket.IO con adaptador de Redis?

10. **Límite de partidas simultáneas**: ¿Existe un límite máximo de partidas activas simultáneas que el sistema debería soportar? ¿Deberíamos implementar un sistema de cola si se supera ese límite?

## Hardware y Comunicación RFID

11. **Múltiples sensores RFID**: ¿El sistema debería soportar múltiples sensores RFID conectados simultáneamente (diferentes aulas/mesas)? Si es así, ¿cómo identificamos qué sensor envió la lectura y cómo la asociamos a la partida correcta?

12. **Modo offline del sensor**: Si el backend pierde conexión temporalmente, ¿el ESP8266 debería almacenar las lecturas en buffer y enviarlas cuando se restablezca la conexión? ¿O simplemente las descarta?

13. **Validación de tarjetas duplicadas**: ¿Qué ocurre si un alumno escanea la misma tarjeta dos veces seguidas por error? ¿Deberíamos implementar un "debounce" para evitar lecturas duplicadas en un intervalo corto de tiempo?

37. **Gestión de modos de escaneo RFID**: El sensor RFID puede usarse para múltiples propósitos (gameplay, registro de tarjetas, asignación de assets). ¿Cómo gestionamos la exclusión mutua entre modos? ¿Qué ocurre si un profesor intenta registrar una tarjeta mientras otro tiene una partida activa?

38. **Timeout de modos de escaneo**: Si el profesor activa el modo "asignación" pero no escanea ninguna tarjeta en X segundos, ¿volvemos automáticamente a modo idle? ¿Cuánto tiempo de timeout es razonable?

## Lógica de Juego

14. **Rondas con múltiples respuestas correctas**: En la mecánica de "Asociación", ¿puede haber varias tarjetas correctas para un mismo desafío? Por ejemplo: "¿Cuáles son países de Europa?" donde España, Francia e Italia serían correctas.

15. **Orden de las rondas**: ¿Las rondas/desafíos se presentan en orden aleatorio, secuencial, o configurable por el profesor? ¿Debería haber opción de repetir rondas fallidas al final?

16. **Sistema de pistas**: ¿Deberíamos implementar un sistema de pistas para ayudar a los alumnos? Por ejemplo, mostrar las primeras letras de la respuesta o reproducir un audio adicional. ¿Afectaría esto a la puntuación?

17. **Pausa y reanudación de partidas**: Si un alumno necesita pausar la partida (ir al baño, recreo), ¿cómo gestionamos el estado? ¿El tiempo de la ronda actual se congela o se reinicia?

## Gestión de Usuarios y Datos

18. **Eliminación de datos de alumnos**: Por GDPR/LOPD, ¿cómo gestionamos el derecho al olvido? Si un alumno deja el centro, ¿eliminamos sus datos completamente o los anonimizamos para mantener estadísticas agregadas?

19. **Transferencia de alumnos entre profesores**: Si un alumno cambia de clase/profesor, ¿sus métricas históricas se transfieren al nuevo profesor o empiezan de cero?

20. **Límite de alumnos por profesor**: ¿Deberíamos limitar el número de alumnos que un profesor puede gestionar? ¿Y el número de sesiones activas simultáneas?

21. **Datos históricos vs. datos activos**: ¿Cuánto tiempo mantenemos el historial detallado de partidas (`GamePlay.events`)? ¿Deberíamos archivar partidas antiguas para optimizar consultas?

## Métricas y Estadísticas

22. **Cálculo de tendencias**: Para identificar "tendencias positivas o negativas" en el aprendizaje de un alumno, ¿qué ventana temporal usamos? ¿Últimas 5 partidas, última semana, último mes?

23. **Comparación con la clase**: Para comparar el rendimiento de un alumno con "la media de la clase", ¿consideramos todos los alumnos del profesor o solo los del mismo aula/edad?

24. **Exportación de datos**: ¿El profesor debería poder exportar las estadísticas de sus alumnos (CSV, PDF)? ¿Qué datos incluimos y cuáles excluimos por privacidad?

## Assets y Contenido

25. **Límites de almacenamiento en Supabase**: ¿Cuál es el límite de almacenamiento por profesor para assets multimedia? ¿Cómo gestionamos cuando se alcanza el límite?

26. **Formatos de archivos permitidos**: ¿Qué formatos de imagen (PNG, JPG, SVG, WebP) y audio (MP3, WAV, OGG) soportamos? ¿Deberíamos convertir automáticamente a formatos optimizados?

27. **Assets compartidos vs. privados**: Los contextos creados por un profesor, ¿son visibles/usables por otros profesores del mismo centro? ¿O cada profesor tiene su biblioteca privada?

28. **Moderación de contenido**: ¿Necesitamos revisar/aprobar los assets subidos por profesores antes de que estén disponibles? ¿O confiamos en que el contenido es apropiado?

## Seguridad y Autenticación

29. **Sesiones de profesor concurrentes**: ¿Un profesor puede tener sesiones activas en múltiples dispositivos simultáneamente? ¿O deberíamos invalidar la sesión anterior al iniciar una nueva?

30. **Tokens de refresh**: ¿Cuánto tiempo dura el refresh token? ¿Deberíamos implementar rotación de refresh tokens para mayor seguridad?

31. **Recuperación de contraseña**: ¿Implementamos flujo de "olvidé mi contraseña" con email? ¿O el administrador del centro restablece las contraseñas manualmente?

## Despliegue y Operaciones

32. **Entorno de staging**: ¿Necesitamos un entorno de staging/pre-producción para pruebas antes de desplegar a producción?

33. **Backups de base de datos**: ¿Con qué frecuencia hacemos backups de MongoDB? ¿Cuánto tiempo los retenemos?

34. **Monitorización de salud**: Además de Sentry para errores, ¿implementamos health checks y métricas de rendimiento (latencia, uso de memoria, conexiones activas)?

## Accesibilidad

35. **Soporte para alumnos con necesidades especiales**: ¿Deberíamos considerar adaptaciones para alumnos con discapacidad visual (descripciones de audio), auditiva (feedback visual reforzado), o motora (tiempos extendidos)?

36. **Idiomas del sistema**: ¿La interfaz del profesor estará solo en español o soportaremos múltiples idiomas? ¿Y el contenido de los juegos?