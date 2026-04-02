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
        ...assetUrls('geography-europe', 'spain')
      },
      {
        key: 'france',
        display: 'Francia',
        value: 'Francia',
        audioUrl: null,
        ...assetUrls('geography-europe', 'france')
      },
      {
        key: 'italy',
        display: 'Italia',
        value: 'Italia',
        audioUrl: null,
        ...assetUrls('geography-europe', 'italy')
      },
      {
        key: 'germany',
        display: 'Alemania',
        value: 'Alemania',
        audioUrl: null,
        ...assetUrls('geography-europe', 'germany')
      },
      {
        key: 'portugal',
        display: 'Portugal',
        value: 'Portugal',
        audioUrl: null,
        ...assetUrls('geography-europe', 'portugal')
      },
      {
        key: 'greece',
        display: 'Grecia',
        value: 'Grecia',
        audioUrl: null,
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
        ...assetUrls('animals-farm', 'cow')
      },
      {
        key: 'pig',
        display: 'Cerdo',
        value: 'Cerdo',
        audioUrl: null,
        ...assetUrls('animals-farm', 'pig')
      },
      {
        key: 'chicken',
        display: 'Gallina',
        value: 'Gallina',
        audioUrl: null,
        ...assetUrls('animals-farm', 'chicken')
      },
      {
        key: 'horse',
        display: 'Caballo',
        value: 'Caballo',
        audioUrl: null,
        ...assetUrls('animals-farm', 'horse')
      },
      {
        key: 'duck',
        display: 'Pato',
        value: 'Pato',
        audioUrl: null,
        ...assetUrls('animals-farm', 'duck')
      },
      {
        key: 'cat',
        display: 'Gato',
        value: 'Gato',
        audioUrl: null,
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
        ...assetUrls('colors-basic', 'red')
      },
      {
        key: 'blue',
        display: 'Azul',
        value: 'Azul',
        audioUrl: null,
        ...assetUrls('colors-basic', 'blue')
      },
      {
        key: 'green',
        display: 'Verde',
        value: 'Verde',
        audioUrl: null,
        ...assetUrls('colors-basic', 'green')
      },
      {
        key: 'yellow',
        display: 'Amarillo',
        value: 'Amarillo',
        audioUrl: null,
        ...assetUrls('colors-basic', 'yellow')
      },
      {
        key: 'orange',
        display: 'Naranja',
        value: 'Naranja',
        audioUrl: null,
        ...assetUrls('colors-basic', 'orange')
      },
      {
        key: 'purple',
        display: 'Morado',
        value: 'Morado',
        audioUrl: null,
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
        ...assetUrls('numbers-1-6', 'one')
      },
      {
        key: 'two',
        display: 'Dos',
        value: 'Dos',
        audioUrl: null,
        ...assetUrls('numbers-1-6', 'two')
      },
      {
        key: 'three',
        display: 'Tres',
        value: 'Tres',
        audioUrl: null,
        ...assetUrls('numbers-1-6', 'three')
      },
      {
        key: 'four',
        display: 'Cuatro',
        value: 'Cuatro',
        audioUrl: null,
        ...assetUrls('numbers-1-6', 'four')
      },
      {
        key: 'five',
        display: 'Cinco',
        value: 'Cinco',
        audioUrl: null,
        ...assetUrls('numbers-1-6', 'five')
      },
      {
        key: 'six',
        display: 'Seis',
        value: 'Seis',
        audioUrl: null,
        ...assetUrls('numbers-1-6', 'six')
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
        ...assetUrls('shapes-basic', 'circle')
      },
      {
        key: 'square',
        display: 'Cuadrado',
        value: 'Cuadrado',
        audioUrl: null,
        ...assetUrls('shapes-basic', 'square')
      },
      {
        key: 'triangle',
        display: 'Triángulo',
        value: 'Triángulo',
        audioUrl: null,
        ...assetUrls('shapes-basic', 'triangle')
      },
      {
        key: 'star',
        display: 'Estrella',
        value: 'Estrella',
        audioUrl: null,
        ...assetUrls('shapes-basic', 'star')
      },
      {
        key: 'heart',
        display: 'Corazón',
        value: 'Corazón',
        audioUrl: null,
        ...assetUrls('shapes-basic', 'heart')
      },
      {
        key: 'diamond',
        display: 'Rombo',
        value: 'Rombo',
        audioUrl: null,
        ...assetUrls('shapes-basic', 'diamond')
      }
    ]
  }
];

/**
 * Ejecuta el seeder de contextos.
 * @returns {Promise<Array>} Array de contextos creados
 */
async function seedContexts() {
  try {
    const contexts = await GameContext.create(contextsData);

    const totalAssets = contextsData.reduce((sum, ctx) => sum + ctx.assets.length, 0);

    logger.info('Contextos de juego seeded exitosamente');
    logger.info(`- ${contexts.length} contextos creados`);
    logger.info(`- ${totalAssets} assets totales (todos con imagen en Storage)`);

    return contexts;
  } catch (error) {
    logger.error('Error en seedContexts:', error);
    throw error;
  }
}

module.exports = seedContexts;
