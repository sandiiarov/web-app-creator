import type { PreviewViewport } from '@workspace/prompt-panel'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { Download, Monitor, Pencil, RefreshCw } from 'lucide-react'

/** Page actions are composed inside the assistant's settings menu. */
export function EditorPageActions({
  canDownload,
  exportError,
  exporting,
  onDownloadHtml,
  onReloadPreview,
  onRename,
  onViewportChange,
  refreshed,
  viewport,
}: {
  canDownload: boolean
  exportError: null | string
  exporting: boolean
  onDownloadHtml: () => void
  onReloadPreview: () => void
  onRename: () => void
  onViewportChange: (viewport: PreviewViewport) => void
  refreshed: boolean
  viewport: PreviewViewport
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename project
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Monitor />
            Preview width
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onViewportChange(value as PreviewViewport)
              }
              value={viewport}
            >
              <DropdownMenuRadioItem value="desktop">
                Desktop · Full width
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tablet">
                Tablet · 768px
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="mobile">
                Mobile · 390px
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          disabled={!canDownload}
          onSelect={(event) => {
            event.preventDefault()
            onReloadPreview()
          }}
        >
          <RefreshCw className={refreshed ? 'animate-spin' : undefined} />
          {refreshed ? 'Preview refreshed' : 'Refresh preview'}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDownload || exporting}
          onSelect={(event) => {
            event.preventDefault()
            onDownloadHtml()
          }}
        >
          <Download />
          {exporting
            ? 'Downloading…'
            : exportError
              ? 'Retry HTML download'
              : 'Download HTML'}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {exportError ? (
        <p className="px-2 py-1 text-xs text-destructive" role="alert">
          {exportError}
        </p>
      ) : null}
      <span className="sr-only" role="status">
        {refreshed ? 'Preview refreshed' : exporting ? 'Downloading HTML' : ''}
      </span>
      <DropdownMenuSeparator />
    </>
  )
}
