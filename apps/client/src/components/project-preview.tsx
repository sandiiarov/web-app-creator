import { isStarterPreview } from '@workspace/landing-preview'
import { FileCode2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  type ProjectMeta,
  expandProjectImageUrls,
  getProject,
} from '../lib/projects-api'

export function ProjectPreview({ project }: { project: ProjectMeta }) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<null | string>(null)
  const title = project.title || 'Untitled'

  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    // Every thumbnail shows the same desktop viewport, at its actual available scale.
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        element.style.setProperty(
          '--project-preview-scale',
          String(entry.contentRect.width / 1440),
        )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    setFailed(false)
    setPreviewHtml(null)
    if (!project.hasHtml || !visible) return
    void getProject(project.id)
      .then((fullProject) => {
        if (!cancelled) {
          setPreviewHtml(
            isStarterPreview(fullProject.indexHtml)
              ? ''
              : expandProjectImageUrls(fullProject.indexHtml),
          )
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [project.hasHtml, project.id, project.updatedAt, visible])

  return (
    <div
      aria-hidden="true"
      className="project-thumbnail"
      inert
      ref={previewRef}
    >
      <div className="project-thumbnail-content">
        {previewHtml ? (
          <iframe
            className="project-thumbnail-frame"
            loading="lazy"
            sandbox=""
            srcDoc={previewHtml}
            tabIndex={-1}
            title={`Preview of ${title}`}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="project-draft-icon">
              <FileCode2 className="size-5" />
            </span>
            <span className="project-thumbnail-label">
              {failed
                ? 'Unavailable'
                : !project.hasHtml || previewHtml === ''
                  ? 'Blank page'
                  : 'Opening…'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
