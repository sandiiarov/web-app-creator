import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'

import '@workspace/ui/globals.css'
import 'streamdown/styles.css'
import { ThemeProvider } from '#components/theme-provider'

import { EditorPage } from './App.tsx'
import { NewProjectPage, ProjectsPage } from './components/projects-page'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<ProjectsPage />} path="/" />
          <Route element={<NewProjectPage />} path="/projects/new" />
          <Route element={<EditorRoute />} path="/projects/:id" />
          <Route element={<ProjectsPage />} path="*" />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)

function EditorRoute() {
  const { id } = useParams()
  if (!id) return <ProjectsPage />
  // Keyed by id so navigating between projects remounts a fresh editor.
  return <EditorPage key={id} projectId={id} />
}
