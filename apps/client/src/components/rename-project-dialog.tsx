import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { useState } from 'react'

import { renameProject, type ProjectMeta } from '../lib/projects-api'

export function RenameProjectDialog({
  onClose,
  onSaved,
  project,
}: {
  onClose: () => void
  onSaved: (project: ProjectMeta) => void
  project: Pick<ProjectMeta, 'id' | 'title'>
}) {
  const [title, setTitle] = useState(project.title)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<null | string>(null)
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Give your page a name you’ll recognize. Your original brief stays
            with the project.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending || !title.trim()) return
            setPending(true)
            setError(null)
            try {
              onSaved(await renameProject(project.id, title.trim()))
              onClose()
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Could not save the name',
              )
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm" htmlFor="project-name">
            Project name
            <Input
              disabled={pending}
              id="project-name"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              disabled={pending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={pending || !title.trim()} type="submit">
              {pending ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
