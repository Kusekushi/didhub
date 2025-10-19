import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { ApiProvider } from './context/ApiContext'
import { ThemeProvider } from './context/theme'
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ApiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ApiProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
