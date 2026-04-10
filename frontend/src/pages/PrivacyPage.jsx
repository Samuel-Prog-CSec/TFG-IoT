/**
 * @fileoverview Pagina publica de Politica de Privacidad y Proteccion de Datos
 * Informacion RGPD (Art. 13/14) para padres, madres y tutores legales
 * de los alumnos que utilizan la plataforma EduPlay.
 *
 * Pagina standalone: no requiere autenticacion ni AppLayout.
 *
 * @module pages/PrivacyPage
 */

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  Shield,
  FileText,
  Eye,
  Scale,
  Clock,
  Users,
  ShieldCheck,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { ROUTES } from '../constants/routes';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// ============================================
// CONSTANTES DE CONTENIDO
// ============================================

/**
 * Datos recogidos — lista de datos personales tratados
 * @type {string[]}
 */
const COLLECTED_DATA = [
  'Nombre completo del alumno',
  'Edad (NO fecha de nacimiento — principio de minimizacion, Art. 5.1.c RGPD)',
  'Clase o aula asignada',
  'Metricas de rendimiento en juegos educativos (puntuaciones, tiempos de respuesta, aciertos y errores)',
  'Nombre del tutor legal que otorga el consentimiento',
];

/**
 * Datos explicitamente NO recogidos
 * @type {string}
 */
const NOT_COLLECTED_TEXT =
  'NO recogemos: email, contrasena, direccion postal, telefono, fecha de nacimiento completa, datos biometricos ni datos de salud de los alumnos.';

/**
 * Finalidades del tratamiento
 * @type {{ title: string, description: string }[]}
 */
const PURPOSES = [
  {
    title: 'Seguimiento educativo individualizado',
    description:
      'Registrar el progreso de cada alumno en las sesiones de juego para que el profesor pueda adaptar su ensenanza.',
  },
  {
    title: 'Analisis de rendimiento',
    description:
      'Generar metricas agregadas (puntuaciones medias, tasas de acierto, tiempos de respuesta) que ayuden al profesor a identificar dificultades y fortalezas.',
  },
  {
    title: 'Generacion de informes pedagogicos',
    description:
      'Proporcionar al profesorado herramientas de visualizacion de datos para la toma de decisiones educativas.',
  },
];

/**
 * Bases juridicas del tratamiento
 * @type {{ text: string, reference?: string }[]}
 */
const LEGAL_BASES = [
  {
    text: 'El tratamiento se basa en el consentimiento explicito del titular de la patria potestad o tutela del menor.',
  },
  {
    text: 'Cuando se ofrece un servicio de la sociedad de la informacion a un menor, el tratamiento solo es licito si el consentimiento lo da o autoriza el titular de la patria potestad.',
    reference: 'Art. 8 del Reglamento (UE) 2016/679 (RGPD)',
  },
  {
    text: 'En Espana, la edad minima para consentir es de 14 anos. Los alumnos de 4-8 anos de esta plataforma requieren siempre autorizacion parental.',
    reference: 'Art. 7 de la Ley Organica 3/2018 (LOPDGDD)',
  },
  {
    text: 'El consentimiento se recoge de forma expresa en el momento del alta del alumno, registrando la identidad del tutor, la fecha y las finalidades autorizadas.',
  },
];

/**
 * Plazos de conservacion de datos
 * @type {string[]}
 */
const RETENTION_PERIODS = [
  'Los datos de rendimiento detallados (eventos de partida) se anonimizan automaticamente a los 12 meses de la ultima actividad del alumno. La anonimizacion elimina la vinculacion entre los datos y el alumno, conservando unicamente metricas agregadas sin identificar.',
  'Los datos personales de alumnos inactivos se eliminan completamente tras 24 meses de inactividad.',
  'El tutor legal puede solicitar la eliminacion anticipada de todos los datos en cualquier momento, contactando con la administracion del centro educativo.',
];

/**
 * Roles y su nivel de acceso a datos
 * @type {{ role: string, access: string }[]}
 */
