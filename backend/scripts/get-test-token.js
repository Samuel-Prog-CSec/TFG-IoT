/**
 * @fileoverview Script para obtener tokens JWT para testing.
 * Genera tokens válidos para un usuario de prueba.
 *
 * Uso:
 *   node scripts/get-test-token.js                    # Usa maria@test.com
 *   node scripts/get-test-token.js carlos@test.com   # Usuario específico
 *
 * @module scripts/get-test-token
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../src/models/User');
const { generateTokenPair } = require('../src/middlewares/auth');

// Mock request para generar fingerprint consistente
const mockRequest = {
  headers: {
    'user-agent': 'TestClient/1.0',
    'accept-language': 'es-ES',
    'accept-encoding': 'gzip, deflate'
  }
};

async function getTestToken() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Conectado a MongoDB\n');

    // Obtener email del argumento o usar default
    const email = process.argv[2] || 'maria@test.com';

    // Buscar usuario
    const user = await User.findOne({ email, status: 'active' });

    if (!user) {
      console.error(`❌ Usuario no encontrado: ${email}`);
      console.log('\nUsuarios disponibles:');
      const users = await User.find({ role: 'teacher', status: 'active' }).select('email name');
      users.forEach(u => console.log(`   - ${u.email} (${u.name})`));
      process.exit(1);
    }

    // Generar tokens
    const tokens = generateTokenPair(user, mockRequest);

    console.log('🔑 Tokens generados para:', user.email);
    console.log('   Nombre:', user.name);
    console.log('   Role:', user.role);
    console.log('');
    console.log('━'.repeat(80));
    console.log('ACCESS TOKEN (expira en 15 min):');
    console.log('━'.repeat(80));
    console.log(tokens.accessToken);
    console.log('');
    console.log('━'.repeat(80));
    console.log('REFRESH TOKEN (expira en 30 días):');
    console.log('━'.repeat(80));
    console.log(tokens.refreshToken);
    console.log('');
    console.log('━'.repeat(80));
    console.log('HEADER para curl/Postman:');
    console.log('━'.repeat(80));
    console.log(`Authorization: Bearer ${tokens.accessToken}`);
    console.log('');
    console.log('━'.repeat(80));
    console.log('Ejemplo curl:');
    console.log('━'.repeat(80));
    console.log(`curl -H "Authorization: Bearer ${tokens.accessToken}" \\`);
    console.log(`     -H "User-Agent: TestClient/1.0" \\`);
    console.log(`     -H "Accept-Language: es-ES" \\`);
    console.log(`     -H "Accept-Encoding: gzip, deflate" \\`);
    console.log('     http://localhost:5000/api/auth/me');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

getTestToken();
