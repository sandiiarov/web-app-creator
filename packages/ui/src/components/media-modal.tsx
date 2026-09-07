import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/dialog'
import { useMotionPreference } from '#lib/motion-preference'
import { cn } from '#lib/utils'

/** Shared image viewer with a thumbnail-to-image transition and Radix focus management. */
export function MediaModal({
  alt,
  children,
  className,
  description,
  src,
}: {
  alt: string
  children?: ReactNode
  className?: string
  description?: string
  src: string
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [motion] = useMotionPreference()
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const name = `media-${id}`
  const transitionStyle = { viewTransitionName: name } satisfies CSSProperties
  const changeOpen = (next: boolean) => {
    if (next) setFailed(false)
    const animate =
      (motion === 'standard' || motion === 'enhanced') &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (animate && document.startViewTransition) {
      document.startViewTransition(() => flushSync(() => setOpen(next)))
    } else setOpen(next)
  }
  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <button
          aria-label={`Preview ${alt}`}
          className={cn('media-thumbnail', className)}
          type="button"
        >
          <img
            alt={alt}
            className="media-thumbnail-image"
            loading="lazy"
            src={src}
            style={open ? undefined : transitionStyle}
          />
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="media-modal">
        <DialogHeader>
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>
            {description ?? 'Image preview'}
          </DialogDescription>
        </DialogHeader>
        <div className="media-modal-stage">
          {failed ? (
            <p role="alert">
              This image couldn’t load. Close the preview and try again.
            </p>
          ) : (
            <img
              alt={alt}
              onError={() => setFailed(true)}
              src={src}
              style={transitionStyle}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
