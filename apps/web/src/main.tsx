import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ServicesContext } from './context';
import { isNative } from './platform/notifications';
import { createServices } from './services';
import './styles.css';

// The native shell serves bundled files itself; a service worker there would only add stale-cache risk.
if (!isNative) registerSW({ immediate: true });

const services = await createServices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>
  </StrictMode>,
);
