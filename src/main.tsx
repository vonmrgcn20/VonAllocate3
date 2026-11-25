import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { mountFirebaseBridge } from './firebase.ts';

mountFirebaseBridge();
createRoot(document.getElementById('root')!).render(<App />);
