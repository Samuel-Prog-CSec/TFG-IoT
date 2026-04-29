/**
 * @fileoverview Tests de integración para operaciones de escritura del patrón Repository (T-520).
 * Verifica updateById, updateOne, deleteById, deleteMany, insertMany y bulkWrite
 * usando MongoDB real (vía test setup).
 */

const User = require('../src/models/User');
const GameMechanic = require('../src/models/GameMechanic');
const userRepository = require('../src/repositories/userRepository');
const gameMechanicRepository = require('../src/repositories/gameMechanicRepository');
const { applyQueryOptions } = require('../src/repositories/baseRepository');

// Seed helpers
const createTeacher = async (suffix = '') =>
  User.create({
    name: `Prof Test${suffix}`,
    email: `prof-repo-test${suffix}@test.com`,
    password: 'Test1234!',
    role: 'teacher',
    accountStatus: 'approved'
  });

const createStudent = async (teacherId, suffix = '') =>
  User.create({
    name: `Alumno Test${suffix}`,
    role: 'student',
    createdBy: teacherId,
    status: 'active',
    consent: {
      granted: true,
      grantedBy: 'Tutor Test',
      grantedAt: new Date(),
      purposes: ['educational_tracking', 'performance_analytics'],
      policyVersion: '1.0'
    },
    studentMetrics: {
      totalGamesPlayed: 5,
      totalScore: 400,
      averageScore: 80,
      bestScore: 95,
      totalCorrectAnswers: 20,
      totalErrors: 5,
      averageResponseTime: 2500
    }
  });

