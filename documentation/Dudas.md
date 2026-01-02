# DUDAS OCTUBRE-NOVIEMBRE

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

# DUDAS DICIEMBRE

**Duda principal**: ¿El sistema contempla que hay un único servidor en el que trabajan todos los profesores de distintos centros educativos o por el contrario cada centro educativo cuenta con su propio sistema? ----> Todos en el mismo sistema. No distinción entre centros educativos.

## Arquitectura y Escalabilidad

19. **Gestión de sesiones WebSocket**: Actualmente el `gameEngine` mantiene los estados en memoria (`activePlays`, `cardToPlayMap`). Si el servidor se reinicia, ¿se pierden todas las partidas en curso? ¿Deberíamos persistir el estado de las partidas activas en MongoDB/Redis para recuperarlas tras un reinicio?

20. **Múltiples instancias del backend**: Si en el futuro desplegamos múltiples instancias del servidor (load balancing), ¿cómo sincronizamos el estado de las partidas entre instancias? ¿Deberíamos usar Redis Pub/Sub o Socket.IO con adaptador de Redis?

21. **Límite de partidas simultáneas**: ¿Existe un límite máximo de partidas activas simultáneas que el sistema debería soportar? ¿Deberíamos implementar un sistema de cola si se supera ese límite? No hay limite (de momento).

## Hardware y Comunicación RFID
FRont discrimina cuando si y cuando no valen los datos RFID. EL front establece modos y dice cuando se neceitan modos. Si el front no dice que necesite, el back obvia todos los eventos del rfid.

22. **Múltiples sensores RFID**: ¿El sistema debería soportar múltiples sensores RFID conectados simultáneamente (diferentes aulas/mesas)? Si es así, ¿cómo identificamos qué sensor envió la lectura y cómo la asociamos a la partida correcta? ----> Cada sensor tiene un ID único que se envía junto con la lectura RFID. El backend usa este ID para asociar la lectura a la partida correcta.

23. **Modo offline del sensor**: Si el backend pierde conexión temporalmente, ¿el ESP8266 debería almacenar las lecturas en buffer y enviarlas cuando se restablezca la conexión? ¿O simplemente las descarta? ----> Las descarta (de momento).

24. **Validación de tarjetas duplicadas**: ¿Qué ocurre si un alumno escanea la misma tarjeta dos veces seguidas por error? ¿Deberíamos implementar un "debounce" para evitar lecturas duplicadas en un intervalo corto de tiempo? ----> No es necesario, se tendría que gestionar en el front.

25. **Gestión de modos de escaneo RFID**: El sensor RFID puede usarse para múltiples propósitos (gameplay, registro de tarjetas, asignación de assets). ¿Cómo gestionamos la exclusión mutua entre modos? ¿Qué ocurre si un profesor intenta registrar una tarjeta mientras otro tiene una partida activa? ----> El front indica al backend cuando se necesitan los datos RFID y cuando no. El backend solo procesa los eventos RFID cuando el front ha indicado que se necesitan.

26. **Timeout de modos de escaneo**: Si el profesor activa el modo "asignación" pero no escanea ninguna tarjeta en X segundos, ¿volvemos automáticamente a modo idle? ¿Cuánto tiempo de timeout es razonable? ----> No hay modos en el sensor RFID, el front indica al backend cuando se necesitan los datos RFID y cuando no. El backend solo procesa los eventos RFID cuando el front ha indicado que se necesitan.

## Lógica de Juego

27. **Rondas con múltiples respuestas correctas en Asociación**: En la mecánica de "Asociación", ¿puede haber varias tarjetas correctas para un mismo desafío? Por ejemplo: "¿Cuáles son países de Europa?" donde España, Francia e Italia serían correctas. ----> No, cada ronda tiene una única respuesta correcta.

28. **Orden de las rondas**: ¿Las rondas/desafíos se presentan en orden aleatorio, secuencial, o configurable por el profesor? ¿Debería haber opción de repetir rondas fallidas al final? ---- > Aleatorio. Las rondas falldas no se repiten.

29. **Sistema de pistas**: ¿Deberíamos implementar un sistema de pistas para ayudar a los alumnos? Por ejemplo, mostrar las primeras letras de la respuesta o reproducir un audio adicional. ¿Afectaría esto a la puntuación? ----> De momento no.

30. **Pausa y reanudación de partidas**: Si un alumno necesita pausar la partida (ir al baño, recreo), ¿cómo gestionamos el estado? ¿El tiempo de la ronda actual se congela o se reinicia? ----> La partida se pausa y el tiempo se congela hasta que el profesor reanude la partida. Los estados cambanan a "paused" y "active".

## Gestión de Usuarios y Datos

31. **Eliminación de datos de alumnos**: Por GDPR/LOPD, ¿cómo gestionamos el derecho al olvido? Si un alumno deja el centro, ¿eliminamos sus datos completamente o los anonimizamos para mantener estadísticas agregadas? ----> Anonimizamos los datos para mantener las estadísticas agregadas. Ajustarse a algo legal para la privacidad de datos y GDPR (manejamos datos sensibles de menores). La privacidad es prioritaria y la encriptación de datos sensibles es obligatoria. Debemos ajustarnos a alguna normativa vigente en protección de datos (España/EU).

