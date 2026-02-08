# 1. Principios de la Visualización

## 1.1. Conceptos y Tipos

Una visualización de datos es una <mark style="background: #ADCCFFA6;">representación visual deseada con el propósito de transmitir el significado de los datos y las percepciones que se han podido obtener del proceso de análisis realizado</mark>. El diseño depende del **público objetivo**. Se agrupan en tres bloques:

- **Data Storytelling (Narración):** Para _Decision Makers_. Diseñar visualizaciones <mark style="background: #ADCCFFA6;">para un público menos técnico</mark> en cuanto al proceso de análisis, pero que son los <mark style="background: #FFB86CA6;">responsables de la toma de decisiones en el negocio</mark>, ofrecer la información de manera <mark style="background: #FFB8EBA6;">clara y entendible</mark>. Formato: Imágenes estáticas o dashboards interactivos simples.
- **Data Showcasing (Exhibición):** Para _Analistas_. Visualizaciones abiertas para <mark style="background: #ADCCFFA6;">explorar datos y sacar conclusiones propias</mark>. Formato: Dashboards dinámicos e interactivos.
- **Data Art (Arte):** Para _Público General_. Busca <mark style="background: #ADCCFFA6;">entretener o provocar</mark>, para <mark style="background: #FFB86CA6;">atraer fuertemente la atención de la audiencia</mark>. <mark style="background: #FFB8EBA6;">Poca narrativa analítica</mark>, pero datos precisos.

### 1.1.1. Pasos para un diseño funcional

1. <mark style="background: #FFB8EBA6;">Conocer al público</mark> objetivo (necesidades, rol, conocimientos).
2. Definir el <mark style="background: #FFB8EBA6;">propósito</mark> (¿informar, explorar, persuadir?).
3. Elegir la <mark style="background: #FFB8EBA6;">visualización adecuada</mark> (en base al público objetivo y al propósito).

## 1.2. Semántica de la visualización

El objetivo de toda visualización es <mark style="background: #ADCCFFA6;">encontrar una forma adecuada de expresar la información que permita entender y percibir en forma efectiva un conjunto de datos y las posibles relaciones</mark> entre ellos.

`Semántica de la visualización == cómo se debe representar la información para darle el contexto y el sentido que la audiencia espera obtener`

- **Tablas (Cuadrículas numéricas):** Cuando la audiencia necesita conocer los **números precisos**.
- **Gráficos:** Cuando el objetivo es explorar **relaciones o tendencias**. Es <mark style="background: #FFB86CA6;">más fácil ver un punto de equilibrio ("`break-even point`") en un gráfico que en una tabla</mark>.
- **Colores y Formas:** <mark style="background: #FFB8EBA6;">Funcionan como números visuales</mark>.
  - _Ejemplo:_ En un mapa, el color indica el valor independientemente de la ubicación.
  - _Gráficos dirigidos:_ <mark style="background: #FFB8EBA6;">Uso de flechas en mapas</mark> para <mark style="background: #8000E1A6;">indicar dirección</mark> (envíos) y <mark style="background: #8000E1A6;">grosor para volumen</mark> (tonelaje).

---

# 2. Diseños Visuales

## 2.1. Consideraciones de diseño

- Si la **audiencia es técnica/analítica** $\rightarrow$ _Diseño simple y claro_ (`Data Storytelling/Showcasing`). Las visualizaciones para el análisis de datos a audiencia con perfiles técnicos están <mark style="background: #ADCCFFA6;">destinadas a comunicar de forma clara y directa</mark>.
- Si la **audiencia es general/persuasión** $\rightarrow$ _Diseño emocional_ (`Data Art`). <mark style="background: #ADCCFFA6;">Crear diseños que provoquen una respuesta emocional</mark> al público objetivo

### 2.1.1. Cómo añadir contexto (4 formas)

Añadir contexto a los elementos gráficos <mark style="background: #ADCCFFA6;">ayuda a la audiencia a comprender el valor y el significado de la información que se está visualizando</mark>. Si se ha optado por elegir un paradigma de diseño <mark style="background: #FFB8EBA6;">data art, no es adecuado agregar contexto ya que se perdería el objetivo que se pretende conseguir</mark>.

