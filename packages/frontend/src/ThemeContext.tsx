import { createContext, useState, useEffect, ReactNode } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

export type ThemeToggleContextType = { mode: PaletteMode; toggle: () => void };

export const ThemeToggleContext = createContext<ThemeToggleContextType>({ mode: 'light', toggle: () => {} });

export default function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(() => (localStorage.getItem('theme') as PaletteMode) || 'light');
  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);
  const toggle = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));
  const theme = createTheme({ palette: { mode } });
  return (
    <ThemeToggleContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeToggleContext.Provider>
  );
}
