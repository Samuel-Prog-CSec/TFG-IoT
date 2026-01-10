/**
 * Script para eliminar la base de datos (Drop Database).
 * Útil para reiniciar el entorno de desarrollo completamente.
 *
 * Uso: node scripts/drop-db.js
 */

const mongoose = require('mongoose');
const readline = require('readline');
const { connectDB } = require('../src/config/database');
require('dotenv').config();

// Bloqueo de seguridad para producción
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: Este script no puede ejecutarse en entorno de producción.');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const dropDatabase = async () => {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await connectDB();
    console.log(`✅ Conectado a: ${mongoose.connection.name}`);

    console.log('\n⚠️  ¡PELIGRO! Vas a eliminar TODA la base de datos. ⚠️');
    console.log('Esta acción es irreversible y borrará todos los datos.');

    rl.question('¿Estás seguro que deseas continuar? (S/N): ', async answer => {
      if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'si') {
        console.log('\n🗑️  Eliminando base de datos...');
        await mongoose.connection.dropDatabase();
        console.log('✅ Base de datos eliminada correctamente.');
      } else {
        console.log('\n❌ Operación cancelada por el usuario.');
      }

      await mongoose.connection.close();
      rl.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    rl.close();
    process.exit(1);
  }
};

dropDatabase();
