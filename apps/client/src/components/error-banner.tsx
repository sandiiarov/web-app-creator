export type ErrorBannerProps = {
  message: string
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-20 mx-auto max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-2xl backdrop-blur">
      {message}
    </div>
  )
}
