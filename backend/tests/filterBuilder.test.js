/**
 * @fileoverview Tests unitarios para utils/filterBuilder (T-519).
 * Verifica todos los tipos de mapping y edge cases.
 */

const { buildFilter } = require('../src/utils/filterBuilder');

describe('filterBuilder', () => {
  describe('tipo exact', () => {
    it('debe producir igualdad directa', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' }
      };

      const filter = buildFilter({ role: 'student' }, mappings);

      expect(filter).toEqual({ role: 'student' });
    });

    it('debe aceptar valores booleanos', () => {
      const mappings = {
        isActive: { field: 'isActive', type: 'exact' }
      };

      const filter = buildFilter({ isActive: true }, mappings);

      expect(filter).toEqual({ isActive: true });
    });

    it('debe soportar campos anidados (dot notation)', () => {
      const mappings = {
        classroom: { field: 'profile.classroom', type: 'exact' }
      };

      const filter = buildFilter({ classroom: 'A1' }, mappings);

      expect(filter).toEqual({ 'profile.classroom': 'A1' });
    });

    it('debe aceptar valor 0 (falsy pero válido)', () => {
      const mappings = {
        score: { field: 'score', type: 'exact' }
      };

      const filter = buildFilter({ score: 0 }, mappings);

      expect(filter).toEqual({ score: 0 });
    });

    it('debe aceptar valor false (falsy pero válido)', () => {
      const mappings = {
        enabled: { field: 'enabled', type: 'exact' }
      };

      const filter = buildFilter({ enabled: false }, mappings);

      expect(filter).toEqual({ enabled: false });
    });
  });

  describe('tipo regex', () => {
    it('debe producir $regex con escape automático', () => {
      const mappings = {
        name: { field: 'name', type: 'regex' }
      };

      const filter = buildFilter({ name: 'test' }, mappings);

      expect(filter).toEqual({
        name: { $regex: 'test', $options: 'i' }
      });
    });

    it('debe escapar caracteres especiales de regex', () => {
      const mappings = {
        name: { field: 'name', type: 'regex' }
      };

      const filter = buildFilter({ name: 'test.value+1' }, mappings);

      expect(filter.name.$regex).toBe('test\\.value\\+1');
    });

    it('debe ignorar strings vacíos', () => {
      const mappings = {
        name: { field: 'name', type: 'regex' }
      };

      const filter = buildFilter({ name: '  ' }, mappings);

      expect(filter).toEqual({});
    });

    it('debe aceptar opciones custom de regex', () => {
      const mappings = {
        name: { field: 'name', type: 'regex', options: 'm' }
      };

      const filter = buildFilter({ name: 'test' }, mappings);

      expect(filter.name.$options).toBe('m');
    });
  });

  describe('tipo search', () => {
    it('debe producir $or con múltiples campos', () => {
      const mappings = {
        search: { type: 'search', fields: ['name', 'email'] }
      };

      const filter = buildFilter({ search: 'maria' }, mappings);

      expect(filter.$or).toEqual([
        { name: { $regex: 'maria', $options: 'i' } },
        { email: { $regex: 'maria', $options: 'i' } }
      ]);
    });

    it('debe escapar caracteres especiales en búsqueda', () => {
      const mappings = {
        search: { type: 'search', fields: ['name'] }
      };

      const filter = buildFilter({ search: 'test(1)' }, mappings);

      expect(filter.$or[0].name.$regex).toBe('test\\(1\\)');
    });

    it('debe ignorar búsqueda vacía', () => {
      const mappings = {
        search: { type: 'search', fields: ['name'] }
      };

      const filter = buildFilter({ search: '' }, mappings);

      expect(filter).toEqual({});
    });

    it('debe producir $or con 3 o más campos', () => {
      const mappings = {
        search: { type: 'search', fields: ['name', 'email', 'description'] }
      };

      const filter = buildFilter({ search: 'test' }, mappings);

      expect(filter.$or).toHaveLength(3);
      expect(filter.$or).toEqual([
        { name: { $regex: 'test', $options: 'i' } },
        { email: { $regex: 'test', $options: 'i' } },
        { description: { $regex: 'test', $options: 'i' } }
      ]);
    });
  });

  describe('tipo range', () => {
    it('debe producir $gte y $lte desde params separados', () => {
      const mappings = {
        score: {
          field: 'score',
          type: 'range',
          minParam: 'minScore',
          maxParam: 'maxScore'
        }
      };

      const filter = buildFilter({ score: true, minScore: 50, maxScore: 100 }, mappings);

      expect(filter.score).toEqual({ $gte: 50, $lte: 100 });
    });

    it('debe funcionar solo con min', () => {
      const mappings = {
        score: {
          field: 'score',
          type: 'range',
          minParam: 'minScore',
          maxParam: 'maxScore'
        }
      };

      const filter = buildFilter({ score: true, minScore: 50 }, mappings);

      expect(filter.score).toEqual({ $gte: 50 });
    });

    it('debe aplicar transform si se proporciona', () => {
      const mappings = {
        date: {
          field: 'createdAt',
          type: 'range',
          minParam: 'from',
          maxParam: 'to',
          transform: v => new Date(v)
        }
      };

      const filter = buildFilter({ date: true, from: '2026-01-01' }, mappings);

      expect(filter.createdAt.$gte).toBeInstanceOf(Date);
    });

    it('debe funcionar sin value principal (lee solo minParam/maxParam)', () => {
      const mappings = {
        score: {
          field: 'score',
          type: 'range',
          minParam: 'minScore',
          maxParam: 'maxScore'
        }
      };

      // score no está en queryParams pero minScore sí
      const filter = buildFilter({ minScore: 30 }, mappings);

      expect(filter.score).toEqual({ $gte: 30 });
    });

    it('no debe añadir filtro cuando min y max son vacíos', () => {
      const mappings = {
        score: {
          field: 'score',
          type: 'range',
          minParam: 'minScore',
          maxParam: 'maxScore'
        }
      };

      const filter = buildFilter({ score: true, minScore: '', maxScore: '' }, mappings);

      expect(filter).not.toHaveProperty('score');
      expect(filter).toEqual({});
    });
  });

  describe('tipo in', () => {
    it('debe dividir string por comas', () => {
      const mappings = {
        status: { field: 'status', type: 'in' }
      };

      const filter = buildFilter({ status: 'active,inactive' }, mappings);

      expect(filter.status).toEqual({ $in: ['active', 'inactive'] });
    });

    it('debe aceptar arrays directamente', () => {
      const mappings = {
        ids: { field: '_id', type: 'in' }
      };

      const filter = buildFilter({ ids: ['a', 'b', 'c'] }, mappings);

      expect(filter._id).toEqual({ $in: ['a', 'b', 'c'] });
    });

    it('debe ignorar strings vacíos tras split', () => {
      const mappings = {
        status: { field: 'status', type: 'in' }
      };

      const filter = buildFilter({ status: 'active,,inactive,' }, mappings);

      expect(filter.status).toEqual({ $in: ['active', 'inactive'] });
    });
  });

  describe('tipo computed', () => {
    it('debe invocar la función compute', () => {
      const mappings = {
        requester: {
          type: 'computed',
          compute: (requester, filter) => {
            if (requester.role === 'teacher') {
              filter.role = 'student';
              filter.createdBy = requester._id;
            }
          }
        }
      };

      const requester = { role: 'teacher', _id: 'teacher123' };
      const filter = buildFilter({ requester }, mappings);

      expect(filter).toEqual({
        role: 'student',
        createdBy: 'teacher123'
      });
    });

    it('debe recibir todos los params', () => {
      const receivedParams = {};
      const mappings = {
        custom: {
          type: 'computed',
          compute: (value, filter, allParams) => {
            Object.assign(receivedParams, allParams);
          }
        }
      };

      buildFilter({ custom: 'val', extra: 'data' }, mappings);

      expect(receivedParams).toEqual({ custom: 'val', extra: 'data' });
    });
  });

  describe('opciones generales', () => {
    it('debe incluir baseFilter siempre', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' }
      };

      const filter = buildFilter({ role: 'student' }, mappings, { baseFilter: { isActive: true } });

      expect(filter).toEqual({ isActive: true, role: 'student' });
    });

    it('debe ignorar params undefined', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' },
        status: { field: 'status', type: 'exact' }
      };

      const filter = buildFilter({ role: 'student' }, mappings);

      expect(filter).toEqual({ role: 'student' });
      expect(filter).not.toHaveProperty('status');
    });

    it('debe ignorar params null', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' }
      };

      const filter = buildFilter({ role: null }, mappings);

      expect(filter).toEqual({});
    });

    it('debe ignorar tipos de mapping desconocidos', () => {
      const mappings = {
        field: { field: 'x', type: 'unknown_type' }
      };

      const filter = buildFilter({ field: 'value' }, mappings);

      expect(filter).toEqual({});
    });

    it('debe manejar múltiples mappings combinados', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' },
        status: { field: 'status', type: 'exact' },
        search: { type: 'search', fields: ['name', 'email'] }
      };

      const filter = buildFilter({ role: 'student', status: 'active', search: 'maria' }, mappings);

      expect(filter.role).toBe('student');
      expect(filter.status).toBe('active');
      expect(filter.$or).toHaveLength(2);
    });

    it('debe devolver objeto vacío sin params relevantes', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' }
      };

      const filter = buildFilter({}, mappings);

      expect(filter).toEqual({});
    });

    it('debe ignorar params con string vacío', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' },
        status: { field: 'status', type: 'exact' }
      };

      const filter = buildFilter({ role: 'student', status: '' }, mappings);

      expect(filter).toEqual({ role: 'student' });
      expect(filter).not.toHaveProperty('status');
    });

    it('debe sobrescribir campos de baseFilter si un mapping produce la misma clave', () => {
      const mappings = {
        role: { field: 'role', type: 'exact' }
      };

      const filter = buildFilter({ role: 'teacher' }, mappings, {
        baseFilter: { role: 'student', isActive: true }
      });

      // El mapping sobreescribe el valor de baseFilter para 'role'
      expect(filter.role).toBe('teacher');
      // El campo que no colisiona se mantiene
      expect(filter.isActive).toBe(true);
    });
  });
});
