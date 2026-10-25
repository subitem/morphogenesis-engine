import './style.css';
import { mountUI } from './ui';
import { createViewer } from './viewer';

const root = document.querySelector<HTMLElement>('#app')!;
const ui = mountUI(root);
try {
 const viewer = createViewer(ui.viewport, stats => ui.setStats(stats));
 const teardown = () => { viewer.dispose(); ui.dispose(); };
 import.meta.hot?.dispose(teardown);
 ui.onAction(action => {
  switch (action.type) {
   case 'play': viewer.setPlaying(action.value); break;
   case 'settings': viewer.setSettings(action.value); break;
   case 'seed': viewer.regenerate(action.value); break;
   case 'reset': viewer.resetCamera(); break;
   case 'seek': viewer.seek(action.value); break;
   case 'export': viewer.exportFrame(); break;
   case 'import': void viewer.importFrame(action.value); break;
  }
 });
 // BFCache pages must retain their renderer when navigating away and back.
 window.addEventListener('pagehide', event => {
  if (!event.persisted) teardown();
 });
} catch (error) {
 console.error('Die 3D-Ansicht konnte nicht gestartet werden.', error);
 ui.showError('Die 3D-Ansicht benötigt WebGL 2. Bitte aktiviere die Hardwarebeschleunigung oder verwende einen aktuellen Browser.');
}
