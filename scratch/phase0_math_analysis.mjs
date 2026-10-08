import * as THREE from '../frontend/node_modules/three/build/three.module.js';

async function fetchWorld(adapterName) {
  // Ingest requested adapter
  await fetch(`http://localhost:8080/ingest?adapter=${adapterName}`, { method: 'POST' });
  const rawGraph = await fetch('http://localhost:8080/graph?limit=5000').then(r => r.json());

  // Run layout matching domain/layout.ts
  // Let's import layout from layout.ts or implement the exact waypoint logic
  return rawGraph;
}

// Let's create a node script that uses headless Edge to fetch exact store state or run via browser
