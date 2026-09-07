import { useId } from 'react'

const BLOB_PATH =
  'M39 7C52 5 53 15 65 21C78 27 69 41 69 51C69 65 54 69 43 73C31 77 25 63 15 60C3 55 9 42 9 31C9 18 27 9 39 7Z'

/** Centered 48/40/32px layers, ordered from dark to yellow. */
export function ProgressBlob() {
  const id = useId().replace(/:/g, '')
  return (
    <span aria-hidden="true" className="progress-blob">
      <svg
        className="progress-blob-layer progress-blob-layer-back"
        viewBox="0 0 80 80"
      >
        <g className="progress-blob-body progress-blob-back">
          <path d={BLOB_PATH} fill="var(--blob-back)" />
        </g>
      </svg>
      <svg
        className="progress-blob-layer progress-blob-layer-middle"
        viewBox="0 0 80 80"
      >
        <g className="progress-blob-body progress-blob-middle">
          <path d={BLOB_PATH} fill="var(--blob-middle)" />
        </g>
      </svg>
      <svg
        className="progress-blob-layer progress-blob-layer-front"
        viewBox="0 0 80 80"
      >
        <defs>
          <radialGradient cx="28%" cy="22%" id={`${id}-light`} r="80%">
            <stop offset="0" stopColor="var(--blob-light)" />
            <stop offset="0.6" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--primary)" />
          </radialGradient>
        </defs>
        <g className="progress-blob-body">
          <path d={BLOB_PATH} fill={`url(#${id}-light)`} />
        </g>
        <path
          d="m27 32 8 8-8 8m14 0h12"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="3.5"
        />
      </svg>
    </span>
  )
}
