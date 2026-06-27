/**
 * @fileoverview Regresión OBS-9: detector `inactiveTeachers`.
 *
 * Un profesor que NUNCA ha hecho login (`lastLoginAt` ausente) no debe tratarse
 * como ">90 días inactivo" por el mero hecho de que el campo sea null. Cuando no
 * hay login, la antigüedad se mide desde `createdAt`: una cuenta recién creada
 * tiene 0 días, no 90+. (Detectado en QA 2026-06-27.)
 */

const User = require('../../../../src/models/User');
const inactiveTeachers = require('../../../../src/services/analytics/systemDetectors/inactiveTeachers');
const { createTeacher } = require('../../../helpers/testFixtures');

const DAY = 24 * 60 * 60 * 1000;

describe('inactiveTeachers — antigüedad por createdAt cuando nunca hizo login (OBS-9)', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // Crea un teacher approved y fuerza `createdAt` (y opcionalmente `lastLoginAt`).
  // Se usa el driver crudo (`User.collection`) porque `createdAt` es inmutable
  // bajo la opción `timestamps` de Mongoose: un `updateOne` del modelo lo ignora.
  const teacherCreatedAt = async (createdAt, lastLoginAt = null) => {
    const t = await createTeacher();
    const $set = { createdAt };
    if (lastLoginAt) {
      $set.lastLoginAt = lastLoginAt;
    }
    await User.collection.updateOne({ _id: t._id }, { $set });
    return t;
  };

  it('NO marca a un profesor creado hoy que nunca hizo login', async () => {
    const now = new Date();
    await teacherCreatedAt(now); // recién creado, sin lastLoginAt
    const findings = await inactiveTeachers.run({ now });
    expect(findings).toHaveLength(0);
  });

  it('SÍ marca (warning) a quien nunca entró pero existe desde hace >90 días', async () => {
    const now = new Date();
    await teacherCreatedAt(new Date(now.getTime() - 100 * DAY));
    const findings = await inactiveTeachers.run({ now });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('inactive_teachers');
    expect(findings[0].severity).toBe('warning');
  });

  it('no afecta a un profesor que entró recientemente aunque la cuenta sea antigua', async () => {
    const now = new Date();
    await teacherCreatedAt(new Date(now.getTime() - 200 * DAY), new Date(now.getTime() - 2 * DAY));
    const findings = await inactiveTeachers.run({ now });
    expect(findings).toHaveLength(0);
  });
});
