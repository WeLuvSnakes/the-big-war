import './styles/shell.css';
import { render } from 'solid-js/web';
import { Shell } from './ui/shell/Shell';
import '@the-big-war/frontend/ui/kit.css';
import '@the-big-war/frontend/ui/pixel.css';
import '@the-big-war/frontend/ui/tokens.css';
import { setGameStore } from './game/store/store.service';
import { createWorkerStore } from './game/sim/worker-store';

const host = document.getElementById('app');
if (!host) throw new Error('#app host element is missing from index.html');

const store = createWorkerStore();
setGameStore(store);
if (import.meta.env.DEV) (globalThis as { __sim?: unknown }).__sim = store;

render(() => <Shell />, host);
