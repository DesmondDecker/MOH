import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registers the app-shell service worker (public/sw.js) so the CHW
// companion app keeps loading with no connectivity — see that file for
// the full reasoning. Guarded by feature detection since not every
// embedded/older browser supports Service Workers, and registration
// happens after `load` so it never competes with the initial render for
// the connection/CPU.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (e.g. served over plain HTTP in local dev,
      // which most browsers block service workers on outside localhost)
      // should never break the app itself — offline app-shell caching
      // just won't be available this session.
    });
  });
}
