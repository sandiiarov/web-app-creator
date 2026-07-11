import { Button } from '@workspace/ui/components/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@workspace/ui/components/popover'
import { Separator } from '@workspace/ui/components/separator'
import { cn } from '@workspace/ui/lib/utils'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Binary,
  CircleDollarSign,
  Database,
  ReceiptText,
  Sigma,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ComponentType, type ReactNode } from 'react'

import {
  formatCost,
  formatTokenCount,
  type LandingTurn,
  type ScrapeCost,
  type TokenUsage,
} from './domain'
import { FirecrawlIcon } from './firecrawl-icon'
import { MODEL_ROLE_META } from './model-role-meta'
import { summarizeSpend } from './spend-summary'

export function SpendPopover({ turns }: { turns: LandingTurn[] }) {
  const summary = useMemo(() => summarizeSpend(turns), [turns])
  const totalCost = formatCost(summary.cost)
  const triggerCost = `$${summary.cost.toFixed(2)}`
  const totalTokens = formatTokenCount(summary.usage.totalTokens) ?? '0'
  const { image, llm, scrape, vision } = summary.costBreakdown

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Project spend: ${triggerCost}`}
          size="xs"
          type="button"
          variant="outline"
        >
          <span className="font-mono tabular-nums">{triggerCost}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" side="top" sideOffset={6}>
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2">
            <ReceiptText className="size-4" />
            Project spend
          </PopoverTitle>
          <PopoverDescription>
            {summary.turnCount === 0
              ? 'No completed turns yet'
              : `${summary.turnCount} completed turn${summary.turnCount === 1 ? '' : 's'}`}
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid grid-cols-2 border border-border/60 bg-muted/10">
          <SummaryMetric
            icon={CircleDollarSign}
            label="Spend"
            value={totalCost}
          />
          <SummaryMetric icon={Binary} label="Tokens" value={totalTokens} />
        </div>

        <Separator />
        <MetricSection icon={CircleDollarSign} title="Cost breakdown">
          <MetricRow
            icon={MODEL_ROLE_META.text.Icon}
            iconClassName={MODEL_ROLE_META.text.color}
            label="LLM"
            value={formatCost(llm)}
          />
          <MetricRow
            detail={`${image.count} image${image.count === 1 ? '' : 's'}`}
            icon={MODEL_ROLE_META.image.Icon}
            iconClassName={MODEL_ROLE_META.image.color}
            label="Image generation"
            value={formatCost(image.cost)}
          />
          <MetricRow
            detail={`${vision.images} image${vision.images === 1 ? '' : 's'} · ${vision.calls} call${vision.calls === 1 ? '' : 's'}`}
            icon={MODEL_ROLE_META.vision.Icon}
            iconClassName={MODEL_ROLE_META.vision.color}
            label="Vision OCR"
            value={formatCost(vision.cost)}
          />
          <MetricRow
            detail={scrapeDetail(scrape)}
            icon={FirecrawlIcon}
            iconClassName="text-[oklch(0.67_0.22_37.27)]"
            label="Scrape"
            value={formatCost(scrape.cost)}
          />
          <MetricRow emphasis icon={Sigma} label="Total" value={totalCost} />
        </MetricSection>

        <Separator />
        <TokenBreakdown usage={summary.usage} />
      </PopoverContent>
    </Popover>
  )
}

function MetricRow({
  detail,
  emphasis = false,
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  detail?: string
  emphasis?: boolean
  icon: ComponentType<{ className?: string }>
  iconClassName?: string
  label: string
  value: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-1">
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5',
          emphasis && 'font-medium text-foreground',
        )}
      >
        <Icon className={cn('size-3.5 shrink-0', iconClassName)} />
        {label}
      </span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
      {detail ? (
        <span className="col-span-2 truncate text-[10px] text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  )
}

function MetricSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode
  icon: LucideIcon
  title: string
}) {
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="divide-y divide-border/40 text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

function scrapeDetail(scrape: ScrapeCost) {
  const details = [`${scrape.credits} credit${scrape.credits === 1 ? '' : 's'}`]
  if ((scrape.ocrImages ?? 0) > 0) {
    details.push(
      `OCR ${scrape.ocrImages} image${scrape.ocrImages === 1 ? '' : 's'}`,
    )
  }
  details.push(`${scrape.calls} call${scrape.calls === 1 ? '' : 's'}`)
  return details.join(' · ')
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 px-2 py-1.5 odd:border-r odd:border-border/60">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="truncate font-mono text-sm font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function TokenBreakdown({ usage }: { usage: TokenUsage }) {
  return (
    <MetricSection icon={Binary} title="Token breakdown">
      <MetricRow
        icon={ArrowDownToLine}
        label="Input"
        value={formatTokenCount(usage.inputTokens) ?? '0'}
      />
      <MetricRow
        icon={ArrowUpFromLine}
        label="Output"
        value={formatTokenCount(usage.outputTokens) ?? '0'}
      />
      <MetricRow
        icon={Database}
        label="Cached"
        value={formatTokenCount(usage.cachedInputTokens) ?? '0'}
      />
    </MetricSection>
  )
}
