# Documento de Requisitos del Sistema

## Plataforma de Juegos Educativos con RFID

**Proyecto:** Trabajo de Fin de Grado (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Versión:** 1.0  
**Fecha:** Diciembre 2025

---

## Índice de Documentos

Este documento está dividido en los siguientes archivos para facilitar su mantenimiento:

1. **Requisitos.md** (este archivo) - Índice y descripción general
2. **RF-Usuarios.md** - Requisitos Funcionales de Gestión de Usuarios
3. **RF-Juegos.md** - Requisitos Funcionales del Sistema de Juegos
4. **RF-RFID.md** - Requisitos Funcionales de Hardware RFID
5. **RF-TiempoReal.md** - Requisitos Funcionales de Comunicación en Tiempo Real
6. **RNF-Seguridad.md** - Requisitos No Funcionales de Seguridad
7. **RNF-Rendimiento.md** - Requisitos No Funcionales de Rendimiento y Escalabilidad
8. **RNF-Calidad.md** - Requisitos No Funcionales de Calidad y Mantenibilidad
9. **RF-Futuros.md** - Requisitos Funcionales para Implementación Futura

---

## 1. Descripción General del Sistema

### 1.1 Propósito

El sistema es una **plataforma de juegos educativos interactivos** que utiliza **tecnología RFID** para permitir a estudiantes de educación infantil (4-6 años) responder desafíos de aprendizaje mediante tarjetas físicas. Los profesores configuran y supervisan las sesiones de juego, mientras que los alumnos interactúan únicamente con el sensor RFID.

### 1.2 Alcance

El sistema abarca:

- **Backend**: API REST con Node.js/Express, WebSocket con Socket.IO, comunicación serial con sensor RFID
- **Frontend**: Aplicación web React para profesores (en desarrollo futuro)
- **Hardware**: Microcontrolador ESP8266 con lector RFID RC522
- **Base de datos**: MongoDB para persistencia de datos
- **Almacenamiento**: Supabase Storage para assets multimedia

### 1.3 Usuarios del Sistema

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **Profesor** | Usuario adulto que gestiona la plataforma, crea sesiones y supervisa alumnos | Aplicación web completa |
| **Alumno** | Niño de 4-6 años que juega partidas asignadas | Solo sensor RFID físico |
| **Sistema** | Procesos automáticos (cleanup, métricas, etc.) | Interno |

### 1.4 Definiciones y Acrónimos

| Término | Definición |
|---------|------------|
| **GameMechanic** | Tipo de juego (Asociación, Secuencia, Memoria) |
| **GameContext** | Tema/contenido del juego (Geografía, Historia, Ciencias) |
| **GameSession** | Configuración de una sala de juego creada por el profesor |
| **GamePlay** | Partida individual de un alumno en una sesión |
| **Card** | Tarjeta RFID física registrada en el sistema |
| **UID** | Identificador único de una tarjeta RFID (8 o 14 caracteres hexadecimales) |
| **Asset** | Recurso multimedia (imagen, audio) asociado a un contexto |
| **JWT** | JSON Web Token para autenticación |

---

## 2. Resumen de Requisitos

### 2.1 Requisitos Funcionales (RF)

| Código | Categoría | Cantidad |
|--------|-----------|----------|
| RF-USR | Gestión de Usuarios | 15 |
| RF-JGO | Sistema de Juegos | 25 |
| RF-RFID | Hardware RFID | 10 |
| RF-RT | Comunicación Tiempo Real | 12 |
| **Total RF** | | **62** |

### 2.2 Requisitos No Funcionales (RNF)

| Código | Categoría | Cantidad |
|--------|-----------|----------|
| RNF-SEG | Seguridad | 18 |
| RNF-REN | Rendimiento y Escalabilidad | 12 |
| RNF-CAL | Calidad y Mantenibilidad | 15 |
| **Total RNF** | | **45** |

### 2.3 Requisitos Futuros (RF-FUT)

| Código | Categoría | Cantidad |
|--------|-----------|----------|
| RF-FUT | Implementación Futura | 20 |

---

## 3. Matriz de Trazabilidad

Los requisitos están vinculados a los siguientes componentes del sistema:

| Componente | Requisitos Relacionados |
|------------|------------------------|
| `User.js` | RF-USR-001 a RF-USR-015 |
| `Card.js` | RF-RFID-001 a RF-RFID-005 |
| `GameMechanic.js` | RF-JGO-001 a RF-JGO-005 |
| `GameContext.js` | RF-JGO-006 a RF-JGO-012 |
| `GameSession.js` | RF-JGO-013 a RF-JGO-020 |
| `GamePlay.js` | RF-JGO-021 a RF-JGO-025 |
| `gameEngine.js` | RF-RT-001 a RF-RT-008 |
| `rfidService.js` | RF-RFID-006 a RF-RFID-010 |
| `auth.js` | RNF-SEG-001 a RNF-SEG-010 |
| `security.js` | RNF-SEG-011 a RNF-SEG-018 |

---

## 4. Estado de Implementación

| Estado | Descripción |
|--------|-------------|
| ✅ Implementado | Requisito completamente implementado y funcional |
| 🔄 En progreso | Requisito parcialmente implementado |
| ⏳ Pendiente | Requisito definido pero no implementado |
| 📋 Futuro | Requisito planificado para versiones futuras |

---

## 5. Historial de Cambios

| Versión | Fecha | Autor | Descripción |
|---------|-------|-------|-------------|
| 1.0 | 04/12/2025 | Samuel Blanchart | Versión inicial del documento |