32. **Transferencia de alumnos entre profesores**: Si un alumno cambia de clase/profesor, ¿sus métricas históricas se transfieren al nuevo profesor o empiezan de cero? ----> Se transfieren al nuevo profesor. Realmente los datos están asociados al alumno, no al profesor y se mantienen aunque cambie de profesor. Solo se modifica el campo 'assignedTeacher' del alumno para reflejar el nuevo profesor y el campo 'classroom'.

33. **Límite de alumnos por profesor**: ¿Deberíamos limitar el número de alumnos que un profesor puede gestionar? ¿Y el número de sesiones activas simultáneas? ----> No hay límite.

34. **Datos históricos vs. datos activos**: ¿Cuánto tiempo mantenemos el historial detallado de partidas (`GamePlay.events`)? ¿Deberíamos archivar partidas antiguas para optimizar consultas? ----> Mantenemos todo el historial detallado de partidas indefinidamente. No se archivan partidas antiguas (de momento).

35. **Eliminación de seeders**: ¿Cómo eliminar los datos de los seeders? ¿Haciendo un drop de la base de datos o eliminando los datos de cada colección individualmente?n ----> Haciendo un drop de la base de datos. Son solo datos de prueba para desarrollo. No tienen sentido en producción ni valor de negocio.

36. **Relación entre profesores y cartas**: ¿Las cartas son un conjunto inconexo dentro de la BD o sería mejor relacionar cartas con mazos y cada mazo con un profesor en concreto? Cada profesor sólo puede CRUD sobre su propio mazo de cartas. ¿Un profesor puede tener acceso solo a las cartas que él ha creado o puede usar cartas creadas por otros profesores del mismo centro educativo (si puede usar las de otros, entonces denerían estar relacionados los mazos al centro educativo también)? ----> Las cartas no están relacionadas con los profesores. Todos los profesores pueden usar todas las cartas disponibles en el sistema. No hay distinción entre centros educativos. Sin embargo, cada profesor puede crear mazos de cartas y asociar a esos mazos assets y significados concretos para luego usarlas en sus sesiones de juego y no perder tiempo escaneando todas las cartas que va a usar para esa sesion de juego.

37. **Relacionar el centro educativo con el profesor**: ¿El profesor debe estar linkado a un centro educativo? En caso de que se contemple que el sistema pueda funcionar en distintos centros a la vez, puede ser interesante esta distinción. ----> No se contempla esta distinción de momento. No habrá distinción entre centros educativos.
  - 37.1. En caso de que deba tener un campo de centro, ¿cómo gestionamos esta relación en el modelo de datos? ¿Deberíamos crear un modelo separado para 'School' y asociarlo con los usuarios que tienen rol de profesor? ----> No es necesario crear un modelo separado para 'School' de momento.

38. **Campo metadata dentro del modelo `Card`**: ¿Es correcto mantener un metadata en el modelos de Card para almacenar información adicional sobre las tarjetas, como descripciones, etiquetas o cualquier otro dato relevante que no encaje en los campos predefinidos? Choca con el uso de assets en contextos. ----> No es necesario mantener un campo metadata en el modelo de Card. La información adicional sobre las tarjetas debe gestionarse a través de los assets y contextos asociados. Ya lo hemos eliminado del modelo de Card.

39. **Maps en memoria**: En GamePlay mantenemos dos maps para filtrar por partidas que están en activo y para filtrar por tarjetas jugadas. ¿Es correcto mantener estos dos campos en memoria o deberíamos buscar otra forma de optimizar estas consultas? ¿Redis podría ser una solución adecuada para este caso? ----> Se usara Redis para mantener estos dos maps en memoria y optimizar las consultas. El de las cartas en uso no sera necesario ya que el front debe escanear el profesor que cartas va a usar en la sesion de juego y el backend solo procesara esas cartas. Por lo que siempre seran cartas que no estan en uso en otras partidas. Tambien se pueden usar mazos preconfgurados por el profesor pero eso lo decide el profesor. En cualquier caso de cualquier forma, el backend solo procesara las cartas que el front ha indicado que se van a usar en la sesion de juego y siempre seran cartas que no estan en uso en otras partidas.

## Métricas y Estadísticas

pantalla resumen / CLases -> grupos -> ninio

40. **Cálculo de tendencias**: Para identificar "tendencias positivas o negativas" en el aprendizaje de un alumno, ¿qué ventana temporal usamos? ¿Últimas 5 partidas, última semana, último mes?

41. **Comparación con la clase**: Para comparar el rendimiento de un alumno con "la media de la clase", ¿consideramos todos los alumnos del profesor o solo los del mismo aula/edad?

42. **Exportación de datos**: ¿El profesor debería poder exportar las estadísticas de sus alumnos (CSV, PDF)? ¿Qué datos incluimos y cuáles excluimos por privacidad?

## Assets y Contenido

43. **Límites de almacenamiento en Supabase**: ¿Cuál es el límite de almacenamiento por profesor para assets multimedia? ¿Cómo gestionamos cuando se alcanza el límite?

