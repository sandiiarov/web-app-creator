import { Slider } from 'radix-ui'
import { useId } from 'react'

import { MotionNumber } from '#components/motion-number'

export function RangeSlider({
  disabled,
  label,
  max,
  min = 0,
  onValueChange,
  step = 1,
  suffix,
  value,
  valueLabel,
}: {
  disabled?: boolean
  label: string
  max: number
  min?: number
  onValueChange: (value: number) => void
  step?: number
  suffix?: string
  value: number
  valueLabel?: string
}) {
  const id = useId()
  return (
    <div className="glass-range">
      <div className="glass-range-heading">
        <span id={id}>{label}</span>
        <span aria-hidden="true" className="glass-range-value">
          {valueLabel ?? <MotionNumber suffix={suffix} value={value} />}
        </span>
      </div>
      <Slider.Root
        className="glass-range-control"
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={([next]) => {
          if (next !== undefined) onValueChange(next)
        }}
        step={step}
        value={[value]}
      >
        <Slider.Track className="glass-range-track">
          <Slider.Range className="glass-range-fill" />
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={id}
          aria-valuetext={valueLabel ?? `${value}${suffix ?? ''}`}
          className="glass-range-thumb"
        />
      </Slider.Root>
    </div>
  )
}
