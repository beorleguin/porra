# 🏆 Mundial Porra 2026

Una aplicación web moderna, dinámica y auto-contenida para gestionar la porra oficial (porra/office pool) del **Mundial 2026**. Cuenta con clasificaciones en tiempo real, protección de datos integrada, un cuadro de eliminatorias inteligente, y un completo panel de administración para copias de seguridad instantáneas y edición de marcadores.

---

## 🚀 Características Principales

### 📊 Clasificación en Tiempo Real (Leaderboard)
- Puntos calculados **al vuelo** en el cliente a partir de los resultados reales guardados en SQLite.
- Clasificación ordenada automáticamente de mayor a menor puntuación.
- Soporte multi-idioma nativo para **Español 🇪🇸** y **Inglés 🇺🇸** con selector en cabecera.

### 💰 Bote de Premios Dinámico (Bote Panel)
- Visualización de la recaudación acumulada total y desglose oficial de premios (1º, 2º y 3º lugar).
- Registro oficial de participantes individuales con estado de pago verificado (**✅ PAGADO**).

### 🌳 Cuadro del Mundial Inteligente (Bracket)
- Visualización interactiva de tablas de grupos completas y el cuadro oficial de eliminatorias (Dieciseisavos, Octavos, Cuartos, Semifinal y Gran Final) adaptado a las reglas del Mundial 2026 (clasifican los mejores terceros).
- Consumo masivo de banderas oficiales en alta calidad mediante **FlagCDN** (evitando las limitaciones de Windows para emojis de banderas).

### 📝 Panel de Participante Seguro (Anti-Tampering)
- **Contraseña Autogestionada:** Al editar predicciones por primera vez, el usuario crea su contraseña. En accesos futuros, el sistema se la solicitará para validar su identidad.
- **Bloqueo Anti-Trampa:** Una vez que el administrador guarda un resultado oficial para un partido, el pronóstico de ese partido **se bloquea automáticamente (desactivado)** en la ficha del participante, impidiendo alteraciones de última hora en encuentros ya jugados.

### ⚙️ Panel de Administración Blindado
- **Acceso Autorizado:** Protegido bajo contraseña maestra (`root`).
- **Selector de Goles por Desplegables:** Introducción de marcadores cómoda y sin errores tipográficos usando doble selectores `[Goles T1] - [Goles T2]` (de 0 a 10).
- **Sistema de Copias de Seguridad de Alta Fidelidad (Snapshots):**
  - **Exportar Copia:** Descarga un archivo JSON de alta resolución con el sello de tiempo exacto (`mundial_porra_backup_YYYY-MM-DD_HH-MM-SS.json`) con el estado de todo el torneo.
  - **Importar Copia:** Restaura cualquier Snapshot JSON subido, sobrescribiendo SQLite con animación de carga de fondo y refresco automático e instantáneo.

---

## 🛠️ Arquitectura Técnica

La aplicación sigue una arquitectura **JAMstack Híbrida local**, utilizando **Vite** para compilar la UI en React y un **Middleware Backend intermedio** en `vite.config.ts` que actúa como servidor API dinámico interactuando con una base de datos física local **SQLite**.

### 📦 Estructura de la Base de Datos SQLite (`porra.db`)
El motor de base de datos relacional SQLite cuenta con la siguiente estructura de tablas:
1. `matches`: Almacena el listado de partidos (id, equipos, grupos, resultados reales).
2. `participants`: Almacena la información de los 38 participantes oficiales, sus contraseñas encriptadas/hasheadas en texto y sus pronósticos globales (Ganador, Goleador, etc.).
3. `predictions`: Tabla relacional intermedia que vincula los pronósticos individuales de cada participante para cada partido.
4. `settings`: Almacena metadatos del sistema (Marcadores oficiales, acumulado del Bote total y cuantía de los premios).
5. `bote`: Almacena la lista oficial de pagos de participantes.

### 🔌 Endpoints de la API Backend (Vite Middleware)
El middleware backend en `vite.config.ts` expone las siguientes rutas REST:
- `GET /api/data`: Devuelve el `AppState` completo compilado atómicamente desde SQLite (partidos, participantes, clasificaciones, bote).
- `POST /api/save-csv`: Guarda los resultados definitivos del torneo y marcadores reales de partidos en SQLite.
- `POST /api/save-predictions`: Registra predicciones y contraseña para un participante específico.
- `POST /api/restore-backup`: Sobrescribe atómicamente las tablas de SQLite a partir de un objeto de copia de seguridad JSON enviado.
- `POST /api/reset-db`: Drops/limpia todas las tablas de SQLite y las vuelve a sembrar utilizando la plantilla maestra.

---

## 💾 La Semilla Inicial: Plantilla JSON de Fábrica

Hemos saneado la arquitectura eliminando cualquier dependencia de archivos CSV a nivel de tiempo de ejecución:
- **La Semilla Oficial:** `webapp/public/porra_template.json` actúa como la plantilla oficial máster e inmutable del torneo de fábrica (censo completo de 38 participantes, partidos oficiales y bote).
- Al inicializar el servidor o resetear las tablas, SQLite lee este archivo de disco y lo carga instantáneamente mediante la función `restoreBackup(state)` unificada, logrando un arranque limpio "out-of-the-box".

---

## 🚀 Instrucciones de Instalación y Lanzamiento

### 1. Requisitos Previos
Asegúrate de tener instalado **Node.js** (versión 18 o superior).

### 2. Instalación de Dependencias
Navega a la carpeta de la webapp e instala los paquetes de npm:
```bash
cd mundial-porra/webapp
npm install
```

### 3. Migración/Creación de la Base de Datos SQLite (Opcional)
Si deseas regenerar o sembrar la base de datos `porra.db` directamente desde los Excel CSV raíz (`Porra mundial RIU 2026 - porra.csv`):
```bash
node migrate.cjs
```
*(Este comando limpiará las tablas, procesará el censo de 38 personas de los spreadsheets raíz y re-escribirá el archivo `porra_template.json` de fábrica).*

### 4. Lanzar el Servidor en Desarrollo
Arranca la aplicación web junto con su motor dinámico SQLite:
```bash
npm run dev
```
Abre tu navegador en: 👉 **[http://localhost:5173/](http://localhost:5173/)**

### 5. Control de Calidad y Linter
La aplicación cumple al 100% con los estándares de estilo más exigentes:
- **TypeScript (Type-Safety Check):**
  ```bash
  npx tsc --noEmit
  ```
- **ESLint (Cleanliness Check):**
  ```bash
  npm run lint
  ```
  *(Ambos comandos devuelven éxito absoluto con 0 warnings y 0 errores).*

---

## 🔒 Modelo de Seguridad y Credenciales por Defecto
- **Contraseña Panel de Administración:** `root`
- **Contraseña de Participantes (Primera vez):** Se autogestiona. Al pulsar "Editar", la contraseña que digite el participante en el cuadro de diálogo se guardará como su contraseña oficial de acceso para futuras ediciones.
