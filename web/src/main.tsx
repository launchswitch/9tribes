import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

window.onerror = (message, source, lineno, colno, error) => {
  console.error('WINDOW ONERROR:', message, source, lineno, colno, error);
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('UNHANDLED REJECTION:', event.reason);
};

// Prevent right-click context menu globally
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'CANVAS' || target.closest('canvas') || target.closest('.game-shell--v2')) {
    e.preventDefault();
  }
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
