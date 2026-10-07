import React from 'react';
import ReactDOM, { hydrateRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const tree = <React.StrictMode><App /></React.StrictMode>;
  if (rootElement.dataset.prerendered === 'true') hydrateRoot(rootElement, tree);
  else ReactDOM.createRoot(rootElement).render(tree);
}
