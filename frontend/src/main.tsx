import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Identity font system: Instrument Sans (variable) and JetBrains Mono (400, 500)
import '@fontsource-variable/instrument-sans';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
