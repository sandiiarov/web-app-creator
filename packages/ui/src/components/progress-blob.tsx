import { useId } from 'react'

/** Three overlapping organic layers, ordered from dark to yellow. */
export function ProgressBlob() {
  const id = useId().replace(/:/g, '')
  return (
    <svg aria-hidden="true" className="progress-blob" viewBox="0 0 80 80">
      <defs>
        <path
          d="M39 7C52 5 53 15 65 21C78 27 69 41 69 51C69 65 54 69 43 73C31 77 25 63 15 60C3 55 9 42 9 31C9 18 27 9 39 7Z"
          id={`${id}-shape`}
        />
        <radialGradient cx="28%" cy="22%" id={`${id}-light`} r="80%">
          <stop offset="0" stopColor="var(--blob-light)" />
          <stop offset="0.6" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary)" />
        </radialGradient>
      </defs>
      <g transform="translate(-2 -4) scale(.74)">
        <g className="progress-blob-body progress-blob-back">
          <use fill="var(--blob-back)" href={`#${id}-shape`} />
        </g>
      </g>
      <g transform="translate(9 7) scale(.74)">
        <g className="progress-blob-body progress-blob-middle">
          <use fill="var(--blob-middle)" href={`#${id}-shape`} />
        </g>
      </g>
      <g transform="translate(20 18) scale(.74)">
        <g className="progress-blob-body">
          <use fill={`url(#${id}-light)`} href={`#${id}-shape`} />
        </g>
        <path
          d="m27 32 8 8-8 8m14 0h12"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="3.5"
        />
      </g>
    </svg>
  )
}
