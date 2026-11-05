import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { startTheme } from './ui/shell/theme'
import { useStore } from './state/store'
import './styles/index.css'

useStore.getState().setTheme(startTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
