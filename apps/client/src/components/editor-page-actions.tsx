import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@workspace/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { Download, Pencil, RefreshCw } from 'lucide-react'

/** Secondary page actions live inside the assistant's panel layout menu. */
export function EditorPageActions({
  canDownload,
  exportError,
  exporting,
  onDownloadHtml,
  onRename,
}: {
  canDownload: boolean
  exportError: null | string
  exporting: boolean
  onDownloadHtml: () => void
  onRename: () => void
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename project
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
        <p
          className="px-2 py-1 text-xs text-destructive-foreground"
          role="alert"
        >
          {exportError}
        </p>
      ) : null}
      <span className="sr-only" role="status">
        {exporting ? 'Downloading HTML' : ''}
      </span>
      <DropdownMenuSeparator />
    </>
  )
}

export function PreviewRefreshButton({
  disabled,
  onRefresh,
  refreshed,
}: {
  disabled: boolean
  onRefresh: () => void
  refreshed: boolean
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Refresh preview"
            disabled={disabled}
            onClick={onRefresh}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw className={refreshed ? 'animate-spin' : undefined} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {refreshed ? 'Preview refreshed' : 'Refresh preview'}
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" role="status">
        {refreshed ? 'Preview refreshed' : ''}
      </span>
    </>
  )
}
