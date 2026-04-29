/**
 * @fileoverview Tests unitarios para utils/responseHelper (T-519).
 * Verifica que las funciones de respuesta generan el formato JSON correcto.
 */

const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent
} = require('../src/utils/responseHelper');

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    ended: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    }
  };
  return res;
};

describe('responseHelper', () => {
  describe('sendSuccess', () => {
    it('debe enviar { success: true, data } con status 200', () => {
      const res = createMockRes();
      const data = { id: '1', name: 'test' };

      sendSuccess(res, data);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { id: '1', name: 'test' }
      });
    });

    it('debe incluir message cuando se proporciona', () => {
      const res = createMockRes();

      sendSuccess(res, { id: '1' }, 'Operación completada');

      expect(res.body).toEqual({
        success: true,
        data: { id: '1' },
        message: 'Operación completada'
      });
    });

    it('debe aceptar status personalizado', () => {
      const res = createMockRes();

      sendSuccess(res, null, 'OK', 202);

      expect(res.statusCode).toBe(202);
      expect(res.body.success).toBe(true);
    });

    it('debe enviar data null correctamente', () => {
      const res = createMockRes();

      sendSuccess(res, null, 'Recurso eliminado');

      expect(res.body).toEqual({
        success: true,
        data: null,
        message: 'Recurso eliminado'
      });
    });

    it('no debe incluir message si es undefined', () => {
      const res = createMockRes();

      sendSuccess(res, []);

      expect(res.body).toEqual({
        success: true,
        data: []
      });
      expect(res.body).not.toHaveProperty('message');
    });

    it('no debe incluir message si es string vacío', () => {
      const res = createMockRes();

      sendSuccess(res, { id: '1' }, '');

      expect(res.body).not.toHaveProperty('message');
      expect(res.body).toEqual({
        success: true,
        data: { id: '1' }
      });
    });

    it('debe manejar data con objetos profundamente anidados', () => {
      const res = createMockRes();
      const deepData = {
        level1: {
          level2: {
            level3: {
              level4: { value: 'profundo' }
            }
          }
        }
      };

      sendSuccess(res, deepData);

      expect(res.body.data).toEqual(deepData);
      expect(res.body.data.level1.level2.level3.level4.value).toBe('profundo');
    });

    it('success debe ser booleano true estricto, no solo truthy', () => {
      const res = createMockRes();

      sendSuccess(res, {});

      expect(res.body.success).toBe(true);
      expect(typeof res.body.success).toBe('boolean');
    });
  });

  describe('sendCreated', () => {
    it('debe enviar status 201', () => {
      const res = createMockRes();
      const data = { id: '1', name: 'nuevo' };

      sendCreated(res, data, 'Recurso creado');

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { id: '1', name: 'nuevo' },
        message: 'Recurso creado'
      });
    });

    it('debe funcionar sin message', () => {
      const res = createMockRes();

      sendCreated(res, { id: '2' });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ id: '2' });
      expect(res.body).not.toHaveProperty('message');
    });
  });

  describe('sendPaginated', () => {
    it('debe enviar datos con metadatos de paginación', () => {
      const res = createMockRes();
      const data = [{ id: '1' }, { id: '2' }];

      sendPaginated(res, data, { page: 1, limit: 20, total: 50 });

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([{ id: '1' }, { id: '2' }]);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 50,
        totalPages: 3,
        hasNext: true,
        hasPrev: false
      });
    });

    it('debe calcular hasNext y hasPrev correctamente', () => {
      const res = createMockRes();

      sendPaginated(res, [], { page: 2, limit: 10, total: 25 });

      expect(res.body.pagination.hasNext).toBe(true);
      expect(res.body.pagination.hasPrev).toBe(true);
    });

    it('debe manejar última página', () => {
      const res = createMockRes();

      sendPaginated(res, [], { page: 3, limit: 10, total: 25 });

      expect(res.body.pagination.hasNext).toBe(false);
      expect(res.body.pagination.hasPrev).toBe(true);
      expect(res.body.pagination.totalPages).toBe(3);
    });

    it('debe manejar lista vacía', () => {
      const res = createMockRes();

      sendPaginated(res, [], { page: 1, limit: 20, total: 0 });

      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.pagination.totalPages).toBe(0);
      expect(res.body.pagination.hasNext).toBe(false);
    });

    it('no debe llamar a status explícitamente (status implícito 200)', () => {
      const res = createMockRes();
      const statusSpy = jest.spyOn(res, 'status');

      sendPaginated(res, [{ id: '1' }], { page: 1, limit: 10, total: 5 });

      // sendPaginated llama a res.json() directamente, sin res.status()
      expect(statusSpy).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('debe calcular totalPages=1 y hasNext=false cuando total es igual a limit', () => {
      const res = createMockRes();

      sendPaginated(res, [{ id: '1' }], { page: 1, limit: 10, total: 10 });

      expect(res.body.pagination.totalPages).toBe(1);
      expect(res.body.pagination.hasNext).toBe(false);
      expect(res.body.pagination.hasPrev).toBe(false);
    });

    it('debe manejar números muy grandes correctamente', () => {
      const res = createMockRes();

      sendPaginated(res, [], { page: 1000, limit: 1000, total: 1000000 });

      expect(res.body.pagination.page).toBe(1000);
      expect(res.body.pagination.total).toBe(1000000);
      expect(res.body.pagination.totalPages).toBe(1000);
      expect(res.body.pagination.hasNext).toBe(false);
      expect(res.body.pagination.hasPrev).toBe(true);
    });
  });

  describe('sendNoContent', () => {
    it('debe enviar status 204 sin body', () => {
      const res = createMockRes();

      sendNoContent(res);

      expect(res.statusCode).toBe(204);
      expect(res.ended).toBe(true);
      expect(res.body).toBeNull();
    });

    it('no debe llamar a json, solo a end', () => {
      const res = createMockRes();
      const jsonSpy = jest.spyOn(res, 'json');
      const endSpy = jest.spyOn(res, 'end');

      sendNoContent(res);

      expect(jsonSpy).not.toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledTimes(1);
    });
  });
});
