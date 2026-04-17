/**
 * @fileoverview Seeder de contextos de juego.
 * Crea contextos tematicos educativos adaptados para ninos de 4-6 anos.
 *
 * Cada contexto tiene 6 assets con imagenes reales en Supabase Storage.
 *
 * @module seeders/04-contexts
 */

const GameContext = require('../src/models/GameContext');
const logger = require('../src/utils/logger');

// Base URL de Supabase Storage
const STORAGE_BASE =
  'https://mlqpohbynkvelrphxqcp.supabase.co/storage/v1/object/public/game-assets';

/**
 * Genera las URLs de Storage para un asset con imagen.
 * @param {string} contextId - El contextId del contexto
 * @param {string} key - La key del asset
 * @returns {{ imageUrl: string, thumbnailUrl: string }}
 */
const assetUrls = (contextId, key) => ({
  imageUrl: `${STORAGE_BASE}/ctx-${contextId}/image/${key}.webp`,
  thumbnailUrl: `${STORAGE_BASE}/ctx-${contextId}/thumbnail/${key}_thumb.webp`
});

const contextsData = [
  {
    contextId: 'geography-europe',
    name: 'Países de Europa',
    isActive: true,
    assets: [
      {
        key: 'spain',
        display: 'España',
        value: 'España',
        audioUrl: null,
        dominantColor: '#c60b1e',
        ...assetUrls('geography-europe', 'spain')
      },
      {
        key: 'france',
        display: 'Francia',
        value: 'Francia',
        audioUrl: null,
        dominantColor: '#002395',
        ...assetUrls('geography-europe', 'france')
      },
      {
        key: 'italy',
        display: 'Italia',
        value: 'Italia',
        audioUrl: null,
        dominantColor: '#008c45',
        ...assetUrls('geography-europe', 'italy')
      },
      {
        key: 'germany',
        display: 'Alemania',
        value: 'Alemania',
        audioUrl: null,
        dominantColor: '#000000',
        ...assetUrls('geography-europe', 'germany')
      },
      {
        key: 'portugal',
        display: 'Portugal',
        value: 'Portugal',
        audioUrl: null,
        dominantColor: '#006600',
        ...assetUrls('geography-europe', 'portugal')
      },
      {
        key: 'greece',
        display: 'Grecia',
        value: 'Grecia',
        audioUrl: null,
        dominantColor: '#0d5eaf',
        ...assetUrls('geography-europe', 'greece')
      }
    ]
  },
  {
    contextId: 'animals-farm',
    name: 'Animales de Granja',
    isActive: true,
    assets: [
      {
        key: 'cow',
        display: 'Vaca',
        value: 'Vaca',
        audioUrl: null,
        dominantColor: '#8b6914',
        ...assetUrls('animals-farm', 'cow')
      },
      {
        key: 'pig',
        display: 'Cerdo',
        value: 'Cerdo',
        audioUrl: null,
        dominantColor: '#f4a7bb',
        ...assetUrls('animals-farm', 'pig')
      },
      {
        key: 'chicken',
        display: 'Gallina',
        value: 'Gallina',
        audioUrl: null,
        dominantColor: '#e8a317',
        ...assetUrls('animals-farm', 'chicken')
      },
      {
        key: 'horse',
        display: 'Caballo',
        value: 'Caballo',
        audioUrl: null,
        dominantColor: '#6b3a2a',
        ...assetUrls('animals-farm', 'horse')
      },
      {
        key: 'duck',
        display: 'Pato',
        value: 'Pato',
        audioUrl: null,
        dominantColor: '#f5c71a',
        ...assetUrls('animals-farm', 'duck')
      },
      {
        key: 'cat',
        display: 'Gato',
        value: 'Gato',
        audioUrl: null,
        dominantColor: '#d4883a',
        ...assetUrls('animals-farm', 'cat')
      }
    ]
  },
  {
    contextId: 'colors-basic',
    name: 'Colores Básicos',
    isActive: true,
    assets: [
      {
        key: 'red',
        display: 'Rojo',
        value: 'Rojo',
        audioUrl: null,
        dominantColor: '#e53935',
        ...assetUrls('colors-basic', 'red')
      },
      {
        key: 'blue',
        display: 'Azul',
        value: 'Azul',
        audioUrl: null,
        dominantColor: '#1e88e5',
        ...assetUrls('colors-basic', 'blue')
      },
      {
        key: 'green',
        display: 'Verde',
        value: 'Verde',
        audioUrl: null,
        dominantColor: '#43a047',
        ...assetUrls('colors-basic', 'green')
      },
      {
        key: 'yellow',
        display: 'Amarillo',
        value: 'Amarillo',
        audioUrl: null,
        dominantColor: '#fdd835',
        ...assetUrls('colors-basic', 'yellow')
      },
      {
        key: 'orange',
        display: 'Naranja',
        value: 'Naranja',
        audioUrl: null,
        dominantColor: '#fb8c00',
        ...assetUrls('colors-basic', 'orange')
      },
      {
        key: 'purple',
        display: 'Morado',
        value: 'Morado',
        audioUrl: null,
        dominantColor: '#8e24aa',
        ...assetUrls('colors-basic', 'purple')
      }
    ]
  },
  {
    contextId: 'numbers-1-6',
    name: 'Números del 1 al 6',
    isActive: true,
    assets: [
      {
        key: 'one',
        display: 'Uno',
        value: 'Uno',
        audioUrl: null,
        dominantColor: '#5c6bc0',
        ...assetUrls('numbers-1-15', 'one')
      },
      {
        key: 'two',
        display: 'Dos',
        value: 'Dos',
        audioUrl: null,
        dominantColor: '#26a69a',
        ...assetUrls('numbers-1-15', 'two')
      },
      {
        key: 'three',
        display: 'Tres',
        value: 'Tres',
        audioUrl: null,
        dominantColor: '#ef5350',
        ...assetUrls('numbers-1-15', 'three')
      },
      {
        key: 'four',
        display: 'Cuatro',
        value: 'Cuatro',
        audioUrl: null,
        dominantColor: '#66bb6a',
        ...assetUrls('numbers-1-15', 'four')
      },
      {
        key: 'five',
        display: 'Cinco',
        value: 'Cinco',
        audioUrl: null,
        dominantColor: '#ffa726',
        ...assetUrls('numbers-1-15', 'five')
      },
      {
        key: 'six',
        display: 'Seis',
        value: 'Seis',
        audioUrl: null,
        dominantColor: '#ab47bc',
        ...assetUrls('numbers-1-15', 'six')
      }
    ]
  },
  {
    contextId: 'shapes-basic',
    name: 'Formas Básicas',
    isActive: true,
    assets: [
      {
        key: 'circle',
        display: 'Círculo',
        value: 'Círculo',
        audioUrl: null,
        dominantColor: '#42a5f5',
        ...assetUrls('shapes-basic', 'circle')
      },
      {
        key: 'square',
        display: 'Cuadrado',
        value: 'Cuadrado',
        audioUrl: null,
        dominantColor: '#66bb6a',
        ...assetUrls('shapes-basic', 'square')
      },
      {
        key: 'triangle',
        display: 'Triángulo',
        value: 'Triángulo',
        audioUrl: null,
        dominantColor: '#ffa726',
        ...assetUrls('shapes-basic', 'triangle')
      },
      {
        key: 'star',
        display: 'Estrella',
        value: 'Estrella',
        audioUrl: null,
        dominantColor: '#ffee58',
        ...assetUrls('shapes-basic', 'star')
      },
      {
        key: 'heart',
        display: 'Corazón',
        value: 'Corazón',
        audioUrl: null,
        dominantColor: '#ef5350',
        ...assetUrls('shapes-basic', 'heart')
      },
      {
        key: 'diamond',
        display: 'Rombo',
        value: 'Rombo',
        audioUrl: null,
        dominantColor: '#ab47bc',
        ...assetUrls('shapes-basic', 'diamond')
      }
    ]
  }
];

