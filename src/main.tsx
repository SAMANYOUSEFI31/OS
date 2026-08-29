import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Register PWA Service Worker for offline resilience (Standard PWA Production Lifecycle)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (import.meta.env.PROD || !window.location.hostname.includes('localhost'))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] ServiceWorker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.warn('[PWA] ServiceWorker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