const ACCESS_ROLES = [
  {
    role: 'Profesor asignado',
    access:
      'Acceso de lectura a los datos y metricas pedagogicas de sus alumnos. No puede crear, eliminar ni exportar datos de alumnos.',
  },
  {
    role: 'Administrador del centro (super_admin)',
    access:
      'Gestion completa de identidades, consentimiento parental, exportacion de datos y ejercicio de derechos ARCO en nombre de los tutores.',
  },
  {
    role: 'Terceros',
    access:
      'Los datos personales de los alumnos no se comparten con terceros ni se transfieren fuera del Espacio Economico Europeo.',
  },
];

/**
 * Derechos del interesado (RGPD)
 * @type {{ name: string, article: string, description: string }[]}
 */
const DATA_RIGHTS = [
  {
    name: 'Derecho de acceso',
    article: 'Art. 15 RGPD',
    description: 'Solicitar una copia de todos los datos personales del alumno.',
  },
  {
    name: 'Derecho de rectificacion',
    article: 'Art. 16 RGPD',
    description: 'Corregir datos inexactos o incompletos.',
  },
  {
    name: 'Derecho de supresion',
    article: 'Art. 17 RGPD',
    description:
      'Solicitar la eliminacion completa e irreversible de todos los datos.',
  },
  {
    name: 'Derecho a la portabilidad',
    article: 'Art. 20 RGPD',
    description:
      'Recibir los datos en formato estructurado y de lectura mecanica (JSON).',
  },
  {
    name: 'Derecho de oposicion',
    article: 'Art. 21 RGPD',
    description:
      'Oponerse al tratamiento con fines de analisis de rendimiento.',
  },
];

/**
 * Definicion de las 7 secciones de contenido
 * @type {{ id: string, icon: import('lucide-react').LucideIcon, title: string }[]}
 */
const SECTIONS = [
  { id: 'collected', icon: FileText, title: 'Datos que recogemos' },
  { id: 'purpose', icon: Eye, title: 'Finalidad del tratamiento' },
  { id: 'legal-basis', icon: Scale, title: 'Base juridica' },
  { id: 'retention', icon: Clock, title: 'Plazos de conservacion' },
  { id: 'access', icon: Users, title: 'Quien tiene acceso a los datos' },
  { id: 'rights', icon: ShieldCheck, title: 'Derechos del interesado' },
  { id: 'contact', icon: Mail, title: 'Contacto y reclamaciones' },
];

// ============================================
// VARIANTES DE ANIMACION
// ============================================

/** Contenedor padre para escalonar aparicion de hijos */
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

/** Item individual dentro del contenedor escalonado */
const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/** Variantes vacias para modo reduced motion */
const noMotion = { hidden: {}, visible: {} };

// ============================================
// COMPONENTES INTERNOS
// ============================================

/**
 * Wrapper que anima su contenido cuando entra en viewport.
 * Usa `useInView` de framer-motion para scroll-triggered reveal.
 *
 * @param {{ children: import('react').ReactNode, className?: string, reduced: boolean }} props
 */
function RevealOnScroll({ children, className = '', reduced }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  // Calcula el estado de animacion segun reduced motion y visibilidad
  const visible = { opacity: 1, y: 0 };
  const hidden = { opacity: 0, y: 24 };
  const animateState = reduced || isInView ? visible : hidden;

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : hidden}
      animate={animateState}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Cabecera de seccion: icono + titulo
 *
 * @param {{ icon: import('lucide-react').LucideIcon, title: string }} props
 */
function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center justify-center size-10 rounded-xl bg-brand-base/15 text-brand-light flex-shrink-0">
        <Icon className="size-5" />
      </div>
      <h2 className="text-xl font-semibold font-display text-text-primary">
        {title}
      </h2>
    </div>
  );
}

/**
 * Card glassmorphism reutilizable para cada seccion.
 *
 * @param {{ children: import('react').ReactNode, id?: string }} props
 */
