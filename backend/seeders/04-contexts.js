/**
 * @fileoverview Seeder de contextos de juego.
 * Crea contextos temáticos educativos adaptados para niños de 4-6 años.
 * @module seeders/04-contexts
 */

const GameContext = require('../src/models/GameContext');
const logger = require('../src/utils/logger');

const contextsData = [
  {
    contextId: 'geography-europe',
    name: 'Paises de Europa',
    isActive: true,
    assets: [
      {
        key: 'spain',
        display: 'Espana',
        value: 'Espana',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/spain.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/spain.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/spain.webp'
      },
      {
        key: 'france',
        display: 'Francia',
        value: 'Francia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/france.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/france.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/france.webp'
      },
      {
        key: 'italy',
        display: 'Italia',
        value: 'Italia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/italy.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/italy.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/italy.webp'
      },
      {
        key: 'germany',
        display: 'Alemania',
        value: 'Alemania',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/germany.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/germany.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/germany.webp'
      },
      {
        key: 'portugal',
        display: 'Portugal',
        value: 'Portugal',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/portugal.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/portugal.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/portugal.webp'
      },
      {
        key: 'greece',
        display: 'Grecia',
        value: 'Grecia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/greece.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/greece.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/greece.webp'
      },
      {
        key: 'netherlands',
        display: 'Paises Bajos',
        value: 'Paises Bajos',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/netherlands.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/netherlands.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/netherlands.webp'
      },
      {
        key: 'belgium',
        display: 'Belgica',
        value: 'Belgica',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/belgium.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/belgium.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/belgium.webp'
      },
      {
        key: 'sweden',
        display: 'Suecia',
        value: 'Suecia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/sweden.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/sweden.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/sweden.webp'
      },
      {
        key: 'norway',
        display: 'Noruega',
        value: 'Noruega',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/norway.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/norway.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/norway.webp'
      },
      {
        key: 'denmark',
        display: 'Dinamarca',
        value: 'Dinamarca',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/denmark.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/denmark.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/denmark.webp'
      },
      {
        key: 'poland',
        display: 'Polonia',
        value: 'Polonia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/poland.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/poland.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/poland.webp'
      },
      {
        key: 'austria',
        display: 'Austria',
        value: 'Austria',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/austria.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/austria.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/austria.webp'
      },
      {
        key: 'ireland',
        display: 'Irlanda',
        value: 'Irlanda',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/ireland.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/ireland.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/ireland.webp'
      },
      {
        key: 'finland',
        display: 'Finlandia',
        value: 'Finlandia',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/finland.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/finland.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/geography-europe/thumbs/finland.webp'
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
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/cow.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/cow.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/cow.webp'
      },
      {
        key: 'pig',
        display: 'Cerdo',
        value: 'Cerdo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/pig.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/pig.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/pig.webp'
      },
      {
        key: 'chicken',
        display: 'Gallina',
        value: 'Gallina',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/chicken.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/chicken.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/chicken.webp'
      },
      {
        key: 'sheep',
        display: 'Oveja',
        value: 'Oveja',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/sheep.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/sheep.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/sheep.webp'
      },
      {
        key: 'horse',
        display: 'Caballo',
        value: 'Caballo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/horse.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/horse.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/horse.webp'
      },
      {
        key: 'duck',
        display: 'Pato',
        value: 'Pato',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/duck.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/duck.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/duck.webp'
      },
      {
        key: 'goat',
        display: 'Cabra',
        value: 'Cabra',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/goat.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/goat.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/goat.webp'
      },
      {
        key: 'rabbit',
        display: 'Conejo',
        value: 'Conejo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/rabbit.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/rabbit.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/rabbit.webp'
      },
      {
        key: 'dog',
        display: 'Perro',
        value: 'Perro',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/dog.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/dog.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/dog.webp'
      },
      {
        key: 'cat',
        display: 'Gato',
        value: 'Gato',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/cat.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/cat.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/cat.webp'
      },
      {
        key: 'turkey',
        display: 'Pavo',
        value: 'Pavo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/turkey.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/turkey.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/turkey.webp'
      },
      {
        key: 'donkey',
        display: 'Burro',
        value: 'Burro',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/donkey.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/donkey.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/donkey.webp'
      },
      {
        key: 'goose',
        display: 'Ganso',
        value: 'Ganso',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/goose.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/goose.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/goose.webp'
      },
      {
        key: 'bee',
        display: 'Abeja',
        value: 'Abeja',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/bee.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/bee.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/bee.webp'
      },
      {
        key: 'lamb',
        display: 'Cordero',
        value: 'Cordero',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/lamb.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/lamb.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/lamb.webp'
      },
      {
        key: 'rooster',
        display: 'Gallo',
        value: 'Gallo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/rooster.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/rooster.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/animals-farm/thumbs/rooster.webp'
      }
    ]
  },
  {
    contextId: 'colors-basic',
    name: 'Colores Basicos',
    isActive: true,
    assets: [
      {
        key: 'red',
        display: 'Rojo',
        value: 'Rojo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/red.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/red.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/red.webp'
      },
      {
        key: 'blue',
        display: 'Azul',
        value: 'Azul',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/blue.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/blue.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/blue.webp'
      },
      {
        key: 'green',
        display: 'Verde',
        value: 'Verde',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/green.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/green.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/green.webp'
      },
      {
        key: 'yellow',
        display: 'Amarillo',
        value: 'Amarillo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/yellow.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/yellow.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/yellow.webp'
      },
      {
        key: 'orange',
        display: 'Naranja',
        value: 'Naranja',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/orange.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/orange.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/orange.webp'
      },
      {
        key: 'purple',
        display: 'Morado',
        value: 'Morado',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/purple.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/purple.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/purple.webp'
      },
      {
        key: 'pink',
        display: 'Rosa',
        value: 'Rosa',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/pink.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/pink.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/pink.webp'
      },
      {
        key: 'brown',
        display: 'Marron',
        value: 'Marron',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/brown.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/brown.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/brown.webp'
      },
      {
        key: 'black',
        display: 'Negro',
        value: 'Negro',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/black.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/black.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/black.webp'
      },
      {
        key: 'white',
        display: 'Blanco',
        value: 'Blanco',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/white.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/white.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/white.webp'
      },
      {
        key: 'gray',
        display: 'Gris',
        value: 'Gris',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/gray.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/gray.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/gray.webp'
      },
      {
        key: 'light_blue',
        display: 'Celeste',
        value: 'Celeste',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/light_blue.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/light_blue.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/light_blue.webp'
      },
      {
        key: 'violet',
        display: 'Violeta',
        value: 'Violeta',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/violet.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/violet.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/violet.webp'
      },
      {
        key: 'lilac',
        display: 'Lila',
        value: 'Lila',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/lilac.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/lilac.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/lilac.webp'
      },
      {
        key: 'turquoise',
        display: 'Turquesa',
        value: 'Turquesa',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/turquoise.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/turquoise.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/colors-basic/thumbs/turquoise.webp'
      }
    ]
  },
  {
    contextId: 'numbers-1-15',
    name: 'Numeros del 1 al 15',
    isActive: true,
    assets: [
      {
        key: 'one',
        display: 'Uno',
        value: 'Uno',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/one.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/one.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/one.webp'
      },
      {
        key: 'two',
        display: 'Dos',
        value: 'Dos',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/two.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/two.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/two.webp'
      },
      {
        key: 'three',
        display: 'Tres',
        value: 'Tres',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/three.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/three.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/three.webp'
      },
      {
        key: 'four',
        display: 'Cuatro',
        value: 'Cuatro',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/four.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/four.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/four.webp'
      },
      {
        key: 'five',
        display: 'Cinco',
        value: 'Cinco',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/five.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/five.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/five.webp'
      },
      {
        key: 'six',
        display: 'Seis',
        value: 'Seis',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/six.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/six.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/six.webp'
      },
      {
        key: 'seven',
        display: 'Siete',
        value: 'Siete',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/seven.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/seven.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/seven.webp'
      },
      {
        key: 'eight',
        display: 'Ocho',
        value: 'Ocho',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/eight.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/eight.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/eight.webp'
      },
      {
        key: 'nine',
        display: 'Nueve',
        value: 'Nueve',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/nine.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/nine.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/nine.webp'
      },
      {
        key: 'ten',
        display: 'Diez',
        value: 'Diez',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/ten.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/ten.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/ten.webp'
      },
      {
        key: 'eleven',
        display: 'Once',
        value: 'Once',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/eleven.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/eleven.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/eleven.webp'
      },
      {
        key: 'twelve',
        display: 'Doce',
        value: 'Doce',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/twelve.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/twelve.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/twelve.webp'
      },
      {
        key: 'thirteen',
        display: 'Trece',
        value: 'Trece',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thirteen.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thirteen.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/thirteen.webp'
      },
      {
        key: 'fourteen',
        display: 'Catorce',
        value: 'Catorce',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/fourteen.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/fourteen.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/fourteen.webp'
      },
      {
        key: 'fifteen',
        display: 'Quince',
        value: 'Quince',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/fifteen.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/fifteen.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/numbers-1-15/thumbs/fifteen.webp'
      }
    ]
  },
  {
    contextId: 'shapes-basic',
    name: 'Formas Basicas',
    isActive: true,
    assets: [
      {
        key: 'circle',
        display: 'Circulo',
        value: 'Circulo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/circle.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/circle.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/circle.webp'
      },
      {
        key: 'square',
        display: 'Cuadrado',
        value: 'Cuadrado',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/square.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/square.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/square.webp'
      },
      {
        key: 'triangle',
        display: 'Triangulo',
        value: 'Triangulo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/triangle.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/triangle.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/triangle.webp'
      },
      {
        key: 'rectangle',
        display: 'Rectangulo',
        value: 'Rectangulo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/rectangle.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/rectangle.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/rectangle.webp'
      },
      {
        key: 'diamond',
        display: 'Rombo',
        value: 'Rombo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/diamond.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/diamond.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/diamond.webp'
      },
      {
        key: 'star',
        display: 'Estrella',
        value: 'Estrella',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/star.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/star.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/star.webp'
      },
      {
        key: 'oval',
        display: 'Ovalo',
        value: 'Ovalo',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/oval.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/oval.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/oval.webp'
      },
      {
        key: 'pentagon',
        display: 'Pentagono',
        value: 'Pentagono',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/pentagon.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/pentagon.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/pentagon.webp'
      },
      {
        key: 'hexagon',
        display: 'Hexagono',
        value: 'Hexagono',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/hexagon.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/hexagon.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/hexagon.webp'
      },
      {
        key: 'octagon',
        display: 'Octagono',
        value: 'Octagono',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/octagon.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/octagon.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/octagon.webp'
      },
      {
        key: 'heart',
        display: 'Corazon',
        value: 'Corazon',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/heart.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/heart.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/heart.webp'
      },
      {
        key: 'cross',
        display: 'Cruz',
        value: 'Cruz',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/cross.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/cross.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/cross.webp'
      },
      {
        key: 'arrow',
        display: 'Flecha',
        value: 'Flecha',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/arrow.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/arrow.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/arrow.webp'
      },
      {
        key: 'moon',
        display: 'Luna',
        value: 'Luna',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/moon.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/moon.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/moon.webp'
      },
      {
        key: 'cloud',
        display: 'Nube',
        value: 'Nube',
        audioUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/cloud.mp3',
        imageUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/cloud.webp',
        thumbnailUrl:
          'https://supabase.example.com/storage/v1/object/public/contexts/shapes-basic/thumbs/cloud.webp'
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
    const contexts = await GameContext.insertMany(contextsData);

    // Contar assets totales
    const totalAssets = contextsData.reduce((sum, ctx) => sum + ctx.assets.length, 0);

    logger.info('Contextos de juego seeded exitosamente');
    logger.info(`- ${contexts.length} contextos creados`);
    logger.info(`- ${totalAssets} assets totales`);

    return contexts;
  } catch (error) {
    logger.error('Error en seedContexts:', error);
    throw error;
  }
}

module.exports = seedContexts;
