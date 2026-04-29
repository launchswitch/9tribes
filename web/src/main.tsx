import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

window.testClick = () => console.log('Global click test works!');

window.addEventListener('click', () => console.log('Window clicked!'));

window.onerror = (message, source, lineno, colno, error) => {
  console.error('WINDOW ONERROR:', message, source, lineno, colno, error);
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('UNHANDLED REJECTION:', event.reason);
};

console.log('main.tsx loaded');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
