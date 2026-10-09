import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './perf/harness';

// Identity font system: Space Grotesk (400, 500, 600, 700) and JetBrains Mono (400, 500)
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
