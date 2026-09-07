import { useId } from 'react'

/** A bounded organic progress mark: no canvas, render loop, or extra WebGL context. */
export function ProgressBlob() {
  const id = useId().replace(/:/g, '')
  return (
    <svg aria-hidden="true" className="progress-blob" viewBox="0 0 80 80">
      <defs>
        <radialGradient cx="28%" cy="22%" id={`${id}-light`} r="80%">
          <stop offset="0" stopColor="var(--blob-light)" />
          <stop offset="0.4" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--blob-shade)" />
        </radialGradient>
        <radialGradient cx="70%" cy="70%" id={`${id}-rim`} r="65%">
          <stop offset="0" stopColor="var(--blob-light)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--blob-light)" stopOpacity="0.6" />
        </radialGradient>
      </defs>
      <g className="progress-blob-body">
        <path
          d="M39 7C52 5 53 15 65 21C78 27 69 41 69 51C69 65 54 69 43 73C31 77 25 63 15 60C3 55 9 42 9 31C9 18 27 9 39 7Z"
          fill={`url(#${id}-light)`}
        />
        <path
          d="M39 7C52 5 53 15 65 21C78 27 69 41 69 51C69 65 54 69 43 73C31 77 25 63 15 60C3 55 9 42 9 31C9 18 27 9 39 7Z"
          fill={`url(#${id}-rim)`}
        />
        <ellipse
          cx="29"
          cy="24"
          fill="var(--blob-light)"
          opacity="0.6"
          rx="10"
          ry="5"
          transform="rotate(-35 29 24)"
        />
      </g>
    </svg>
  )
}
