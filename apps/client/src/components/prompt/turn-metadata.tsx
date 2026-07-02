import { Badge } from '@workspace/ui/components/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import { cn } from '@workspace/ui/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  formatCost,
  formatDuration,
  formatTokenCount,
  LANDING_MODEL_OPTIONS,
  type CostBreakdown,
  type ImageCost,
  type ScrapeCost,
  type StatsPart,
  type TokenUsage,
  type VisionCost,
} from '../../lib/landing-agent'

export function TurnMetadata({ stats }: { stats: StatsPart }) {
  const [open, setOpen] = useState(false)

  const totalCost = formatCost(stats.cost)
  const totalTokens = formatTokenCount(stats.usage.totalTokens)
  const model = modelLabel(stats.model)

  return (
    <Collapsible
      className="overflow-hidden rounded-none border border-border/70 bg-background/70 shadow-sm"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center gap-2 rounded-none px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none',
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center border border-border/70 bg-muted/25 text-muted-foreground transition-colors group-hover:border-border group-hover:text-foreground">
          {open ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">
            Spend / tokens
          </span>
          <span className="block truncate text-[10px] leading-4 text-muted-foreground">
            {model} · {formatDuration(stats.durationMs)} · {stats.finishReason}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {totalTokens ? <MetricBadge>{totalTokens}</MetricBadge> : null}
          <MetricBadge>{totalCost}</MetricBadge>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 border-t border-border/60 p-2.5 text-[11px]">
          <RunOverview
            cost={totalCost}
            finishReason={stats.finishReason}
            model={model}
            tokens={totalTokens ?? '—'}
          />
          {stats.costBreakdown ? (
            <CostBreakdownView breakdown={stats.costBreakdown} />
          ) : null}
          <TokenBreakdown usage={stats.usage} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function CostBreakdownView({ breakdown }: { breakdown: CostBreakdown }) {
  const { image, llm, scrape, total, vision } = breakdown
  const showScrape = scrape.calls > 0 || scrape.credits > 0 || scrape.cost > 0
  const showImage = !!image && (image.count > 0 || image.cost > 0)
  const showVision = !!vision && (vision.images > 0 || vision.cost > 0)

  return (
    <Section title="Cost breakdown">
      <ReceiptRow label="LLM" value={formatCost(llm)} />
      {showImage ? <ImageCostRow image={image!} /> : null}
      {showVision ? <VisionCostRow vision={vision!} /> : null}
      {showScrape ? <ScrapeCostRow scrape={scrape} /> : null}
      <ReceiptRow emphasis label="Total" value={formatCost(total)} />
    </Section>
  )
}

function ImageCostRow({ image }: { image: ImageCost }) {
  return (
    <ReceiptRow
      detail={
        image.count > 0
          ? `${image.count} image${image.count === 1 ? '' : 's'}`
          : undefined
      }
      label="Image gen"
      value={formatCost(image.cost)}
    />
  )
}

function MetricBadge({ children }: { children: string }) {
  return (
    <Badge
      className="h-6 border-border/70 bg-muted/25 px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-none"
      variant="outline"
    >
      {children}
    </Badge>
  )
}

function modelLabel(modelId: string) {
  return (
    LANDING_MODEL_OPTIONS.find((option) => option.id === modelId)?.label ??
    modelId
  )
}

function ReceiptRow({
  detail,
  emphasis,
  label,
  value,
}: {
  detail?: string
  emphasis?: boolean
  label: string
  value: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-1">
      <span
        className={cn(
          'min-w-0 font-medium text-muted-foreground',
          emphasis && 'text-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-foreground tabular-nums',
          emphasis && 'font-semibold',
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="col-span-2 min-w-0 truncate text-[10px] leading-4 text-muted-foreground/80">
          {detail}
        </span>
      ) : null}
    </div>
  )
}

function RunOverview({
  cost,
  finishReason,
  model,
  tokens,
}: {
  cost: string
  finishReason: string
  model: string
  tokens: string
}) {
  return (
    <div className="grid grid-cols-2 border border-border/50 bg-border/30">
      <SummaryCell label="Model" value={model} />
      <SummaryCell label="Finish" value={finishReason} />
      <SummaryCell label="Cost" value={cost} />
      <SummaryCell label="Tokens" value={tokens} />
    </div>
  )
}

function ScrapeCostRow({ scrape }: { scrape: ScrapeCost }) {
  const details: string[] = []

  if (scrape.credits > 0) {
    details.push(`${scrape.credits} credit${scrape.credits === 1 ? '' : 's'}`)
  }
  if (typeof scrape.ocrImages === 'number' && scrape.ocrImages > 0) {
    details.push(
      `OCR ${scrape.ocrImages} image${scrape.ocrImages === 1 ? '' : 's'}`,
    )
  }
  if (scrape.calls > 0) {
    details.push(`${scrape.calls} call${scrape.calls === 1 ? '' : 's'}`)
  }

  return (
    <ReceiptRow
      detail={details.length > 0 ? details.join(' · ') : undefined}
      label="Scrape"
      value={formatCost(scrape.cost)}
    />
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border border-border/50 bg-muted/10 px-2 py-1.5">
      <h4 className="mb-1 border-b border-border/40 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h4>
      <div className="divide-y divide-border/35">{children}</div>
    </section>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-border/45 bg-background/80 px-2 py-1.5 odd:border-r">
      <div className="truncate text-[10px] leading-4 font-medium text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-mono text-[11px] leading-5 text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function TokenBreakdown({ usage }: { usage: TokenUsage }) {
  return (
    <Section title="Token breakdown">
      <ReceiptRow
        label="Input"
        value={formatTokenCount(usage.inputTokens) ?? '—'}
      />
      <ReceiptRow
        label="Output"
        value={formatTokenCount(usage.outputTokens) ?? '—'}
      />
      {typeof usage.cachedInputTokens === 'number' ? (
        <ReceiptRow
          label="Cached"
          value={formatTokenCount(usage.cachedInputTokens) ?? '—'}
        />
      ) : null}
      {typeof usage.reasoningTokens === 'number' ? (
        <ReceiptRow
          label="Reasoning"
          value={formatTokenCount(usage.reasoningTokens) ?? '—'}
        />
      ) : null}
    </Section>
  )
}

function VisionCostRow({ vision }: { vision: VisionCost }) {
  const details: string[] = []

  if (vision.images > 0) {
    details.push(`${vision.images} image${vision.images === 1 ? '' : 's'}`)
  }
  if (vision.calls > 0) {
    details.push(`${vision.calls} call${vision.calls === 1 ? '' : 's'}`)
  }

  return (
    <ReceiptRow
      detail={details.length > 0 ? details.join(' · ') : undefined}
      label="Vision OCR"
      value={formatCost(vision.cost)}
    />
  )
}
