import { Button } from '@workspace/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import { ArrowUpRight, Globe2, LayoutTemplate, UserRound } from 'lucide-react'

const suggestions = [
  {
    icon: UserRound,
    label: 'A personal portfolio',
    prompt: 'Build a personal portfolio for me. My name is ',
  },
  {
    icon: LayoutTemplate,
    label: 'A product landing page',
    prompt: 'Build a landing page for my product. It helps people ',
  },
  {
    icon: Globe2,
    label: 'Start from a website',
    prompt: 'Create a fresh take on this website: ',
  },
]

export function ChatEmptyState({
  onSuggestion,
}: {
  onSuggestion: (prompt: string) => void
}) {
  return (
    <Empty className="assistant-welcome">
      <EmptyHeader>
        <EmptyTitle>Let’s build your page.</EmptyTitle>
        <EmptyDescription>
          Start with an idea or a reference. Refine it right here.
        </EmptyDescription>
      </EmptyHeader>
      <div className="assistant-suggestions">
        {suggestions.map(({ icon: Icon, label, prompt }) => (
          <Button
            className="assistant-suggestion"
            key={label}
            onClick={() => onSuggestion(prompt)}
            variant="ghost"
          >
            <Icon data-icon="inline-start" />
            <span>{label}</span>
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        ))}
      </div>
    </Empty>
  )
}
