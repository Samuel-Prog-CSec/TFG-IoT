# 1. ⚔️ El debate técnico: ¿SVG o PNG?
La respuesta corta es: **Depende de para qué.**
![Imagen de vector vs raster graphics comparison](https://encrypted-tbn1.gstatic.com/licensed-image?q=tbn:ANd9GcQ4teVrd1WCtLYbP4i-i3i5Ug0JgRR5Mn0sXLRw25UFOvWPbm96-3-JIfnO_Nq8nTiKIxSPnMA4KoxUIAkKJLfB2iufypeC93v0hffWJfW_YYiJXDM)

## **Usa SVG (Vectores) cuando...**
- **Elementos de UI:** Iconos de botones (Play, Pausa, Home), logos, flechas.
- **Ilustraciones planas:** Banderas, símbolos matemáticos (números, signos), formas geométricas.
- **Por qué:**
    1. **Escalabilidad infinita:** Se ven nítidos en un móvil y en una pantalla 4K. Nunca se pixelan.
    2. **Tamaño minúsculo:** Un SVG de una bandera pesa 1KB. Un PNG de la misma bandera en alta calidad pesa 50KB+.
    3. **Manipulable por código:** En React, puedes cambiar el color de un SVG con CSS (`fill: blue`). Con un PNG no puedes.

## **Usa PNG / WebP (Mapas de bits) cuando...**
- **Fotografías:** Si tu contexto es "Animales" y quieres fotos reales de leones.
- **Ilustraciones complejas:** Dibujos con muchas sombras, texturas o efectos de pintura.
- **Por qué:** Los SVG se vuelven matemáticamente muy pesados si intentas representar una fotografía realista.
- **Consejo Pro:** Evita PNG si puedes. Usa **WebP**. Es un formato moderno que reduce el peso un 30-50% respecto al PNG manteniendo la misma calidad y transparencia.

---

# 2. 💎 Dónde conseguir los mejores assets (Gratis y Legales)
Para un TFG, es vital usar recursos con licencias libres (Creative Commons o Royalty Free).

## A. Para la Interfaz (UI) e Iconos (SVG)
Estos son para tus botones de "Jugar", "Atrás", "Configuración".
1. **Lucide React (Mi recomendada):**
    - Son los que usa _Shadcn/ui_. Son SVGs limpios, modernos y muy ligeros.
    - [https://lucide.dev/](https://lucide.dev/)
2. **React Icons:**
    - Una librería que agrupa FontAwesome, Material Design, etc.
    - [https://react-icons.github.io/react-icons/](https://react-icons.github.io/react-icons/)

## B. Para los Contextos de Juego (Ilustraciones/Vectores)
Aquí es donde sacas el contenido para "Países", "Matemáticas", etc.
1. **Flagpedia (Para el contexto Banderas):**
    - Tienen una API y descargas de todas las banderas del mundo en SVG optimizado. Es perfecto para tu mecánica de asociación.
    - [https://flagpedia.net/download/api](https://flagpedia.net/download/api)
2. **OpenMoji (Para contextos generales):**
    - Emojis de código abierto. Tienen versiones SVG de _todo_: animales, comida, objetos, vehículos. Tienen un estilo visual consistente y amigable para niños.
    - [https://openmoji.org/](https://openmoji.org/)
3. **Undraw / Storyset (Para pantallas de carga/éxito):**
    - Ilustraciones de escenas completas (ej. "Niño ganando", "Server error"). Puedes cambiar el color principal en la web antes de descargar el SVG para que coincida con tu tema.
    - [https://undraw.co/illustrations](https://undraw.co/illustrations)
    - [https://storyset.com/](https://www.google.com/search?q=https://storyset.com/)

## C. Para Fotos Realistas (PNG/JPG)
Si decides usar fotos reales.
1. **Unsplash:** Fotos artísticas de altísima calidad.
2. **Pexels:** Similar, muy buena calidad.
    - _Nota:_ Si descargas de aquí, **nunca** subas la foto original de 5000px a tu Supabase. Redúcela antes (ej. a 800px de ancho) y conviértela a WebP para que cargue rápido.

---

# 3. 🚀 Estrategia de Implementación en React
Para mantener esa velocidad "increíble" que buscas:
**1. Para Iconos de UI (SVG Inline):** Importalos como componentes React.
```JavaScript
import { Play, Pause } from 'lucide-react';

// Se renderiza como un <svg> dentro del HTML. Carga instantánea.
<Play color="green" size={48} />
```

**2. Para Assets del Juego (Imágenes Externas):** Como vendrán de Supabase, usa el tag `<img>` estándar, pero aprovecha el atributo `loading`.
```JavaScript
<img 
  src={asset.imageUrl} 
  alt={asset.value} 
  loading="lazy" // O "eager" si es la imagen principal del desafío actual
  className="w-full h-auto object-cover rounded-xl"
/>
```

**3. Pre-carga (Prefetching) para Velocidad Extrema:** Si sabes que la siguiente ronda es una foto de un "León", puedes decirle al navegador que la vaya descargando mientras el niño piensa la respuesta anterior.
```JavaScript
// Cuando recibes el evento 'new_round' o un poco antes
const img = new Image();
img.src = "url_del_siguiente_asset_en_supabase";
```

Esto hace que cuando aparezca la imagen en pantalla, ya esté en la caché del navegador y se muestre en 0ms.

---

# Resumen para tu TFG:
- **Iconos de la App:** Usa **Lucide React** (SVG).
- **Banderas:** Usa **Flagpedia** (SVG).
- **Objetos/Animales:** Usa **OpenMoji** (SVG) si quieres estilo "cartoon" (recomendado para niños) o fotos optimizadas a **WebP** si quieres realismo.