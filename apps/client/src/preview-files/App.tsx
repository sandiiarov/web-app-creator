import { useState } from 'react'

const previewClassNames = {
  card: 'preview-card',
  eyebrow: 'eyebrow',
  shell: 'preview-shell',
}

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <section className={previewClassNames.shell}>
      <div className={previewClassNames.card}>
        <p className={previewClassNames.eyebrow}>almostnode + Vite</p>
        <h1>Vite is running inside your browser.</h1>
        <p>
          This iframe is served by an in-memory Vite dev server backed by
          almostnode&apos;s VirtualFS and service worker bridge.
        </p>
        <button onClick={() => setCount((value) => value + 1)}>
          Count: {count}
        </button>
      </div>
    </section>
  )
}
