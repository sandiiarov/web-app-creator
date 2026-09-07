/**
 * Animate UI `SlidingNumber` (texts/sliding-number), adapted: clock-style
 * vertically rolling digits driven by per-digit springs — visible even for
 * ±1 changes, which a value-tweening counter hides. The `useIsInView` gate
 * and `react-use-measure` dep are replaced with a one-shot glyph measure.
 * Spring feel follows BundUI Motion Countdown (stiffness 280/damping 18/
 * mass 0.3): https://bundui.io/motion/components/countdown
 * Source: https://animate-ui.com/docs/primitives/texts/sliding-number
 */
import {
  type MotionValue,
  type SpringOptions,
  motion,
  useSpring,
  useTransform,
} from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface SlidingNumberProps {
  className?: string
  number: number
  padStart?: boolean
  transition?: SpringOptions
}

export function SlidingNumber({
  className,
  number,
  padStart = false,
  transition = { damping: 18, mass: 0.3, stiffness: 280 },
}: SlidingNumberProps) {
  const value = Math.max(0, Math.round(number))
  const [current, setCurrent] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    if (value === current) return
    prevRef.current = current
    setCurrent(value)
  }, [value, current])

  const currentStr = current.toString()
  const prevStr = prevRef.current.toString()
  const length = padStart
    ? Math.max(currentStr.length, prevStr.length)
    : currentStr.length
  const paddedCurrent = currentStr.padStart(length, '0')
  const paddedPrev = prevStr.padStart(length, '0')

  const places = useMemo(
    () => Array.from({ length }, (_, i) => 10 ** (length - i - 1)),
    [length],
  )

  return (
    <span
      className={className}
      data-slot="sliding-number"
      style={{ alignItems: 'center', display: 'inline-flex' }}
    >
      {places.map((place) => (
        <SlidingNumberRoller
          key={place}
          place={place}
          prevValue={Number.parseInt(paddedPrev, 10)}
          transition={transition}
          value={Number.parseInt(paddedCurrent, 10)}
        />
      ))}
    </span>
  )
}

function SlidingNumberDisplay({
  height,
  motionValue,
  number,
}: {
  height: number
  motionValue: MotionValue<number>
  number: number
}) {
  const y = useTransform(motionValue, (latest) => {
    if (!height) return 0
    const currentNumber = ((latest % 10) + 10) % 10
    const offset = (10 + number - currentNumber) % 10
    let translateY = offset * height
    if (offset > 5) translateY -= 10 * height
    return translateY
  })

  if (!height) {
    return (
      <span style={{ position: 'absolute', visibility: 'hidden' }}>
        {number}
      </span>
    )
  }

  return (
    <motion.span
      data-slot="sliding-number-display"
      style={{
        alignItems: 'center',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        position: 'absolute',
        y,
      }}
    >
      {number}
    </motion.span>
  )
}

function SlidingNumberRoller({
  place,
  prevValue,
  transition,
  value,
}: {
  place: number
  prevValue: number
  transition: SpringOptions
  value: number
}) {
  const startNumber = Math.floor(prevValue / place) % 10
  const targetNumber = Math.floor(value / place) % 10
  const animatedValue = useSpring(startNumber, transition)

  useEffect(() => {
    animatedValue.set(targetNumber)
  }, [targetNumber, animatedValue])

  const [measureRef, setMeasureRef] = useState<HTMLSpanElement | null>(null)
  const height = measureRef?.offsetHeight ?? 0

  return (
    <span
      data-slot="sliding-number-roller"
      ref={setMeasureRef}
      style={{
        display: 'inline-block',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        overflowX: 'visible',
        overflowY: 'clip',
        position: 'relative',
        width: '1ch',
      }}
    >
      <span style={{ visibility: 'hidden' }}>0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <SlidingNumberDisplay
          height={height}
          key={i}
          motionValue={animatedValue}
          number={i}
        />
      ))}
    </span>
  )
}
