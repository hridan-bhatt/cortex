# CORTEX — Codebase Intelligence & Reasoning Engine

Cortex is a domain-agnostic codebase intelligence and architecture reasoning engine. It pairs a high-performance 3D visual instrument with recursive forward-chaining deduction, real-time WebSocket failure cascade simulation, and line-level provenance tracking.

---

## Quick Start

### 1. Production / Demo Mode (Single-JAR)

Package and launch the entire application — frontend and backend — from a single self-contained artifact:

```powershell
# Build single-JAR artifact
.\scripts\package.ps1

# Run standalone application
java -jar cortex-backend\target\cortex.jar
```

Then open your browser to:
```
http://localhost:8080/
```

- Served as a same-origin SPA with real-time reasoning WebSocket streaming at `ws://localhost:8080/ws/reasoning`.
- Includes full 3D visual instrument, cinematic descent, blast radius analysis, cycles detection, and interactive cascade simulations.

---

### 2. Development Mode

Run the frontend and backend concurrently with Hot Module Replacement (HMR):

#### Terminal 1 — Backend (Spring Boot API & WebSocket)
```powershell
cd cortex-backend
.\mvnw.cmd spring-boot:run
```
*API serves on `http://localhost:8080`*

#### Terminal 2 — Frontend (Vite Dev Server)
```powershell
cd frontend
npm run dev
```
*Frontend dev UI serves on `http://localhost:3000` (automatically proxies requests to `:8080`)*

---

## Features

- **Cinematic Descent**: Narrative onboarding descent through system strata into the graph canvas.
- **Visual Instrument**: 3D graph visualizer with strata layout, focus bloom, and fly-to transitions.
- **The Guided Tour**: Press `T` or click the Play button in the top bar to run an automated, 90-second tour of the platform driving real actions on real graph data.
- **Cascade Simulation & Scrubber**: Real-time recursive failure cascades with seekable timeline scrubber over completed simulations.
- **Inference Catalog & Provenance**: Inspect deduction rules (`R`) and traverse line-level evidence chains for every inferred fact.
