import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import { Sparkles } from 'lucide-react'

export function ChatEmptyState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-3">
      <Empty>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>Describe a landing page</EmptyTitle>
        <EmptyDescription>
          Type a prompt below to generate a single-file landing page. The agent
          reads, edits, and refines the page for you.
        </EmptyDescription>
      </Empty>
    </div>
  )
}