describe('Repository Write Operations', () => {
  let teacher;

  beforeAll(async () => {
    teacher = await createTeacher('-write-ops');
  });

  afterAll(async () => {
    await User.deleteMany({ email: /prof-repo-test/ });
    await User.deleteMany({ name: /Alumno Test-write/ });
    await GameMechanic.deleteMany({ name: /test-repo-write/ });
  });

  describe('updateById', () => {
    it('debe actualizar y retornar el documento actualizado', async () => {
      const student = await createStudent(teacher._id, '-write-update');
      const updated = await userRepository.updateById(student._id, { name: 'Nuevo Nombre' });

      expect(updated).not.toBeNull();
      expect(updated.name).toBe('Nuevo Nombre');
      expect(updated._id.toString()).toBe(student._id.toString());

      await User.findByIdAndDelete(student._id);
    });

    it('debe retornar null si el ID no existe', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const result = await gameMechanicRepository.updateById(fakeId, { displayName: 'X' });

      expect(result).toBeNull();
    });

    it('debe aceptar el operador $set correctamente', async () => {
      const student = await createStudent(teacher._id, '-write-set-op');
      const updated = await userRepository.updateById(student._id, {
        $set: { name: 'Nombre con $set' }
      });

      expect(updated).not.toBeNull();
      expect(updated.name).toBe('Nombre con $set');

      await User.findByIdAndDelete(student._id);
    });

    it('debe aceptar el operador $inc correctamente', async () => {
      const student = await createStudent(teacher._id, '-write-inc-op');
      const originalTotal = student.studentMetrics.totalGamesPlayed;

      const updated = await userRepository.updateById(student._id, {
        $inc: { 'studentMetrics.totalGamesPlayed': 3 }
      });

      expect(updated).not.toBeNull();
      expect(updated.studentMetrics.totalGamesPlayed).toBe(originalTotal + 3);

      await User.findByIdAndDelete(student._id);
    });

    // Alias findByIdAndUpdate eliminado en auditoría de código muerto (DEAD-01)
  });

  describe('updateOne', () => {
    it('debe actualizar por filtro y retornar documento', async () => {
      const mechanic = await GameMechanic.create({
        name: 'test-repo-write-updateone',
        displayName: 'Test Mech',
        description: 'Test'
      });

      const updated = await gameMechanicRepository.updateOne(
        { name: 'test-repo-write-updateone' },
        { displayName: 'Updated Mech' }
      );

      expect(updated).not.toBeNull();
      expect(updated.displayName).toBe('Updated Mech');

      await GameMechanic.findByIdAndDelete(mechanic._id);
    });

    it('debe retornar null cuando el filtro no coincide con nada', async () => {
      const result = await gameMechanicRepository.updateOne(
        { name: 'nombre-inexistente-xyz-999' },
        { displayName: 'No debería actualizarse' }
      );

      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('debe eliminar el documento y retornarlo', async () => {
      const student = await createStudent(teacher._id, '-write-delete');
      const deleted = await userRepository.deleteById(student._id);

      expect(deleted).not.toBeNull();
      expect(deleted._id.toString()).toBe(student._id.toString());

      const found = await User.findById(student._id);
      expect(found).toBeNull();
    });

    it('debe retornar null si no existe', async () => {
      const fakeId = '507f1f77bcf86cd799439012';
      const result = await userRepository.deleteById(fakeId);

      expect(result).toBeNull();
    });
  });

  describe('deleteMany', () => {
    it('debe eliminar múltiples documentos', async () => {
      await GameMechanic.create([
        { name: 'test-repo-write-dm1', displayName: 'DM1', description: 'Test' },
        { name: 'test-repo-write-dm2', displayName: 'DM2', description: 'Test' }
      ]);

      const result = await gameMechanicRepository.deleteMany({
        name: { $in: ['test-repo-write-dm1', 'test-repo-write-dm2'] }
      });

      expect(result.deletedCount).toBe(2);
    });

    it('debe funcionar con filtro que no coincide (elimina 0)', async () => {
      const result = await gameMechanicRepository.deleteMany({
        name: 'filtro-que-no-existe-xyz-000'
      });

      expect(result.deletedCount).toBe(0);
    });
  });

  describe('insertMany', () => {
    it('debe insertar múltiples documentos', async () => {
      const students = await userRepository.insertMany([
        {
          name: 'Alumno Test-write-batch1',
          role: 'student',
          createdBy: teacher._id,
          consent: {
            granted: true,
            grantedBy: 'Tutor Test',
            grantedAt: new Date(),
            purposes: ['educational_tracking', 'performance_analytics'],
            policyVersion: '1.0'
          }
        },
        {
          name: 'Alumno Test-write-batch2',
          role: 'student',
          createdBy: teacher._id,
          consent: {
            granted: true,
            grantedBy: 'Tutor Test',
            grantedAt: new Date(),
            purposes: ['educational_tracking', 'performance_analytics'],
            policyVersion: '1.0'
          }
        }
      ]);

      expect(students).toHaveLength(2);
      expect(students[0].name).toBe('Alumno Test-write-batch1');
      expect(students[1].name).toBe('Alumno Test-write-batch2');

      await User.deleteMany({ name: /Alumno Test-write-batch/ });
    });
  });

  describe('bulkWrite', () => {
    it('debe ejecutar operaciones mixtas', async () => {
      const s1 = await createStudent(teacher._id, '-write-bw1');

      const result = await userRepository.bulkWrite([
        {
          updateOne: {
            filter: { _id: s1._id },
            update: { $set: { name: 'Alumno BW Updated' } }
          }
        }
      ]);

      expect(result.modifiedCount).toBe(1);

      const updated = await User.findById(s1._id);
      expect(updated.name).toBe('Alumno BW Updated');

      await User.findByIdAndDelete(s1._id);
    });
  });
});

describe('applyQueryOptions - soporte de session', () => {
  it('debe pasar la opción session al query', () => {
    const mockSession = { id: 'mock-session-123' };

    // Simulamos un objeto query con los métodos encadenables
    const mockQuery = {
      session: jest.fn().mockReturnThis()
    };

    const result = applyQueryOptions(mockQuery, { session: mockSession });

    expect(mockQuery.session).toHaveBeenCalledTimes(1);
    expect(mockQuery.session).toHaveBeenCalledWith(mockSession);
    expect(result).toBe(mockQuery);
  });

  it('no debe llamar a session si no se pasa en las opciones', () => {
    const mockQuery = {
      session: jest.fn().mockReturnThis()
    };

    applyQueryOptions(mockQuery, {});

    expect(mockQuery.session).not.toHaveBeenCalled();
  });
});
