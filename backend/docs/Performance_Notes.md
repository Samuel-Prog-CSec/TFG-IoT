# Notas de Rendimiento - WebSockets (T-046)

## Contexto

Con la autenticación obligatoria en el handshake de Socket.IO, el servidor realiza una consulta a la base de datos para validar el estado de la cuenta y el single-session antes de aceptar la conexión. Esto mejora la seguridad pero añade coste por conexión.

## Riesgo

- Aumento de latencia en el handshake cuando hay picos de conexiones simultáneas.
- Carga adicional en MongoDB si se abren muchas conexiones en poco tiempo.

## Posibles mejoras futuras

1. **Cache breve en memoria/Redis**
   - Cachear `status`, `accountStatus`, `currentSessionId` por `userId` con TTL corto (ej. 30-60s).
   - Reduce lecturas repetidas durante reconexiones rápidas.

2. **Claims adicionales en el token**
   - Incluir `accountStatus` y `status` en el access token.
   - Validar primero el token y luego aplicar una comprobación periódica desde Redis o una revisión en segundo plano para invalidaciones.

3. **Revalidación periódica de sockets**
   - Middleware o job que revalide sockets activos en intervalos (ej. cada 5-10 min).
   - Desconectar sockets si la cuenta cambia de estado o sesión inválida.

4. **Protección ante reconnect storms**
   - Rate limit específico de handshake (por IP o userId) para evitar tormentas de reconexión.

## Decisión actual

- Se prioriza seguridad y consistencia de sesión sobre latencia mínima en el handshake.
- La optimización se pospone hasta medir métricas reales de conexiones en producción.
