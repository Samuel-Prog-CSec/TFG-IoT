# Fix de cargas vacias al navegar rapido

## Problema
Al iniciar sesion y navegar rapido entre vistas (Dashboard, Sesiones, Mazos, etc.), algunas pantallas se quedan vacias durante varios segundos o muestran errores de carga. Si se espera un poco, los datos aparecen.

## Sintomas observados
- Vistas que se quedan en blanco tras cambios rapidos de menu.
- Requests que terminan tarde y pisan el estado actual.
- Errores intermitentes en consola que no son reproducibles en navegacion lenta.
- En Sesiones, el listado aparece menos de un segundo y luego desaparece.

## Causa tecnica
- Cada vista dispara requests en `useEffect` al montar.
- Al cambiar rapido de vista, quedan requests en vuelo.
- El estado de la vista se resetea antes de que llegue el nuevo resultado.
- No se cancelan peticiones al desmontar, por lo que llegan respuestas tardias.
- Animaciones de Framer Motion duplicadas (layout y pagina) causaban que algunos contenedores quedaran en `opacity: 0` durante transiciones.

## Solucion aplicada (Sprint actual)
1. Cancelar requests al desmontar la vista (AbortController).
2. Mantener el ultimo dataset visible mientras llega el nuevo (no limpiar datos en cada carga).
3. Evitar que una respuesta tardia actualice una vista ya desmontada.
4. Refetch al recuperar foco/visibilidad cuando no hay datos visibles.
5. Ajustar animaciones para evitar que el contenido quede oculto tras transiciones.

### Beneficios
- Eliminacion de pantallas en blanco.
- Menor latencia percibida al navegar.
- Menos condiciones de carrera en el estado.
- Sesiones ya no desaparece tras cargar.

## Buenas practicas adoptadas
- Cada vista con carga remota tendra cleanup de request.
- Las llamadas se encapsulan para poder abortar de forma consistente.
- No se borra el estado de datos al iniciar un fetch; se usa un estado `loading`.
- Refetch controlado en `focus` y `visibilitychange` si no hay datos.
- Evitar animaciones duplicadas en el mismo arbol de ruta.

## Ajustes clave en frontend
- `useRefetchOnFocus` agregado para reintentar cargas cuando el usuario vuelve al tab.
- `AbortController` aplicado a vistas con carga remota (Dashboard, Sesiones, Mazos, Detalle/Edicion, Transferencias, Admin).
- En Sesiones, se removio la animacion de pagina duplicada para evitar el estado invisible.

## Ajustes clave en backend relacionados con estabilidad
- CORS y rate limit reordenados para evitar 429/403 inesperados en dev.
- `auth/refresh` aceptando body vacio y token en body, con cookies SameSite lax en dev.
- Desactivado ETag y agregado `Cache-Control: no-store` en `/api` para evitar 304 sin body.
- Validacion de analytics para rangos `7d` y `30d`.

## Descubrimientos durante el debug
- La API devolvia datos correctos, pero el render quedaba oculto por animaciones en cascada.
- El problema no era de rendimiento: el listado aparecia y desaparecia por el estado `initial`/`exit` en dos niveles.
- Al navegar rapido, las respuestas tardias podian dejar el estado vacio si se reseteaba en cada carga.

## Plan futuro: React Query (proximo sprint)
React Query ayudara a cachear datos y evitar recargas innecesarias.

### Fase 1: Base de infraestructura
- Instalar `@tanstack/react-query`.
- Crear `QueryClient` y provider en el entry del frontend.
- Configurar politicas globales: `staleTime`, `cacheTime`, `retry`.

### Fase 2: Migracion de vistas criticas
- Migrar Dashboard (analytics) a `useQuery`.
- Migrar Sesiones y Mazos.
- Eliminar estados locales duplicados de loading/error.

### Fase 3: Afinar UX y cache
- Prefetch de vistas desde el menu lateral.
- Invalidacion al crear/editar recursos.
- Spinner y skeletons unificados.

### Criterios de exito
- Navegacion rapida sin pantallas vacias.
- Requests repetidos minimizados.
- Menor tiempo de carga percibido.

## Notas
- Esta solucion es compatible con el backend actual y no requiere cambios en la API.
- Si reaparece un efecto similar, revisar primero las transiciones de `AppLayout` y cualquier `motion.div` anidado con `initial`/`exit`.