44. **Formatos de archivos permitidos**: ¿Qué formatos de imagen (PNG, JPG, SVG, WebP) y audio (MP3, WAV, OGG) soportamos? ¿Deberíamos convertir automáticamente a formatos optimizados?
webp y svg solo -> priorizaqr ancho de banda y alamacenamiento / fACILITAR COINVERSOR

45. **Assets compartidos vs. privados**: Los contextos creados por un profesor, ¿son visibles/usables por otros profesores del mismo centro? ¿O cada profesor tiene su biblioteca privada? ¿Todos los profesores de todos los centros pueden ver los contextos creados por otros profesores? COMPARTIDOS

46. **Moderación de contenido**: ¿Necesitamos revisar/aprobar los assets subidos por profesores antes de que estén disponibles? ¿O confiamos en que el contenido es apropiado? CONFIAMOS

47. **Controlador contexto y de assets**: ¿Separamos las rutas y controladores de los assets y los contextos o los mantenemos juntos en uno solo (el de contextos)? JUNTOS

## Seguridad y Autenticación

48. **Sesiones de profesor concurrentes**: ¿Un profesor puede tener sesiones activas en múltiples dispositivos simultáneamente? ¿O deberíamos invalidar la sesión anterior al iniciar una nueva? ----> No puede tener sesiones activas en múltiples dispositivos simultáneamente. Al iniciar una nueva sesión, se invalida la sesión anterior.

49. **Tokens de refresh**: ¿Cuánto tiempo dura el refresh token? ¿Deberíamos implementar rotación de refresh tokens para mayor seguridad? ----> El refresh token dura 7 días. Sí, implementamos rotación de refresh tokens para mayor seguridad. Usaremos Redis para almacenar los refresh tokens y gestionar su validez y rotación.

50. **Recuperación de contraseña**: ¿Implementamos flujo de "olvidé mi contraseña" con email? ¿O el administrador del centro restablece las contraseñas manualmente?

51. **Permisos para añadir assets vs. todos los profesores pueden**: El profesor puede crear contextos nuevos y añadir assets a contextos ya existentes. ¿Cómo gestionamos los permisos para estas acciones? ¿Deberíamos implementar un sistema de roles más granular para controlar quién puede crear o modificar contextos y assets? ¿O todos los usuarios con rol de profesor tienen estos permisos por defecto? ----> Todos pueden, pero necesitamos un super admin que valide user profesor nuevo. El profesor nuevo usa el register normal y luego el super admin valida su cuenta para que pueda acceder al sistema. Si el super admin no valida su cuenta, el profesor no puede acceder al sistema.

52. **JWT en entorno de desarrollo**: Cuando estamos en entorno de desarrollo/testing, ¿cómo podemos obtener un token JWT válido para hacer peticiones autenticadas a la API? ¿Deberíamos crear un endpoint especial para obtener tokens de prueba o hay otra forma recomendada?
  - 52.1. ¿Deben poderse desactivar las protecciones de autenticación en entorno de desarrollo para facilitar las pruebas?
  - 52.2. Actualmente se contemplan 2 opciones: desactivar seguridad en desarrollo o un script que genera tokens JWT de prueba para logear un user de prueba. ¿Cuál es la mejor práctica recomendada?

## Despliegue y Operaciones

53. **Entorno de staging**: ¿Necesitamos un entorno de staging/pre-producción para pruebas antes de desplegar a producción?

54. **Backups de base de datos**: ¿Con qué frecuencia hacemos backups de MongoDB? ¿Cuánto tiempo los retenemos?

55. **Monitorización de salud**: Además de Sentry para errores, ¿implementamos health checks y métricas de rendimiento (latencia, uso de memoria, conexiones activas)?

## Accesibilidad

56. **Soporte para alumnos con necesidades especiales**: ¿Deberíamos considerar adaptaciones para alumnos con discapacidad visual (descripciones de audio), auditiva (feedback visual reforzado), o motora (tiempos extendidos)? ----> De momento no.

57. **Idiomas del sistema**: ¿La interfaz del profesor estará solo en español o soportaremos múltiples idiomas? ¿Y el contenido de los juegos? ----> De momento solo en español.

## Migraciones

58. **Migración NodeJS a Bun**: ¿Es recomendable migrar el backend de NodeJS a Bun? ¿Velocidad de arranque y despliegue? ----> De momento no es necesario migrar a Bun. NodeJS es suficiente para nuestras necesidades actuales y futuras a corto-medio plazo.

59. **Migración de MongoDB a Supabase**: ¿Es recomendable migrar la base de datos de MongoDB a Supabase? ¿Ventajas y desventajas? ¿Seguridad y ventajas de usar Supabase en producción?
  - 59.1. En el caso de quedarnos en MongoDB, ¿sería recomendable mover la parte de autenticación a Supabase con SQL? ----> De momento no es necesario migrar a Supabase. MongoDB es suficiente para nuestras necesidades actuales y futuras a corto-medio plazo. La autenticación puede seguir gestionándose con MongoDB y JWT sin problemas.
