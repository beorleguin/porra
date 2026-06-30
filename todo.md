# 📋 Plan de Ruta y Mejoras de la Porra (TO DO)

Aquí se detallan las mejoras prioritarias clasificadas por áreas para elevar la plataforma al nivel de un producto SaaS pulido y profesional.

---

## 🎨 1. Mejoras Visuales (Visual & UX)
- [x] **Efecto Glassmorphism en Modales:** Aplicar `backdrop-filter: blur(8px)` en las capas flotantes (`ParticipantDetails` y `MatchPredictionsModal`) para integrarlos con estética translúcida sobre el fondo de la app.
- [x] **Transición de Temas Suave (Dark/Light):** Añadir una transición CSS global (`transition: background-color 0.3s ease, color 0.3s ease`) en el root para evitar cambios bruscos al alternar el sol/luna.
- [x] **Efecto de Confeti al Resolver el Campeón:** Disparar una animación festiva de confeti utilizando una librería ultra-ligera como `canvas-confetti` en el instante en que el usuario introduzca el resultado real de la Final (`M104`) y se corone al ganador.
- [ ] **Zoom y Arrastre Táctil (Pinch-to-Zoom / Pan) en el Cuadro:** Implementar soporte de arrastre (`draggable`) y gestos en la vista compacta del cuadro para que en dispositivos móviles los usuarios puedan deslizar y hacer zoom de pinza sobre las llaves fácilmente.
- [x] **Indicador de "Partido en Vivo":** Crear un badge con un punto verde intermitente (`pulsing green dot`) junto a los partidos que se estén jugando en tiempo real para captar la atención visual de inmediato.

---

## ⚡ 2. Mejoras Funcionales (Features & Product)
- [ ] **Estadísticas de Pronósticos Colectivos:** Mostrar gráficos o porcentajes de tendencias (ej: *"El 78% de la gente pronostica que ganará ESP"*) en el modal de predicciones para dar insights competitivos interesantes antes del partido.

---

## 🛠️ 3. Mejoras Técnicas (Architecture, Performance & DevEx)
- [ ] **Migración del Estado a Zustand o Jotai:** Actualmente `App.tsx` sufre de *Prop Drilling* (pasa demasiados estados y callbacks de navegación a componentes hijos de 3º y 4º nivel). Mover el estado global de la porra a una tienda Zustand unificará la arquitectura y evitará re-renders innecesarios.
- [ ] **Persistencia Local Robusta con IndexedDB:** Sustituir `localStorage` por `IndexedDB` (usando `localForage`) para salvaguardar borradores de pronósticos pesados de forma asíncrona, previniendo pérdidas de datos si el usuario pierde la conexión temporalmente.
- [ ] **Lazy Loading & Code Splitting:** Implementar `React.lazy()` and `Suspense` para cargar bajo demanda las vistas más pesadas (`TournamentBracket`, `CalendarView` y `PlayerStats`), reduciendo el tamaño del bundle inicial y acelerando el tiempo de carga en redes móviles lentas.
- [ ] **Suite de Tests Automatizados de Puntuación (Vitest):** Crear tests unitarios exhaustivos para el motor de puntos (`src/domain/scoring.ts`) que validen casos extremos (plenos en prórrogas, penaltis, clasificados en empate de standings) asegurando que no haya regresiones al modificar el backend.
- [ ] **Middleware de Tolerancia a Fallos en Netlify:** Añadir un sistema de caché de contingencia (stale-while-revalidate) en las serverless functions. Si la API de OpenFootball o Supabase sufren estrangulamiento de tasa o caída, la web seguirá sirviendo el último estado guardado en SQLite sin dar error.
