/**
 * @fileoverview Configuración de OpenAPI 3.1 + Swagger UI (ADR-146).
 *
 * Genera la spec desde anotaciones JSDoc `@openapi` en `routes/*.js` y la
 * expone vía dos endpoints:
 *
 * - `GET /api/docs`        — UI interactiva (swagger-ui-express).
 * - `GET /api/openapi.json` — Spec JSON descargable, útil para clientes generados.
 *
 * En `APP_ENV=staging` la UI es pública para facilitar exploración.
 * En `APP_ENV=production` requiere autenticación de super_admin (igual que
 * `/api/health/metrics`) — no queremos que un escáner de bots descubra
 * la superficie completa de la API en prod.
 *
 * El stub mínimo viable cubre `info`, `servers`, `security`, `tags` y
 * `components.securitySchemes`. Las definiciones detalladas por endpoint
 * se completan progresivamente con anotaciones `@openapi` en cada router.
 *
 * @module config/swagger
 */

const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');
const pkg = require('../../package.json');

const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development';

/**
 * Servers según el entorno. En cloud cada entorno tiene su URL canónica.
 * @returns {Array<{url: string, description: string}>}
 */
const buildServers = () => {
  const servers = [];

  if (APP_ENV === 'production') {
    servers.push({
      url: process.env.PUBLIC_API_URL || 'https://api.eduplay.example.com/api',
      description: 'Producción'
    });
  } else if (APP_ENV === 'staging') {
    servers.push({
      url: process.env.PUBLIC_API_URL || 'https://api-staging.eduplay.example.com/api',
      description: 'Staging'
    });
  }

  // Local siempre disponible para probar contra dev server.
  servers.push({
    url: `http://localhost:${process.env.PORT || 5000}/api`,
    description: 'Desarrollo local'
  });

  return servers;
};

/**
 * Spec base. Las anotaciones `@openapi` en `routes/*.js` se mergean encima
 * por swagger-jsdoc.
 */
const definition = {
  openapi: '3.1.0',
  info: {
    title: 'EduPlay RFID — API',
    version: pkg.version,
    description: [
      'API REST de la plataforma educativa con RFID. Backend Express 5 + Mongoose 9 + ',
      'Socket.IO 4 + Redis 7. Autenticación basada en JWT (access 15min + refresh 7d) con ',
      'rotación, blacklist en Redis y CSRF double-submit cookie.',
      '',
      'Convenciones de respuesta documentadas en `documentation/Architecture_Decisions.md` (ADR-003).'
    ].join('\n'),
    contact: {
      name: 'Samuel Blanchart Pérez',
      url: 'https://github.com/Samuel-Prog-CSec/TFG-IoT'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: buildServers(),
  tags: [
    { name: 'Auth', description: 'Login, registro, refresh y revocación de tokens' },
    { name: 'Users', description: 'Gestión de usuarios (docentes, alumnos, super admin)' },
    { name: 'Mechanics', description: 'Mecánicas de juego (memory, association, sequence)' },
    { name: 'Contexts', description: 'Contextos temáticos y assets reutilizables' },
    { name: 'Decks', description: 'Mazos reutilizables (cartas + asignación RFID)' },
    { name: 'Sessions', description: 'Sesiones de juego (configuración + asignación)' },
    { name: 'Plays', description: 'Partidas individuales (start, pause, resume, end)' },
    { name: 'Analytics', description: 'Métricas y dashboards' },
    { name: 'Notifications', description: 'Notificaciones tiempo real (T-955)' },
    { name: 'Admin', description: 'Operaciones de super admin (auditoría, RGPD)' },
    { name: 'Health', description: 'Health checks (liveness, readiness, métricas runtime)' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT en el header Authorization: Bearer <token>'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'accessToken',
        description: 'Cookie HttpOnly con el JWT (preferida sobre Authorization header)'
      }
    },
    responses: {
      UnauthorizedError: {
        description: 'Token ausente, inválido o expirado',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'UNAUTHORIZED' },
                    message: { type: 'string', example: 'Token inválido o expirado' }
                  }
                }
              }
            }
          }
        }
      },
      ValidationError: {
        description: 'Error de validación Zod en body/query/params',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'VALIDATION_ERROR' },
                    message: { type: 'string' },
                    issues: { type: 'array' }
                  }
                }
              }
            }
          }
        }
      },
      RateLimitError: {
        description: 'Demasiadas peticiones — rate limit excedido',
        headers: {
          'Retry-After': {
            schema: { type: 'integer' },
            description: 'Segundos hasta la próxima ventana'
          }
        }
      }
    }
  },
  // Las rutas autenticadas declaran su `security` explícitamente.
  // No ponemos security global aquí porque los endpoints de auth y health son públicos.
  security: []
};

/**
 * Patrón de ficheros que swagger-jsdoc escanea para extraer anotaciones.
 * Se incluyen tanto rutas como controladores (algunos handlers tienen JSDoc
 * con la firma de la respuesta).
 */
const apis = [path.join(__dirname, '../routes/*.js'), path.join(__dirname, '../controllers/*.js')];

const swaggerSpec = swaggerJsdoc({ definition, apis });

/**
 * @returns {boolean} true si la UI debe requerir auth super_admin (producción).
 */
const requiresAuthForDocs = () => APP_ENV === 'production';

module.exports = {
  swaggerSpec,
  requiresAuthForDocs,
  APP_ENV
};
