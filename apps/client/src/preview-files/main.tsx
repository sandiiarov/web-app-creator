import 'bippy'
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import { installInspector } from './inspector.ts'

import './style.css'

installInspector()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
