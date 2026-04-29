/**
 * @fileoverview Test de verificación de consentimiento en gameplay.
 * Verifica que un estudiante sin consentimiento activo no puede jugar (ADR-031).
 */

const mongoose = require('mongoose');
const User = require('../src/models/User');
const GamePlay = require('../src/models/GamePlay');
const { validatePlayer } = require('../src/services/gamePlayService');

describe('Consent check en gameplay (ADR-031 — defense in depth)', () => {
  let studentWithConsent, studentWithoutConsent;
  const fakeSessionId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    await User.deleteMany({});
    await GamePlay.deleteMany({});

    const teacherId = new mongoose.Types.ObjectId();

    studentWithConsent = await User.create({
      name: 'Alumno Con Consentimiento',
      role: 'student',
      status: 'active',
      createdBy: teacherId,
      profile: { age: 6 },
      consent: {
        granted: true,
        grantedBy: 'Tutor Test',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });

    // Crear con consentimiento y luego revocar via update directo
    // (el pre-save hook impide crear sin consent.granted=true)
    studentWithoutConsent = await User.create({
      name: 'Alumno Sin Consentimiento',
      role: 'student',
      status: 'active',
      createdBy: teacherId,
      profile: { age: 7 },
      consent: {
        granted: true,
        grantedBy: 'Tutor Revocado',
        grantedAt: new Date(Date.now() - 86400000),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });
    // Revocar directamente en BD (simula revocacion)
    await User.updateOne(
      { _id: studentWithoutConsent._id },
      { $set: { 'consent.granted': false, 'consent.withdrawnAt': new Date(), status: 'inactive' } }
    );
    studentWithoutConsent = await User.findById(studentWithoutConsent._id);
  });

  it('permite jugar a un estudiante con consentimiento activo', async () => {
    const player = await validatePlayer(studentWithConsent._id, fakeSessionId);
    expect(player).toBeTruthy();
    expect(player._id.toString()).toBe(studentWithConsent._id.toString());
  });

  it('rechaza jugar a un estudiante con consentimiento revocado', async () => {
    await expect(validatePlayer(studentWithoutConsent._id, fakeSessionId)).rejects.toThrow(
      /consentimiento parental activo/i
    );
  });

  it('rechaza jugar a un estudiante sin campo consent (edge case)', async () => {
    // Crear con consent y luego eliminar el campo via update directo
    const studentNoConsent = await User.create({
      name: 'Alumno Edge Case',
      role: 'student',
      status: 'active',
      createdBy: new mongoose.Types.ObjectId(),
      profile: { age: 5 },
      consent: {
        granted: true,
        grantedBy: 'Tutor Temporal',
        grantedAt: new Date(),
        purposes: ['educational_tracking'],
        policyVersion: '1.0'
      }
    });
    // Eliminar consent.granted directamente (simula dato corrupto/legacy)
    await User.updateOne({ _id: studentNoConsent._id }, { $unset: { 'consent.granted': '' } });

    await expect(validatePlayer(studentNoConsent._id, fakeSessionId)).rejects.toThrow(
      /consentimiento parental activo/i
    );
  });
});
