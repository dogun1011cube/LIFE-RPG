import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/ui.css';

// StrictMode is intentionally not used: it would double-create the WebGL game in development.
createRoot(document.getElementById('root')!).render(<App />);
