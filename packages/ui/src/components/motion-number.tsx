import NumberFlow from '@number-flow/react'
import type { ComponentProps } from 'react'

import { useMotionPreference } from '#lib/motion-preference'

/** UI Layouts' NumberFlow treatment, following the app and device motion settings. */
export function MotionNumber(props: ComponentProps<typeof NumberFlow>) {
  const [preference] = useMotionPreference()
  return (
    <NumberFlow
      format={{ maximumFractionDigits: 0, useGrouping: false }}
      opacityTiming={{ duration: 140 }}
      transformTiming={{
        duration: 380,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      {...props}
      animated={preference === 'standard' || preference === 'enhanced'}
      respectMotionPreference
    />
  )
}
