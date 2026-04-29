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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
