# Evaluación de Riesgo de Re-identificación en Aulas Pequeñas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Perez
**Fecha:** 08-04-2026
**Clasificacion:** Documento interno — Proteccion de Datos
**Normativa:** Art. 25 RGPD, Guia de Anonimizacion AEPD (2019)

---

## 1. Contexto del riesgo

La plataforma Eduplay procesa datos de rendimiento educativo de menores de 4-8 anos en entornos de aula. Los endpoints de analytics permiten a los profesores visualizar metricas individuales de sus alumnos, lo cual es esencial para la funcion pedagogica.

Sin embargo, en **aulas pequenas** (3-5 alumnos), la combinacion de quasi-identificadores — edad, aula y metricas de rendimiento — puede permitir la re-identificacion de un estudiante incluso cuando se aplica seudonimizacion.

### 1.1 Quasi-identificadores presentes en el sistema

| Quasi-identificador | Fuente | Riesgo |
|---|---|---|
| Edad (`profile.age`) | Modelo User | Combinado con aula, identifica al alumno |
| Aula (`profile.classroom`) | Modelo User | Reduce el grupo de anonimato |
| Patron de rendimiento | StudentMetrics | En grupos pequenos, el patron es unico |
| Horario de juego | GamePlay.completedAt | Puede cruzarse con asistencia presencial |

### 1.2 Escenarios de riesgo

**Escenario A — Aula con 3 alumnos:** Un profesor comparte la pantalla del dashboard. Un padre observa las metricas. Si solo hay 3 alumnos de 5 anos en el aula "1A", el padre puede deducir a que alumno pertenece cada fila de datos, incluso sin ver el nombre.

**Escenario B — Acceso no autorizado al endpoint:** Si un actor obtiene acceso al endpoint de analytics (por robo de token), los datos individuales de un grupo pequeno son trivialmente re-identificables.

---

## 2. Analisis de k-anonimidad

La **k-anonimidad** es una propiedad que garantiza que cada combinacion de quasi-identificadores aparece al menos *k* veces en el conjunto de datos. Si k=5, un individuo no puede distinguirse entre al menos 5 registros.

### 2.1 Aplicacion al sistema

En Eduplay, el "conjunto de datos" es el grupo de estudiantes de un profesor. La granularidad minima es el aula (`profile.classroom`).

| Tamano del grupo | k efectivo | Riesgo |
|---|---|---|
| < 5 alumnos | k < 5 | Alto — datos individuales trivialmente re-identificables |
| 5-10 alumnos | k = 5-10 | Medio — riesgo reducido pero no eliminado |
| > 10 alumnos | k > 10 | Bajo — re-identificacion requiere informacion adicional |

### 2.2 Umbral adoptado: k = 5

Se adopta **k = 5** como umbral minimo, basado en:

1. **Guia de Anonimizacion de la AEPD (2019):** Establece que *"la k-anonimidad requiere que cada combinacion de quasi-identificadores aparezca al menos k veces"* y recomienda *"valores de k de al menos 5 para conjuntos de datos sensibles"*.

2. **Tamano tipico de aulas de educacion infantil:** Las aulas en Espana tienen tipicamente entre 15-25 alumnos. Un subgrupo de 5 o mas es realista tras filtros por edad o aula.

3. **Equilibrio pedagogico:** Un umbral demasiado alto (k=10) impediria el uso de analytics en aulas reales. Un umbral de k=5 protege los grupos mas vulnerables sin bloquear la funcionalidad docente.

---

## 3. Medida tecnica implementada

### 3.1 Constante de configuracion

```javascript
// config/dataRetention.js
MIN_ANALYTICS_GROUP_SIZE: 5
```

### 3.2 Comportamiento del endpoint

**`GET /api/analytics/classroom/students`:**

- Si el grupo tiene **>= 5 estudiantes**: Devuelve datos individuales con seudonimizacion (pseudoId).
- Si el grupo tiene **< 5 estudiantes**: Devuelve solo metricas agregadas:

```json
{
  "aggregatedOnly": true,
  "reason": "Proteccion k-anonimidad: grupo de 3 estudiantes (minimo 5)",
  "total": 3,
  "aggregatedMetrics": {
    "totalGames": 45,
    "averageScore": 72.3,
    "tiers": { ... }
  }
}
```

### 3.3 Justificacion de la respuesta agregada

Cuando `aggregatedOnly: true`, el endpoint:

- **SI devuelve:** Numero total de estudiantes, media de puntuacion, total de partidas, distribucion por tiers.
- **NO devuelve:** Datos individuales por estudiante (nombre, pseudoId, metricas individuales, historial).

Esto garantiza que el profesor conserva una vision general del progreso del grupo sin exponer datos que permitan re-identificacion individual.

---

## 4. Limitaciones conocidas

1. **El profesor ya conoce la identidad de sus alumnos:** La proteccion k-anonimidad no impide que el profesor (que tiene acceso directo a los alumnos) deduzca identidades. Su objetivo es proteger contra terceros que accedan al sistema o contra comparticion involuntaria de pantalla.

2. **Datos temporales no cubiertos:** El horario de juego (`completedAt`) no se anonimiza en la respuesta. Un observador con acceso al aula podria correlacionar horarios de juego con presencia fisica. Mitigacion: los timestamps solo se devuelven en el endpoint de resumen individual (`/student/:id/summary`), que requiere autenticacion.

3. **Agregacion sobre grupo total:** El check se aplica al grupo filtrado (por aula, tier, etc.). Un profesor con 20 alumnos totales pero filtando por aula "1A" con 3 alumnos recibiria respuesta agregada.

---

## 5. Referencias

- Reglamento (UE) 2016/679 (RGPD), Art. 25 — Proteccion de datos desde el diseno y por defecto
- AEPD (2019). *Guia basica de anonimizacion.* Agencia Espanola de Proteccion de Datos
- Sweeney, L. (2002). *k-Anonymity: A Model for Protecting Privacy.* International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems, 10(05), 557-570
- EDPB (2025). *Directrices 01/2025 sobre seudonimizacion.* European Data Protection Board

---

## 6. Decision

**Adoptado:** Implementar umbral k=5 en el endpoint `getClassroomStudents`. Grupos menores reciben solo datos agregados.

**Alternativas descartadas:**
- **Sin umbral:** Inaceptable para datos de menores.
- **k=3:** Insuficiente segun recomendaciones de la AEPD.
- **k=10:** Excesivamente restrictivo para aulas reales espanolas.