1. **Mediante datos:** Añadir <mark style="background: #FFB86CA6;">métricas relevantes de apoyo</mark> (ej. tasa de abandono).
2. **Mediante anotaciones:** <mark style="background: #FFB86CA6;">Encabezados y descripciones</mark> breves.
3. **Mediante elementos gráficos:** Líneas de tendencia, puntos de referencia, <mark style="background: #FFB86CA6;">iconos</mark>.
4. **Mediante títulos y subtítulos:** La forma más sencilla de <mark style="background: #FFB86CA6;">orientar al lector</mark>.

## 2.2. Selección del gráfico adecuado

Probablemente habrá que representar muchas facetas diferentes de la información, por lo que <mark style="background: #FFB86CA6;">será necesario usar diferentes tipos de gráficos dentro de la misma visualización</mark>. Se clasifican en cuatro grupos según su complejidad y objetivo:

### A) Gráficos Estándar (Audiencia no puramente analítica)

- **Área:** <mark style="background: #FFB8EBA6;">Comparar valores y ver volumen acumulado</mark>.
- **Barras:** Comparar valores <mark style="background: #FFB8EBA6;">de una misma categoría</mark>.
- **Líneas:** <mark style="background: #FFB8EBA6;">Cambios en el tiempo o relaciones</mark> entre parámetros. Muy versátiles.
- **Circular (Pie chart):** <mark style="background: #FFB8EBA6;">Comparar partes de un todo</mark>. **Advertencia:** <mark style="background: #FF5582A6;">Evitar si la audiencia es experta/analítica</mark> (_demasiada simplicidad_).

### B) Gráficos Comparativos (Audiencia con cierta capacidad analítica)

Muestran el valor relativo de múltiples parámetros en una categoría, o la relación entre parámetros dentro de múltiples categorías compartidas. La principal diferencia con los _gráficos estándar_ es que los _comparativos_ <mark style="background: #ADCCFFA6;">ofrecen una forma de comparar simultáneamente más de un parámetro y categoría</mark>, a diferencia de los _estándares_ en los que <mark style="background: #FFB86CA6;">solo se puede apreciar la diferencia entre un parámetro de cualquier categoría</mark>.

- **Burbujas (Bubble):** Variante de dispersión donde el <mark style="background: #FFB8EBA6;">tamaño del círculo es una tercera dimensión</mark>. <mark style="background: #8000E1A6;">Útil para ver "huecos"</mark> o _outliers_.
- **Mapas de árbol (Tree maps):** <mark style="background: #FFB8EBA6;">Rectángulos anidados</mark>. El tamaño del área indica el valor relativo respecto al total.
- **Círculos rellenos (Packed circle):** Similar al Tree map pero <mark style="background: #8000E1A6;">con círculos agrupados</mark>.
- **Columnas apiladas:** <mark style="background: #FFB8EBA6;">Comparar múltiples atributos en una misma categoría</mark>. _Consejo:_ <mark style="background: #8000E1A6;">No incluir demasiados atributos</mark> para no saturar.

### C) Gráficos Estadísticos (Audiencia experta)

- **Histograma:** Distribución de <mark style="background: #FFB8EBA6;">frecuencia de una variable</mark> (_barras_).
- **Dispersión (Scatter plot):** Relación (_x, y_) <mark style="background: #FFB8EBA6;">para ver patrones, tendencias y valores atípicos</mark>.
- **Matriz de dispersión:** Serie de diagramas <mark style="background: #FFB8EBA6;">para ver correlaciones entre múltiples variables</mark>.

### D) Mapas (Datos espaciales)

- **Choropleth:** <mark style="background: #FFB8EBA6;">Áreas coloreadas/sombreadas</mark> según una variable (ej. Renta por estado).
- **Mapas de puntos:** <mark style="background: #FFB8EBA6;">Puntos en ubicaciones específicas</mark>. Pueden variar en <mark style="background: #8000E1A6;">tamaño/color.</mark>
- **Raster surface:** Datos sobre <mark style="background: #FFB8EBA6;">imágenes reales</mark> (satélite, fotografías).

## 2.3. Buenas prácticas de diseño

