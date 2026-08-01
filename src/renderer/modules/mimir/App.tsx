import { useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useStore } from "./store/useStore";

export default function App() {
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const isLightMode = theme === "light";
    document.documentElement.classList.toggle("light", isLightMode);
    
    // Sync the window frame color via IPC
    if (window.devhub?.app?.setTheme) {
      window.devhub.app.setTheme(isLightMode);
    }
    
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      const target = e.target as HTMLElement;
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (!commandPaletteOpen && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        e.preventDefault();
        setCommandPaletteOpen(true, e.key);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [commandPaletteOpen, setCommandPaletteOpen, theme]);

  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
