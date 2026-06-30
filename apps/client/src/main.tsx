import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@workspace/ui/globals.css'
import 'streamdown/styles.css'
import { ThemeProvider } from '#components/theme-provider'

import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
