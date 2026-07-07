# Índice de documentación

Este directorio reúne la documentación técnica, de seguridad, de despliegue y de planificación
del proyecto (no confundir con la memoria académica del TFG, que vive en el repositorio
`TFG-Memoria-Overleaf`).

## Requisitos y diseño

- [00-Requisitos](00-Requisitos.md) — requisitos del sistema.
- [02-Patrones de Diseño](02-Patrones_Diseno.md) — patrones de diseño globales.
- [03-Gestión de Dependencias](03-Gestion_Dependencias.md) — política de dependencias.
- [Flujo Mazo-Sesión-Mecánicas](Flujo_Mazos_Sesiones_Mecanicas.md) — flujo de negocio.
- [Decisión: BullMQ vs scheduling in-process](Decision_BullMQ_vs_Scheduling_InProcess.md)
- [Decisión: modelo de datos de analytics de partidas](Decision_GamePlay_Analytics_DataModel.md)
- [Revisión de consistencia cartas/assets](Asset_Cards_Consistency_Review.md)
- [Hallazgos de firmware RFID](Firmware_RFID_Findings.md)
- [Propuestas de mejora](propuestas-mejora.md)

## Seguridad y protección de datos

- [SECURITY.md](SECURITY.md) — maestro de seguridad: política de divulgación, modelo de
  amenazas, arquitectura, JWT/MFA/CSP/HMAC, procedimientos operativos.
- [Rotación de secretos](Secrets_Rotation.md) — tabla operativa de rotación.
- [Protección de datos de menores](Proteccion_Datos_Menores.md) — RGPD/LOPDGDD unificado
  (consentimiento, EIPD, RAT, brechas, k-anonimidad).

## Despliegue y operación

- [Deploy_VPS.md](Deploy_VPS.md) — aprovisionamiento de la VPS Contabo (hardening, Docker,
  DNS/TLS, runner self-hosted de GitHub Actions, primer arranque de cada stack).
- [Runbook_Operacional.md](Runbook_Operacional.md) — playbooks operacionales (deploys,
  rollbacks, alertas Sentry/UptimeRobot, RGPD, slow queries).
- [Operational_Dashboard.md](Operational_Dashboard.md) — hub de observabilidad: consolas
  externas, saved queries LogQL, alertas Sentry/UptimeRobot, status page pública.
- [Free_Tier_Budget.md](Free_Tier_Budget.md) — presupuesto de servicios en tier gratuito
  (GitHub Actions, Sentry, Grafana Loki, UptimeRobot, Supabase), consumo estimado y plan B.

## UX, accesibilidad y contenido

- [Accesibilidad.md](Accesibilidad.md) — estrategia WCAG 2.2 AA, suite jest-axe, auditoría
  pre-release.
- [Microcopy_Style_Guide.md](Microcopy_Style_Guide.md) — guía de voz/tono.
- [Onboarding_Tracks.md](Onboarding_Tracks.md) — árbol de pasos del tour guiado por rol.
- [Theme_Color_Pairs.md](Theme_Color_Pairs.md) — pares de contraste WCAG por tema light/dark.
- [Keyboard_Shortcuts.md](Keyboard_Shortcuts.md) — atajos de teclado por rol.
- [Dashboard.md](Dashboard.md) — diseño del dashboard.

## Almacenamiento (Supabase)

- [supabase/Supabase.md](supabase/Supabase.md), [supabase/Referencias.md](supabase/Referencias.md),
  [supabase/SVG_vs_PNG.md](supabase/SVG_vs_PNG.md) — configuración y decisiones de Supabase
  Storage (assets de mazos).

## Seguimiento por sprint

- [Sprint 1 - Fallos](sprints/Sprint1_Fallos.md)
- [Sprint 2 - Tareas](sprints/Sprint2_Tareas.md)
- [Sprint 3 - Tareas](sprints/Sprint3_Tareas.md)
- [Sprint 4 - Tareas](sprints/Sprint4_Tareas.md) · [Mejoras de mantenimiento](Sprint4_Gameplay_Mejoras_Mantenimiento.md)
- [Sprint 5 - Tareas](sprints/Sprint5_Tareas.md)
- [Sprint 6 - Tareas](sprints/Sprint6_Tareas.md)

## Otros

- [Dudas.md](Dudas.md) — dudas abiertas de gestión/alcance.
- [TFG_INDICE_BORRADOR.md](TFG_INDICE_BORRADOR.md) — borrador de índice de la memoria académica.
