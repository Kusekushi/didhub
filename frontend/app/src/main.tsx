import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { ApiProvider } from './context/ApiContext'
import { SettingsProvider } from './context/SettingsContext'
import { ThemeProvider } from './context/theme'
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ApiProvider>
          <SettingsProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </SettingsProvider>
        </ApiProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
