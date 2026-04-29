import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

window.testClick = () => console.log('Global click test works!');

window.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  console.log('Window click:', target.tagName, target.className);
  if (target.closest('.faction-click-target')) {
    console.log('Faction chip clicked via delegation!');
    window.openFactionPopup?.();
  }
});

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