/**
 * Ejecuta el seeder de contextos.
 *
 * Los assets seedeados quedan SIEMPRE con `uploadedBy = null`. Esto refleja la
 * decision de producto (ADR-053): los assets seed son "del sistema" — base del
 * producto, no propiedad de un usuario. No pueden eliminarse individualmente
 * desde la UI; solo se eliminan al borrar el contexto entero (accion exclusiva
 * del super_admin desde /admin/contexts).
 *
 * @returns {Promise<Array>} Array de contextos creados
 */
async function seedContexts() {
  try {
    // Asegurar uploadedBy=null en cada asset (defensivo: el default del schema ya es null)
    const dataWithOwnership = contextsData.map(ctx => ({
      ...ctx,
      assets: ctx.assets.map(asset => ({
        ...asset,
        uploadedBy: null
      }))
    }));

    const contexts = await GameContext.create(dataWithOwnership);

    const totalAssets = dataWithOwnership.reduce((sum, ctx) => sum + ctx.assets.length, 0);

    logger.info('Contextos de juego seeded exitosamente');
    logger.info(`- ${contexts.length} contextos creados`);
    logger.info(
      `- ${totalAssets} assets totales del sistema (uploadedBy=null, no eliminables individualmente)`
    );

    return contexts;
  } catch (error) {
    logger.error('Error en seedContexts:', error);
    throw error;
  }
}

module.exports = seedContexts;
