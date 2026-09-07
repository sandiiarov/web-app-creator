/**
 * OpenRouter stealth-model mark (B-2 Spirit top view), adapted from
 * https://openrouter.ai/images/icons/Stealth.svg — gradient backdrop dropped,
 * foreground uses currentColor so it follows the theme like the other brand icons.
 */
export function StealthIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      style={{ flex: 'none', lineHeight: 1 }}
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M120 70L70 130L50 150L65 160L120 130L175 160L190 150L170 130Z"
        fill="currentColor"
      />
      <path d="M100 130L120 150L140 130Z" fill="currentColor" />
    </svg>
  )
}
