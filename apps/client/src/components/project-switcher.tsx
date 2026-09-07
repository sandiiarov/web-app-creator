import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { type ProjectMeta, listProjects } from '../lib/projects-api'
import { ProjectPreview } from './project-preview'

/** Project navigation stays in the assistant while the current page remains visible. */
export function ProjectSwitcher({
  currentProjectId,
}: {
  currentProjectId: string
}) {
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [query, setQuery] = useState('')
  const [alphabetical, setAlphabetical] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void listProjects()
      .then((items) => {
        if (active) setProjects(items)
      })
      .catch(() => {
        if (active) setError('Could not load projects.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attempt])

  const visible = useMemo(
    () =>
      projects
        .filter((project) =>
          `${project.title} ${project.brief ?? ''}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
        .toSorted((a, b) =>
          alphabetical
            ? a.title.localeCompare(b.title)
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [alphabetical, projects, query],
  )

  return (
    <section aria-label="Project switcher" className="project-switcher">
      <div className="project-switcher-heading">
        <h2>
          <label htmlFor="switch-project-search">Switch project</label>
        </h2>
        <Button
          aria-label={
            alphabetical
              ? 'Name A–Z. Switch to recent edits'
              : 'Recent edits. Switch to name A–Z'
          }
          onClick={() => setAlphabetical((value) => !value)}
          size="xs"
          variant="ghost"
        >
          {alphabetical ? 'Name A–Z' : 'Recent edits'}
        </Button>
      </div>
      <Input
        aria-label="Search projects by name or brief"
        autoFocus
        id="switch-project-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search projects…"
        type="search"
        value={query}
      />
      <div aria-busy={loading} className="project-switcher-list">
        {loading ? (
          <p role="status">Opening projects…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <Button
              onClick={() => setAttempt((value) => value + 1)}
              size="xs"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        ) : visible.length ? (
          visible.map((project) => (
            <Link
              aria-current={
                project.id === currentProjectId ? 'page' : undefined
              }
              className="project-switcher-row"
              key={project.id}
              to={`/projects/${project.id}`}
            >
              <ProjectPreview project={project} />
              <span>
                <strong title={project.title || 'Untitled'}>
                  {project.title || 'Untitled'}
                </strong>
                <small title={project.brief || undefined}>
                  {project.status === 'running'
                    ? 'Building…'
                    : project.id === currentProjectId
                      ? 'Current project'
                      : project.brief || 'Open your page'}
                </small>
              </span>
            </Link>
          ))
        ) : (
          <p role="status">
            {query
              ? 'No matching projects. Try another name.'
              : 'Your new projects will appear here.'}
          </p>
        )}
      </div>
      <div className="project-switcher-footer">
        <Button asChild className="justify-start" size="sm" variant="outline">
          <Link to="/projects/new">
            <Plus />
            New project
          </Link>
        </Button>
        <Button asChild size="xs" variant="ghost">
          <Link to="/">
            Open library
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </section>
  )
}
