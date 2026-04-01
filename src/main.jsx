import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { webElectronShim } from './utils/web-electron-shim.js';

// Set shim for web version
if (!window.electron) {
  window.electron = webElectronShim;
}

// Local fonts bundling
import "@fontsource/syne/400.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