- **Consistencia > Elegancia:** Usar plantillas estándar (mismos fondos, ubicación de títulos) para que el usuario se centre en el análisis, no en aprender a usar el dashboard.
- **Diseños simples:** No temer a los espacios en blanco. Evitar el desorden ("clutter").
- **Localización:** Datos importantes arriba a la izquierda. Flujo de lectura: izquierda a derecha, arriba a abajo.
- **Uso del color:**
  - Limitar número de colores y paletas (máx 2 paletas).
  - Usar contraste, no tonos similares.
  - Usar convenciones semánticas (Verde = bueno, Rojo = malo/pérdidas).
  - Diseñar pensando en múltiples plataformas (móvil, tablet, PC).
- **Filtros y Slicers:** Aplicar a todas las visualizaciones a la vez. Usar barras deslizantes para rangos numéricos.
- **Leyendas:** Solo si son necesarias. Si se usan, que sean visibles en todas partes.
- **Limitar visualizaciones:** Máximo **4 o 5 gráficos** por dashboard.
- **Resaltar Outliers:** Usar colores o iconos para marcar la excepción.
- **Etiquetas:** Mejor horizontales que verticales.
- **Evitar barras de desplazamiento (scroll):** Si hay muchos datos, mejor paginar o usar otra pantalla.

## 2.4. Errores de diseño comunes

1. **Orden incorrecto:** Mostrar <mark style="background: #ADCCFFA6;">dimensiones no relacionadas jerárquicamente en un orden que insinúa una relación</mark> o tendencia falsa (ej. mezclar tiendas y semanas aleatoriamente en el eje X).
2. **Distorsión de área:** <mark style="background: #ADCCFFA6;">Usar iconos que al aumentar de altura también aumentan de anchura</mark>, cuadruplicando el área visual cuando <mark style="background: #FFB8EBA6;">el dato solo se ha duplicado</mark> (ej. el gráfico de las manzanas).

---

# 3. Tipos de Gráficos según el Análisis (Guía de uso)

| **Tipo de Análisis** | **Objetivo**                              | **Gráficos Recomendados**                                                                                                                                  | **Consejos**                                                                      |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Comparativo**      | _Clasificar y comparar magnitudes_.       | **Barras** (Simples o Apiladas).<br><br>Barras **Horizontales**: Para cualquier nº de elementos.<br><br>Barras **Verticales**: Solo si hay < 12 elementos. | Usar un único color si es simple.                                                 |
| **Tendencias**       | Ver _evolución temporal_.                 | **Líneas** y **Áreas**.                                                                                                                                    | Tiempo en el eje X. Usar distintos tipos de líneas/colores para segmentos.        |
| **Contribución**     | _Ver la parte respecto al todo_ (`%`).    | **Tree Map** (muchos valores).<br><br>**Circular** (pocos valores).                                                                                        | Circular solo si hay < 10 elementos. Tree map usa degradados para enfatizar peso. |
| **Correlación**      | Identificar _relaciones entre variables_. | **Dispersión** (Scatter).                                                                                                                                  | Combinar con líneas/barras. Validar que la correlación implica causalidad.        |
| **Geográfico**       | _Datos por ubicación_.                    | **Mapas**.                                                                                                                                                 | Emparejar con gráficos adicionales (líneas/tablas) para dar detalle.              |
| **Distribución**     | _Ver el rango, promedio y dispersión_.    | **Box Plots** (Caja) e **Histogramas**.                                                                                                                    | Box Plot muestra cuartiles (Q1, Q2, Q3) y outliners.                              |

---

# 4. Herramientas de diseño de Dashboards

El equipo de BI debe diseñar un prototipo previo (boceto basado en las especificaciones del negocio y siguiendo los estándares de interfaz de usuario y de política corporativa) antes de construir nada. Se usan 4 técnicas, de menor a mayor detalle:

1. **Sketch (Boceto):** Dibujo rápido (papel/pizarra). Para _brainstorming_ y discutir ideas iniciales. Muy bajo coste de descarte.
2. **Wireframe:** Estructura visual ("esqueleto"). Muestra ubicación de gráficos, filtros y menús, pero sin diseño gráfico ni funcionalidad. Blanco y negro/grises.
3. **Storyboard:** Define la **acción** y el flujo. Muestra cómo el usuario interactúa paso a paso con la aplicación para realizar un análisis (secuencia de pantallas).
4. **Mock-up (Maqueta):** Representación visual **estática** del diseño final. Incluye colores, iconos, tipografía real. Parece la app final pero no funciona. _Nota:_ Muchas herramientas BI modernas saltan este paso y crean directamente un prototipo funcional.
