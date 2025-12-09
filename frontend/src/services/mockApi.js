/**
 * Mock API Service
 * Simulates backend responses and business logic for the frontend.
 */

// --- Data Models ---

export const MECHANICS = [
  { id: 'mech_1', name: 'Asociación', description: 'Empareja conceptos relacionados.', icon: 'Link' },
  { id: 'mech_2', name: 'Secuencia', description: 'Ordena los pasos correctamente.', icon: 'ListOrdered' },
  { id: 'mech_3', name: 'Clasificación', description: 'Agrupa elementos por categorías.', icon: 'Layers' },
];

export const CONTEXTS = [
  { 
    id: 'ctx_geo', 
    name: 'Geografía', 
    assets: [
      { key: 'spain', value: 'España', display: '🇪🇸' },
      { key: 'france', value: 'Francia', display: '🇫🇷' },
      { key: 'germany', value: 'Alemania', display: '🇩🇪' },
      { key: 'italy', value: 'Italia', display: '🇮🇹' },
      { key: 'portugal', value: 'Portugal', display: '🇵🇹' },
      { key: 'uk', value: 'Reino Unido', display: '🇬🇧' },
    ]
  },
  { 
    id: 'ctx_hist', 
    name: 'Historia', 
    assets: [
      { key: 'rome', value: 'Imperio Romano', display: '🏛️' },
      { key: 'egypt', value: 'Antiguo Egipto', display: '⚱️' },
      { key: 'middle_ages', value: 'Edad Media', display: '🏰' },
    ]
  },
   { 
    id: 'ctx_sci', 
    name: 'Ciencias', 
    assets: [
      { key: 'water', value: 'Agua (H2O)', display: '💧' },
      { key: 'fire', value: 'Fuego', display: '🔥' },
      { key: 'earth', value: 'Tierra', display: '🌍' },
    ]
  },
];

export const RFID_CARDS = Array.from({ length: 20 }, (_, i) => ({
  id: `card_${i + 1}`,
  uid: `UID-${Math.random().toString(16).substr(2, 8).toUpperCase()}`,
  label: `Tarjeta ${i + 1}`
}));

// --- Business Logic ---

/**
 * Calculates difficulty based on number of cards.
 * @param {number} numberOfCards 
 * @returns {'easy' | 'medium' | 'hard'}
 */
export const calculateDifficulty = (numberOfCards) => {
  if (numberOfCards <= 5) return 'easy';
  if (numberOfCards <= 12) return 'medium';
  return 'hard';
};

export const STUDENTS = [
    { id: 's1', name: 'Alex Johnson', avatar: 'A' },
    { id: 's2', name: 'Sarah Williams', avatar: 'S' },
    { id: 's3', name: 'Michael Brown', avatar: 'M' },
    { id: 's4', name: 'Emily Davis', avatar: 'E' },
    { id: 's5', name: 'Daniel Miller', avatar: 'D' },
];

let SESSIONS = [];

// --- API Methods ---

export const api = {
  getStudents: async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return STUDENTS;
  },
  
  getMechanics: async () => {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 300));
    return MECHANICS;
  },

  getContexts: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return CONTEXTS;
  },

  getContextById: async (id) => {
     await new Promise(resolve => setTimeout(resolve, 200));
     return CONTEXTS.find(c => c.id === id);
  },

  getAvailableCards: async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return RFID_CARDS;
  },

  createSession: async (sessionData) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const newSession = { id: `sess_${Date.now()}`, ...sessionData, status: 'created' };
    SESSIONS.push(newSession);
    console.log('Session Created:', newSession);
    return newSession;
  },

  getSessionById: async (id) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return SESSIONS.find(s => s.id === id);
  }
};
