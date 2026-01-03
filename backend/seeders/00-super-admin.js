/**
 * @fileoverview Seeder del Super Admin inicial.
 * Crea (si no existe) el primer usuario con rol super_admin.
 *
 * @module seeders/00-super-admin
 */

const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const SUPER_ADMIN_EMAIL = 'admin@test.com';

async function seedSuperAdmin() {
  try {
    const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });

    if (existing) {
      // Normalizar rol/estado si venía de versiones antiguas
      if (existing.role !== 'super_admin' || existing.accountStatus !== 'approved') {
        existing.role = 'super_admin';
        existing.accountStatus = 'approved';
        existing.status = 'active';
        await existing.save();
        logger.info('♻️ Super Admin existente normalizado', { email: SUPER_ADMIN_EMAIL });
      } else {
        logger.info('ℹ️ Super Admin ya existe', { email: SUPER_ADMIN_EMAIL });
      }

      return existing;
    }

    const superAdmin = await User.create({
      name: 'Admin Principal',
      email: SUPER_ADMIN_EMAIL,
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      profile: {
        avatar: '👨‍💼',
        birthdate: new Date('1980-01-01')
      },
      status: 'active'
    });

    logger.info('✅ Super Admin seeded exitosamente', { email: SUPER_ADMIN_EMAIL });

    return superAdmin;
  } catch (error) {
    logger.error('❌ Error en seedSuperAdmin:', error);
    throw error;
  }
}

module.exports = seedSuperAdmin;
