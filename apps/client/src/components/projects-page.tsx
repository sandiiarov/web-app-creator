import {
  ProjectListSnapshotSchema,
  ProtocolErrorSchema,
} from '@workspace/contracts'
import { DEFAULT_LANDING_MODELS, StatusPill } from '@workspace/prompt-panel'
import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@workspace/ui/components/input-group'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@workspace/ui/components/toggle-group'
import {
  ArrowRight,
  ArrowDownWideNarrow,
  CircleAlert,
  FolderOpen,
  LayoutGrid,
  List,
  ChevronDown,
  Ellipsis,
  FileCode2,
  LoaderCircle,
  Moon,
  PanelsTopLeft,
  Plus,
  Search,
  Sun,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { deleteDraft } from '../lib/project-drafts'
import {
  type ProjectMeta,
  type RunStatus,
  createProject,
  deleteProject,
  listProjects,
  projectListEventsUrl,
} from '../lib/projects-api'
import { subscribeWithRecovery } from '../lib/reconnecting-stream'
import { runStatusToPanelStatus } from '../lib/run-status'
import { ProjectPreview } from './project-preview'
import { RenameProjectDialog } from './rename-project-dialog'
import { useTheme } from './theme-provider'

type ProjectFilter = 'all' | 'attention' | 'running'
type ProjectSort = 'created' | 'name' | 'updated'
type ProjectView = 'gallery' | 'list'
const FILTER_LABELS: Record<ProjectFilter, string> = {
  all: 'All projects',
  attention: 'Needs attention',
  running: 'In progress',
}
const SORT_LABELS: Record<ProjectSort, string> = {
  created: 'Newest created',
  name: 'Name A–Z',
  updated: 'Recently edited',
}

/** Creates a draft project on mount and redirects to its editor route. */
export function NewProjectPage() {
  const [creationKey] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState(0)
  const creation = useRef<null | ReturnType<typeof createProject>>(null)
  const [createdId, setCreatedId] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    creation.current ??= createProject({
      creationKey,
      textModel: DEFAULT_LANDING_MODELS.text,
    })
    void creation.current
      .then((project) => {
        if (!cancelled) setCreatedId(project.id)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to create project',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [creationKey, attempt])

  if (error) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
        <div>
          <p className="text-sm text-destructive-foreground">{error}</p>
          <Button
            className="mt-4 mr-2"
            onClick={() => {
              creation.current = null
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
          <Button
            className="mt-4"
            onClick={() => navigate('/')}
            type="button"
            variant="outline"
          >
            Back to projects
          </Button>
        </div>
      </main>
    )
  }

  if (!createdId) {
    return (
      <main className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
        Creating project…
      </main>
    )
  }

  return <Navigate replace to={`/projects/${createdId}`} />
}

export function ProjectsPage() {
  const { setTheme } = useTheme()
  const [query, setQuery] = useState(() => readLibraryState().query)
  const [filter, setFilter] = useState<ProjectFilter>(
    () => readLibraryState().filter,
  )
  const [sort, setSort] = useState<ProjectSort>(() => readLibraryState().sort)
  const [view, setView] = useState<ProjectView>(() => readLibraryState().view)
  const [renaming, setRenaming] = useState<null | ProjectMeta>(null)
  const [deleting, setDeleting] = useState<null | string>(null)
  const restoredScroll = useRef(false)
  useEffect(() => {
    try {
      sessionStorage.setItem(
        'landing.library.v1',
        JSON.stringify({ ...readLibraryState(), filter, query, sort, view }),
      )
    } catch {
      /* Storage is optional for library preferences. */
    }
  }, [query, filter, sort, view])
  const [actionError, setActionError] = useState<null | string>(null)
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [statusById, setStatusById] = useState<Record<string, RunStatus>>({})
  const [error, setError] = useState<null | string>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const refreshSequence = useRef(0)

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError(null)
    try {
      const list = await listProjects()
      if (sequence !== refreshSequence.current) return
      setProjects(list)
      setStatusById((prev) => {
        const next = { ...prev }
        for (const project of list) {
          next[project.id] = project.status ?? 'idle'
        }
        return next
      })
    } catch (err) {
      if (sequence !== refreshSequence.current) return
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      if (sequence === refreshSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The v2 list stream sends a complete authoritative snapshot on every
  // hydration and committed invalidation, including the empty list.
  useEffect(() => {
    const controller = new AbortController()
    void subscribeWithRecovery(projectListEventsUrl(), {
      onEvent: ({ data, event }) => {
        if (event === 'protocol_error') {
          setError(ProtocolErrorSchema.parse(data).message)
          setLoading(false)
          return
        }
        if (event !== 'list_state') return
        const snapshot = ProjectListSnapshotSchema.parse(data)
        refreshSequence.current += 1
        setProjects(snapshot.projects as ProjectMeta[])
        setStatusById(
          Object.fromEntries(
            snapshot.projects.map((project) => [
              project.id,
              project.status ?? 'idle',
            ]),
          ),
        )
        setError(null)
        setLoading(false)
      },
      onMissing: () => setError('Projects are unavailable.'),
      onStatus: (status, reason) => {
        if (status === 'unavailable')
          setError(reason ?? 'Projects are unavailable.')
      },
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (loading || restoredScroll.current) return
    restoredScroll.current = true
    window.scrollTo(0, readLibraryState().scroll)
  }, [loading])
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(
          'landing.library.v1',
          JSON.stringify({ ...readLibraryState(), scroll: window.scrollY }),
        )
      } catch {
        /* Best effort */
      }
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])
  const handleDelete = useCallback(
    async (id: string) => {
      if (deleting) return
      const title =
        projects.find((project) => project.id === id)?.title ?? 'Untitled'
      if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return
      setDeleting(id)
      setActionError(null)
      try {
        await deleteProject(id)
        void deleteDraft(id).catch(() => {})
        setProjects((prev) => prev.filter((project) => project.id !== id))
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to delete project',
        )
      } finally {
        setDeleting(null)
      }
    },
    [deleting, projects],
  )

  const statusFor = (project: ProjectMeta) =>
    statusById[project.id] ?? project.status ?? 'idle'
  const filterCounts: Record<ProjectFilter, number> = {
    all: projects.length,
    attention: projects.filter((project) =>
      ['error', 'interrupted'].includes(statusFor(project)),
    ).length,
    running: projects.filter((project) => statusFor(project) === 'running')
      .length,
  }
  const visibleProjects = projects
    .filter((project) => {
      const matchesQuery =
        `${project.title || 'Untitled'} ${project.brief ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      const status = statusFor(project)
      return (
        matchesQuery &&
        (filter === 'all' ||
          (filter === 'running'
            ? status === 'running'
            : status === 'error' || status === 'interrupted'))
      )
    })
    .sort((a, b) =>
      sort === 'name'
        ? (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
        : Date.parse(sort === 'created' ? b.createdAt : b.updatedAt) -
          Date.parse(sort === 'created' ? a.createdAt : a.updatedAt),
    )

  return (
    <main
      className="projects-workspace min-h-svh text-foreground"
      data-view={view}
    >
      <a className="projects-skip" href="#projects-title">
        Skip to projects
      </a>
      <aside aria-label="Workspace" className="projects-rail">
        <Link className="projects-brand" to="/">
          <span className="workspace-mark">
            <PanelsTopLeft aria-hidden="true" />
          </span>
          <span>
            Web App <br />
            Creator
            <span className="projects-brand-caption">Your website studio</span>
          </span>
        </Link>
        <div className="projects-rail-section">
          <span className="projects-eyebrow">Workspace</span>
          <ToggleGroup
            aria-label="Filter projects"
            className="projects-nav"
            onValueChange={(value) => {
              if (value) setFilter(value as ProjectFilter)
            }}
            orientation="vertical"
            spacing={0}
            type="single"
            value={filter}
          >
            {(['all', 'running', 'attention'] as const).map((value) => {
              const Icon =
                value === 'all'
                  ? FolderOpen
                  : value === 'running'
                    ? LoaderCircle
                    : CircleAlert
              return (
                <ToggleGroupItem
                  aria-label={`${FILTER_LABELS[value]}: ${filterCounts[value]}`}
                  key={value}
                  value={value}
                >
                  <Icon aria-hidden="true" />
                  <span>{FILTER_LABELS[value]}</span>
                  <span className="projects-nav-count">
                    {loading ? '—' : filterCounts[value]}
                  </span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </div>
        <div className="projects-rail-footer">
          <span className="projects-rail-note">
            An idea. A conversation.
            <br />A website of your own.
          </span>
          <Button
            aria-label="Toggle color theme"
            onClick={() =>
              setTheme(
                document.documentElement.classList.contains('dark')
                  ? 'light'
                  : 'dark',
              )
            }
            size="sm"
            variant="ghost"
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
            <span>Appearance</span>
          </Button>
        </div>
      </aside>
      <section aria-labelledby="projects-title" className="projects-library">
        <div className="projects-intro">
          <div>
            <p className="projects-eyebrow">Your workspace</p>
            <h1 className="projects-heading" id="projects-title" tabIndex={-1}>
              Projects
            </h1>
            <p className="projects-intro-description">
              From the first idea to the final detail.
            </p>
          </div>
          <Button onClick={() => navigate('/projects/new')} type="button">
            <Plus data-icon="inline-start" />
            New project
          </Button>
        </div>
        {renaming ? (
          <RenameProjectDialog
            onClose={() => setRenaming(null)}
            onSaved={(next) =>
              setProjects((current) =>
                current.map((project) =>
                  project.id === next.id ? { ...project, ...next } : project,
                ),
              )
            }
            project={renaming}
          />
        ) : null}
        <div className="projects-tools">
          <div className="projects-search">
            <label className="projects-search-label" htmlFor="project-search">
              Search projects
            </label>
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                aria-describedby="library-results"
                id="project-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or brief…"
                type="search"
                value={query}
              />
            </InputGroup>
          </div>
          <div className="projects-filter-controls">
            <div className="projects-mobile-filter">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={`Filter projects: ${FILTER_LABELS[filter]}`}
                    variant="ghost"
                  >
                    {FILTER_LABELS[filter]}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) =>
                        setFilter(value as ProjectFilter)
                      }
                      value={filter}
                    >
                      {(Object.keys(FILTER_LABELS) as ProjectFilter[]).map(
                        (value) => (
                          <DropdownMenuRadioItem key={value} value={value}>
                            {FILTER_LABELS[value]}
                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                              {filterCounts[value]}
                            </span>
                          </DropdownMenuRadioItem>
                        ),
                      )}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Sort projects: ${SORT_LABELS[sort]}`}
                  className="projects-sort-trigger"
                  title={SORT_LABELS[sort]}
                  variant="ghost"
                >
                  <ArrowDownWideNarrow data-icon="inline-start" />
                  <span>{SORT_LABELS[sort]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => setSort(value as ProjectSort)}
                    value={sort}
                  >
                    {(Object.keys(SORT_LABELS) as ProjectSort[]).map(
                      (value) => (
                        <DropdownMenuRadioItem key={value} value={value}>
                          {SORT_LABELS[value]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ToggleGroup
              aria-label="Project view"
              className="projects-view-control"
              onValueChange={(value) => {
                if (value) setView(value as ProjectView)
              }}
              spacing={0}
              type="single"
              value={view}
              variant="outline"
            >
              <ToggleGroupItem
                aria-label="Gallery view"
                title="Gallery view"
                value="gallery"
              >
                <LayoutGrid />
              </ToggleGroupItem>
              <ToggleGroupItem
                aria-label="List view"
                title="List view"
                value="list"
              >
                <List />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="projects-results">
          <p aria-atomic="true" id="library-results" role="status">
            {loading
              ? 'Loading projects…'
              : error
                ? 'Projects unavailable'
                : visibleProjects.length === projects.length
                  ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
                  : `${visibleProjects.length} of ${projects.length} projects`}
          </p>
          {query || filter !== 'all' ? (
            <Button
              onClick={() => {
                setQuery('')
                setFilter('all')
                document.getElementById('project-search')?.focus()
              }}
              size="xs"
              variant="ghost"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        {error || actionError ? (
          <div className="projects-notice" role="alert">
            <div>
              <p className="text-sm font-medium text-destructive-foreground">
                {error
                  ? 'Couldn’t load your projects'
                  : 'Couldn’t delete this project'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error || actionError}
              </p>
            </div>
            {error ? (
              <Button
                disabled={loading}
                onClick={() => void refresh()}
                variant="outline"
              >
                Try again
              </Button>
            ) : (
              <Button onClick={() => setActionError(null)} variant="ghost">
                Dismiss
              </Button>
            )}
          </div>
        ) : null}
        {loading ? (
          <div
            className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Opening your projects…
          </div>
        ) : projects.length === 0 && !error ? (
          <EmptyState onCreate={() => navigate('/projects/new')} />
        ) : visibleProjects.length === 0 && projects.length > 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyTitle>
                {query
                  ? 'No matching projects'
                  : filter === 'running'
                    ? 'Nothing building right now'
                    : 'No projects need attention'}
              </EmptyTitle>
              <EmptyDescription>
                {query
                  ? 'Try another name or a word from your brief.'
                  : 'Choose all projects to return to your pages.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
                variant="outline"
              >
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : visibleProjects.length > 0 ? (
          <>
            <div aria-hidden="true" className="project-list-head">
              <span>Project</span>
              <span>Last run</span>
              <span>Edited</span>
              <span />
            </div>
            <ul aria-label="Projects" className="project-list">
              {visibleProjects.map((project) => (
                <ProjectRow
                  deleting={deleting === project.id}
                  key={project.id}
                  onDelete={handleDelete}
                  onRename={() => setRenaming(project)}
                  project={project}
                  status={statusFor(project)}
                />
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty className="min-h-80">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileCode2 />
        </EmptyMedia>
        <EmptyTitle>Your first page is one idea away</EmptyTitle>
        <EmptyDescription>
          Describe a landing page or bring a reference. Build it, refine it, and
          download your finished page.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate} type="button">
          <Plus data-icon="inline-start" />
          Create a project
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const diffMs = Date.now() - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ProjectRow({
  deleting,
  onDelete,
  onRename,
  project,
  status,
}: {
  deleting: boolean
  onDelete: (id: string) => void
  onRename: () => void
  project: ProjectMeta
  status: RunStatus
}) {
  const title = project.title || 'Untitled'
  return (
    <li
      aria-busy={deleting}
      className="project-row"
      data-generating={status === 'running'}
    >
      <Link
        aria-label={`Open ${title}`}
        className="project-row-link"
        to={`/projects/${project.id}`}
      >
        <div className="project-preview-wrap">
          <ProjectPreview project={project} />
          <span aria-hidden="true" className="project-open-affordance">
            Open project <ArrowRight />
          </span>
        </div>
        <span className="project-row-copy">
          <span className="project-row-title" title={title}>
            {deleting ? 'Deleting…' : title}
          </span>
          {project.brief && project.brief !== title ? (
            <span className="project-row-brief" title={project.brief}>
              {project.brief}
            </span>
          ) : null}
        </span>
      </Link>
      <span className="project-row-status">
        <StatusPill status={runStatusToPanelStatus(status)} />
      </span>
      <time
        className="project-row-date"
        dateTime={project.updatedAt}
        title={new Date(project.updatedAt).toLocaleString()}
      >
        {formatRelative(project.updatedAt)}
      </time>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${title}`}
            className="project-row-menu"
            disabled={deleting}
            id={`project-actions-${project.id}`}
            size="icon-sm"
            variant="ghost"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to={`/projects/${project.id}`}>
                <ArrowRight />
                Open editor
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onRename}>
              Rename project
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDelete(project.id)}
              variant="destructive"
            >
              <Trash2 />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function readLibraryState(): {
  filter: ProjectFilter
  query: string
  scroll: number
  sort: ProjectSort
  view: ProjectView
} {
  try {
    const value = JSON.parse(
      sessionStorage.getItem('landing.library.v1') ?? '{}',
    )
    return {
      filter: ['all', 'attention', 'running'].includes(value.filter)
        ? value.filter
        : 'all',
      query: typeof value.query === 'string' ? value.query : '',
      scroll: Number.isFinite(value.scroll) ? value.scroll : 0,
      sort: ['created', 'name', 'updated'].includes(value.sort)
        ? value.sort
        : 'updated',
      view: value.view === 'list' ? 'list' : 'gallery',
    }
  } catch {
    return {
      filter: 'all',
      query: '',
      scroll: 0,
      sort: 'updated',
      view: 'gallery',
    }
  }
}
