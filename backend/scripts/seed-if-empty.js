/**
 * @fileoverview Ejecuta los seeders solo si la base de datos esta vacia.
 * Evita sobrescribir datos en reinicios.
 */

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const { runSeeders } = require('../seeders');

require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
  } catch (error) {
    logger.error(`Error conectando a MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const hasAnyData = async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();

  if (collections.length === 0) {
    return false;
  }

  for (const collection of collections) {
    if (collection.name.startsWith('system.')) {
      continue;
    }

    const count = await mongoose.connection.db.collection(collection.name).countDocuments();

    if (count > 0) {
      return true;
    }
  }

  return false;
};

const main = async () => {
  try {
    if (!process.env.MONGO_URI) {
      logger.error('MONGO_URI no configurado. No se pueden ejecutar seeders.');
      process.exit(1);
    }

    await connectDB();

    const hasData = await hasAnyData();

    if (hasData) {
      logger.info('Seeders omitidos: la base de datos ya tiene datos.');
      await mongoose.connection.close();
      process.exit(0);
    }

    logger.info('Base de datos vacia. Ejecutando seeders...');
    await runSeeders();

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error(`Error ejecutando seeders condicionales: ${error.message}`);
    await mongoose.connection.close();
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}