function SectionCard({ children, id }) {
  return (
    <div
      id={id}
      className="rounded-2xl border border-border-default bg-background-elevated/80 backdrop-blur-sm p-6 sm:p-8"
    >
      {children}
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

/**
 * Pagina publica de Politica de Privacidad.
 * Renderiza sin AppLayout ni autenticacion.
 */
export default function PrivacyPage() {
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Privacidad');
  const reduced = shouldReduceMotion;

  // Variantes condicionadas a reduced motion
  const container = reduced ? noMotion : staggerContainer;
  const item = reduced ? noMotion : staggerItem;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-background-deep text-text-primary"
    >
      {/* ================================================
          MINI HEADER — sticky, backdrop blur
          ================================================ */}
      <header className="sticky top-0 z-30 border-b border-border-default bg-background-deep/80 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link
            to={ROUTES.HOME}
            className="font-display text-2xl font-bold gradient-text-brand select-none"
          >
            EduPlay
          </Link>

          <Link
            to={ROUTES.LOGIN}
            className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="size-4" />
            Iniciar sesion
          </Link>
        </div>
      </header>

      {/* ================================================
          CONTENIDO PRINCIPAL
          ================================================ */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ---- HERO ---- */}
        <section className="text-center mb-14">
          {/* Icono hero con gradiente */}
          <motion.div
            initial={reduced ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }
            }
            className="inline-flex items-center justify-center size-20 rounded-full bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink mb-6 shadow-lg shadow-brand-glow"
          >
            <Shield className="size-10 text-white" />
          </motion.div>

          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduced ? 0 : 0.2 }}
            className="text-3xl sm:text-4xl font-bold font-display text-text-primary mb-4"
          >
            Politica de Privacidad y Proteccion de Datos
          </motion.h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reduced ? 0 : 0.3 }}
            className="text-text-secondary text-lg max-w-2xl mx-auto mb-6"
          >
            Informacion sobre el tratamiento de datos personales de menores en
            EduPlay
          </motion.p>

          <motion.span
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: reduced ? 0 : 0.4 }}
            className="inline-block text-xs font-medium text-text-muted bg-background-elevated/80 border border-border-default rounded-full px-4 py-1.5 backdrop-blur-sm"
          >
            Ultima actualizacion: 8 de abril de 2026 &middot; Version 1.0
          </motion.span>
        </section>

        {/* ---- SECCIONES DE CONTENIDO ---- */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* ======== SECCION 1: Datos que recogemos ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[0].id}>
                <SectionHeader
                  icon={SECTIONS[0].icon}
                  title={SECTIONS[0].title}
                />

                <ul className="space-y-3 mb-6">
                  {COLLECTED_DATA.map((datum) => (
                    <li
                      key={datum}
                      className="flex items-start gap-3 text-text-secondary text-sm leading-relaxed"
                    >
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      {datum}
                    </li>
                  ))}
                </ul>

                {/* Caja de datos NO recogidos — borde amber */}
                <div className="rounded-xl border-l-4 border-warning-base bg-warning-base/5 p-4">
                  <p className="text-sm text-text-secondary leading-relaxed">
                    <span className="font-semibold text-warning-base">
                      {NOT_COLLECTED_TEXT.slice(0, 14)}
                    </span>
                    {NOT_COLLECTED_TEXT.slice(14)}
                  </p>
                </div>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 2: Finalidad del tratamiento ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[1].id}>
                <SectionHeader
                  icon={SECTIONS[1].icon}
                  title={SECTIONS[1].title}
                />

                <ul className="space-y-5">
                  {PURPOSES.map((purpose) => (
                    <li key={purpose.title} className="flex items-start gap-3">
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      <div>
                        <p className="font-medium text-text-primary text-sm">
                          {purpose.title}
                        </p>
                        <p className="text-text-secondary text-sm leading-relaxed mt-1">
                          {purpose.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 3: Base juridica ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[2].id}>
                <SectionHeader
                  icon={SECTIONS[2].icon}
                  title={SECTIONS[2].title}
                />

                <ul className="space-y-5">
                  {LEGAL_BASES.map((basis, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      <div>
                        {basis.reference && (
                          <p className="text-xs text-text-muted italic mb-1">
                            {basis.reference}
                          </p>
                        )}
                        <p className="text-text-secondary text-sm leading-relaxed">
                          {basis.text}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 4: Plazos de conservacion ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[3].id}>
                <SectionHeader
                  icon={SECTIONS[3].icon}
                  title={SECTIONS[3].title}
                />

                <ul className="space-y-5">
                  {RETENTION_PERIODS.map((period, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-text-secondary text-sm leading-relaxed"
                    >
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      {period}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 5: Quien tiene acceso ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[4].id}>
                <SectionHeader
                  icon={SECTIONS[4].icon}
                  title={SECTIONS[4].title}
                />

                <ul className="space-y-5">
                  {ACCESS_ROLES.map((entry) => (
                    <li key={entry.role} className="flex items-start gap-3">
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      <div>
                        <p className="font-medium text-text-primary text-sm">
                          {entry.role}
                        </p>
                        <p className="text-text-secondary text-sm leading-relaxed mt-1">
                          {entry.access}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 6: Derechos del interesado ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[5].id}>
                <SectionHeader
                  icon={SECTIONS[5].icon}
                  title={SECTIONS[5].title}
                />

                <ul className="space-y-4 mb-6">
                  {DATA_RIGHTS.map((right) => (
                    <li key={right.name} className="flex items-start gap-3">
                      <span className="mt-1.5 size-1.5 rounded-full bg-brand-base flex-shrink-0" />
                      <div>
                        <p className="text-sm">
                          <span className="font-medium text-text-primary">
                            {right.name}
                          </span>
                          <span className="text-xs text-text-muted italic ml-2">
                            ({right.article})
                          </span>
                        </p>
                        <p className="text-text-secondary text-sm leading-relaxed mt-0.5">
                          {right.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="rounded-xl bg-info-base/5 border border-info-base/15 p-4">
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Para ejercer cualquiera de estos derechos, dirija su
                    solicitud al administrador del centro educativo.
                  </p>
                </div>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>

          {/* ======== SECCION 7: Contacto y reclamaciones ======== */}
          <motion.div variants={item}>
            <RevealOnScroll reduced={reduced}>
              <SectionCard id={SECTIONS[6].id}>
                <SectionHeader
                  icon={SECTIONS[6].icon}
                  title={SECTIONS[6].title}
                />

                <div className="space-y-4 text-text-secondary text-sm leading-relaxed">
                  <p>
                    Para consultas sobre proteccion de datos, contacte con el
                    administrador del centro educativo que gestiona la plataforma
                    EduPlay.
                  </p>
                  <p>
                    Si considera que sus derechos no han sido atendidos, puede
                    presentar una reclamacion ante la{' '}
                    <span className="font-semibold text-text-primary">
                      Agencia Espanola de Proteccion de Datos (AEPD)
                    </span>
                    :{' '}
                    <a
                      href="https://www.aepd.es"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-light hover:text-brand-base underline underline-offset-2 transition-colors"
                    >
                      www.aepd.es
                    </a>
                  </p>
                </div>
              </SectionCard>
            </RevealOnScroll>
          </motion.div>
        </motion.div>
      </main>

      {/* ================================================
          FOOTER
          ================================================ */}
      <footer className="border-t border-border-default py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-2">
          <p className="text-text-muted text-sm font-medium">
            EduPlay — Plataforma de Juegos Educativos con RFID
          </p>
          <p className="text-text-muted/60 text-xs">
            Politica de privacidad &middot; Version 1.0 &middot; Actualizada el
            8 de abril de 2026
          </p>
        </div>
      </footer>
    </motion.div>
  );
}
