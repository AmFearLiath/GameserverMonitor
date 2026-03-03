import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './theme/index.css';
import './i18n/index.js';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
