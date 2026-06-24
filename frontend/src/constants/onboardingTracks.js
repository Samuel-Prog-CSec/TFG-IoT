/**
 * @fileoverview Tours de onboarding por rol (T-951 PROP-13).
 *
 * Cada track es un array de pasos. Tipos soportados por
 * `OnboardingOverlay.jsx`:
 *  - `'modal'`    — panel centrado a pantalla completa, con icono de
 *                   acento y descripción larga. Útil para introducción
 *                   y cierre del tour.
 *  - `'spotlight'` — recorta visualmente un elemento real de la UI
 *                    (referenciado por `data-tour="<key>"`) y dibuja un
 *                    tooltip apuntador. Útil para "esto es lo que vas a
 *                    usar más" sin sacar al usuario del contexto.
 *
 * El campo `dataTour` debe coincidir con el atributo `data-tour` añadido
 * al elemento real (NavItem, botón…) en `AppLayout.jsx` u otras páginas.
 *
 * Voz de la mascota (Otto guía-narrador):
 *  - `mascotLine` — frase corta del bocadillo de Otto en ese paso (≤~32
 *    caracteres, cálida, DISTINTA de la descripción: anima/orienta, no la
 *    duplica). La consume `MascotGuide` en `OnboardingOverlay.jsx`.
 *  - `mascotMood` — mood del rig para ese paso (opcional; si se omite,
 *    `mascotForStep` deriva: paso 0 → `greeting`, último → `celebrating`,
 *    `spotlight` → `pointing`, resto modal → `thinking`).
 *
 * El track del super_admin está específicamente diseñado contra los tres
 * miedos del jefe de estudios no técnico: (1) "voy a romper algo del
 * centro", (2) "no entiendo esta métrica", (3) "no sé dónde está la cosa
 * que necesito". El lenguaje evita tecnicismos.
 */
import {
  GraduationCap,
  Layers,
  Palette,
  Rocket,
  Gamepad2,
  TrendingUp,
  Shield,
  UserCheck,
  Users,
  BookMarked,
  Wand2,
} from 'lucide-react';

export const TEACHER_TRACK = Object.freeze([
  {
    type: 'modal',
    icon: GraduationCap,
    title: '¡Bienvenido a EduPlay!',
    mascotMood: 'greeting',
    mascotLine: '¡Hola! Soy Otto, te guío.',
    description:
      'Vas a poder crear partidas educativas para tu alumnado usando tarjetas RFID. Te lo enseñamos en un tour de dos minutos. Puedes saltarlo cuando quieras y volver desde la barra lateral.',
  },
  {
    type: 'spotlight',
    dataTour: 'my-decks',
    icon: Layers,
    title: 'Crea tu primer mazo',
    mascotMood: 'pointing',
    mascotLine: 'Empezamos por tus mazos.',
    description:
      'Un mazo es un grupo de tarjetas RFID asociadas a un tema: animales, geografía, números… Lo usarás como base para tus sesiones.',
  },
  {
    type: 'spotlight',
    dataTour: 'contexts',
    icon: Palette,
    title: 'Elige un contexto',
    mascotMood: 'pointing',
    mascotLine: 'Esto pinta tus juegos.',
    description:
      'Los contextos definen las imágenes y audios que tu alumnado verá. Si tu centro ya tiene algunos creados, los reutilizas tal cual.',
  },
  {
    type: 'spotlight',
    dataTour: 'sessions',
    icon: Rocket,
    title: 'Configura una sesión',
    mascotMood: 'pointing',
    mascotLine: 'Aquí montas la partida.',
    description:
      'Eliges mazo, mecánica y reglas. La sesión guarda la configuración para que puedas volver a jugarla cuando quieras.',
  },
  {
    type: 'modal',
    icon: Wand2,
    title: 'Tres mecánicas, tres asistentes',
    mascotMood: 'thinking',
    mascotLine: 'Tres formas de jugar.',
    description:
      'Asociación: el alumnado relaciona la carta con una pista escrita. Memoria: encuentran las parejas en un tablero. Secuencia: reproducen el orden mostrado. El asistente de creación se adapta a la mecánica que elijas: cambia los pasos, los campos y las reglas para que sólo veas lo que necesitas.',
  },
  {
    type: 'modal',
    icon: Gamepad2,
    title: '¡A jugar!',
    mascotMood: 'celebrating',
    mascotLine: '¡Y a pasar tarjetas!',
    description:
      'Tus alumnos pasan las tarjetas físicas por el lector RFID conectado por USB. Si no tienes lector, puedes jugar en modo táctil pulsando las cartas en la pantalla.',
  },
  {
    type: 'spotlight',
    dataTour: 'my-students',
    icon: TrendingUp,
    title: 'Analiza los resultados',
    mascotMood: 'pointing',
    mascotLine: 'Aquí ves cómo van.',
    description:
      'Después de cada partida verás métricas: aciertos, tiempo medio, alumnado que flojea. Te ayuda a decidir qué reforzar la siguiente clase.',
  },
]);

export const SUPER_ADMIN_TRACK = Object.freeze([
  {
    type: 'modal',
    icon: Shield,
    variant: 'warning',
    title: 'Te damos la bienvenida, dirección',
    mascotMood: 'greeting',
    mascotLine: '¡Hola! Te enseño tu panel.',
    description:
      'Eres la dirección de tu centro. Aquí gestionas a tus profesores, al alumnado y al material común. Lo que hagas en este panel solo afecta a tu centro: no te preocupes, no se rompe nada de fuera. Vamos a darte un tour de dos minutos.',
  },
  {
    type: 'spotlight',
    dataTour: 'approvals',
    icon: UserCheck,
    title: 'Aprobaciones — tu portero',
    mascotMood: 'pointing',
    mascotLine: 'Aquí decides quién entra.',
    description:
      'Cuando un docente de tu centro se registra, su solicitud llega aquí. Si la apruebas, ya puede crear mazos y sesiones. Si la rechazas, no entra. Es tu única decisión obligatoria del día a día.',
  },
  {
    type: 'spotlight',
    dataTour: 'admin-students',
    icon: Users,
    title: 'Alumnado del centro',
    mascotMood: 'pointing',
    mascotLine: 'Todo el alumnado, aquí.',
    description:
      'Aquí está el padrón completo del centro, no solo el aula de una persona. Puedes editar nombre o aula sin pedir permiso a nadie. Si un alumno se cambia de tutor, usas la opción "Transferir".',
  },
  {
    type: 'spotlight',
    dataTour: 'admin-contexts',
    icon: BookMarked,
    title: 'Contextos — el material común',
    mascotMood: 'pointing',
    mascotLine: 'El material común, aquí.',
    description:
      'Animales, geografía, números… son los temas que tus profesores usarán para crear sus juegos. Los creas una vez aquí, con sus imágenes y audios, y todo el claustro los usa por igual.',
  },
  {
    type: 'modal',
    icon: GraduationCap,
    title: 'Si te pierdes, vuelves',
    mascotMood: 'happy',
    mascotLine: 'Si te pierdes, vuelve aquí.',
    description:
      'En la barra lateral, abajo a la izquierda, tienes el botón "Ver tutorial". Pulsa cuando quieras y este tour vuelve a empezar. Tu trabajo en el panel no se pierde por hacer un tour: nada se borra, nada se modifica.',
  },
]);

/**
 * Devuelve el track correspondiente al rol del usuario, o null si el
 * usuario no tiene un rol con tour disponible.
 */
export function getTrackForRole(role) {
  if (role === 'teacher') return TEACHER_TRACK;
  if (role === 'super_admin') return SUPER_ADMIN_TRACK;
  return null;
}
