/**
 * @fileoverview Microcopy centralizado de EduPlay (T-951 Fase 2).
 *
 * Esqueleto inicial — la migración completa de cadenas se hace en T-959
 * (microcopy review). Aquí establecemos las categorías y un pequeño
 * conjunto de mensajes clave para que el resto de la app pueda
 * empezar a consumir tono uniforme sin inventarse strings sueltos.
 *
 * # Principios de voz
 *
 *  1. **Segunda persona ("tú")** — el profesor lee directamente al lector.
 *  2. **Verbos directos** — "Crear sesión" no "Sesión nueva". CTA acciona.
 *  3. **Sin tecnicismos** — nada de "endpoint", "JSON", "ID". Lenguaje
 *     de sala de profesores: "padrón", "claustro", "material", "centro".
 *  4. **Errores accionables** — cada error apunta al siguiente paso.
 *     "Revisa la fecha de inicio: no puede ser anterior a hoy" no
 *     "Fecha inválida".
 *  5. **Tooltips útiles** — explican QUÉ HACE el botón, no decoran.
 *  6. **Tono docente** — cercano, confiado, sin paternalismo.
 *  7. **Longitud apropiada** — empty states de 1-2 frases con un siguiente
 *     paso claro; tooltips de 1 frase.
 *
 * Documentación de la guía completa: `documentation/Microcopy_Style_Guide.md`.
 */

/**
 * Mensajes de empty state. Cada uno ofrece un siguiente paso accionable.
 * El campo `cta` se usa para enlazar el botón principal.
 */
export const EMPTY_STATES = Object.freeze({
  decks: {
    title: 'Aún no tienes mazos',
    description:
      'Un mazo es un grupo de tarjetas RFID listas para jugar. Crea el primero y elige el contexto educativo.',
    cta: 'Crear mi primer mazo',
  },
  sessions: {
    title: 'Aún no has lanzado ninguna sesión',
    description:
      'Una sesión es la partida que vas a jugar con tu clase: eliges mazo, mecánica y reglas. Cuando estés lista, lanza la primera.',
    cta: 'Crear sesión',
  },
  students: {
    title: 'Aún no hay alumnado en tu aula',
    description:
      'Añade a tus alumnos manualmente o pide a tu jefe de estudios que los transfiera desde el padrón del centro.',
    cta: 'Añadir alumno',
  },
  contexts: {
    title: 'Aún no hay contextos disponibles',
    description:
      'Los contextos son los temas de tus juegos: animales, geografía, números… Crea uno o pídelo a la dirección del centro.',
    cta: 'Crear contexto',
  },
  notifications: {
    title: 'Sin notificaciones nuevas',
    description: 'Aquí verás cuando tu alumnado complete una partida o haya alertas que necesiten tu atención.',
  },
  alerts: {
    title: 'Todo va bien',
    description:
      'No hay alertas activas en este momento. Te avisaremos en cuanto algo necesite tu atención.',
  },
});

/**
 * Tooltips de KPIs y elementos de la UI que requieren explicación.
 * Especialmente importantes en el panel de dirección, donde el usuario
 * puede no estar familiarizado con métricas pedagógicas.
 */
export const TOOLTIPS = Object.freeze({
  kpis: {
    averageScore:
      'Media de puntuación de tu alumnado en los últimos 30 días. Sube cuando aciertan más; baja cuando fallan.',
    engagementScore:
      'Cuánto se "engancha" tu alumnado a las partidas: combina aciertos, tiempo de respuesta y rondas completadas.',
    studentsInRisk:
      'Alumnos cuya media reciente está por debajo del umbral RAG en rojo. Conviene revisar su progreso.',
    totalGames: 'Partidas jugadas en los últimos 30 días por todo tu alumnado.',
    averageTimePerRound:
      'Tiempo medio que tarda tu alumnado en resolver una ronda. Si sube, puede indicar dificultad.',
  },
  actions: {
    duplicateSession:
      'Crea una copia de esta sesión para no rehacer la configuración desde cero.',
    archiveSession:
      'La sesión deja de aparecer en el listado pero sus datos se conservan en analytics.',
    transferStudent:
      'Mueve a este alumno al aula de otro profesor. La dirección debe haber asignado el destino.',
  },
  ui: {
    rfidSensor:
      'El lector RFID conectado por USB. Si no tienes hardware, puedes jugar en modo táctil.',
    fallbackTouch:
      'Modo táctil de respaldo: tus alumnos pulsan las cartas en pantalla en lugar de pasarlas por el lector.',
    onboardingResume: 'Vuelve a ver el tutorial desde el principio.',
  },
});

/**
 * CTAs principales de formularios. Verbos directos, sin redundancias.
 */
export const CTAS = Object.freeze({
  create: 'Crear',
  createSession: 'Crear sesión',
  createDeck: 'Crear mazo',
  createContext: 'Crear contexto',
  save: 'Guardar cambios',
  saveAndContinue: 'Guardar y continuar',
  cancel: 'Cancelar',
  duplicate: 'Duplicar',
  archive: 'Archivar',
  delete: 'Eliminar',
  play: 'Jugar',
  playAgain: 'Volver a jugar',
  approve: 'Aprobar',
  reject: 'Rechazar',
  transfer: 'Transferir',
});

/**
 * Mensajes de error más comunes con tono accionable.
 * Ningún mensaje termina en punto + "Inténtalo de nuevo" sin contexto;
 * cada uno explica cómo resolver el problema.
 */
export const ERRORS = Object.freeze({
  generic: 'Algo no ha ido bien. Vuelve a intentarlo en unos segundos.',
  network:
    'No hemos podido conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.',
  unauthorized:
    'Tu sesión ha caducado. Inicia sesión de nuevo para seguir trabajando.',
  forbidden:
    'No tienes permiso para hacer esto. Si crees que es un error, contacta con la dirección del centro.',
  notFound: 'No hemos encontrado lo que buscabas. Quizá se haya eliminado.',
  validation:
    'Revisa los campos marcados en rojo: alguno necesita una corrección.',
  rateLimit:
    'Has hecho demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.',
});
