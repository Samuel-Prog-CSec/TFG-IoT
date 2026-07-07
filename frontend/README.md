# Frontend - EduPlay

Una plataforma de juegos educativos con tecnología RFID para niños de 4-8 años.

## Índice de Documentación

| Documento | Descripción |
|-----------|-------------|
| [Patrones de Diseño](./docs/01-PATRONES-DISENO.md) | Patrones arquitectónicos y de código utilizados |
| [Buenas Prácticas](./docs/02-BUENAS-PRACTICAS.md) | Convenciones y estándares del proyecto |
| [UI/UX Guidelines](./docs/03-UI-UX-GUIDELINES.md) | Decisiones de diseño visual y experiencia de usuario |
| [Estructura del Proyecto](./docs/04-ESTRUCTURA-PROYECTO.md) | Organización de carpetas y archivos |
| [Gameplay Realtime](./docs/05-GAMEPLAY-REALTIME.md) | Contrato funcional de partida Association/Memory y estados UI |

## Stack Tecnológico

- **React 19** - Biblioteca de UI con Hooks
- **Vite 8** - Build tool y dev server
- **Tailwind CSS 4** - Estilos utility-first
- **Framer Motion 12** - Animaciones declarativas
- **React Router 7** - Navegación SPA

En desarrollo/QA local, el frontend se sirve vía Docker + Nginx (`docker compose up -d`,
puerto 80) o con `npm run dev` (Vite, puerto 5173). En despliegue, se sirve igual —
contenedor Nginx dentro del stack Docker Compose de la VPS— sin depender de ningún hosting
estático de terceros.

## Inicio Rápido

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build producción
npm run build

# Lint
npm run lint

# Tests
npm run test

# Tests en modo watch
npm run test:watch

# Tests con cobertura
npm run test:coverage

# Auditoría runtime/prod
npm run audit:prod

# Auditoría completa (incluye devDependencies)
npm run audit:full
```

---

*Última actualización: Julio 2026*
