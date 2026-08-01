/**
 * Anthropic brand logo mark.
 * Brand logos are not available in lucide-react, so this is a dedicated SVG component.
 * Mark from Anthropic's official logo (single path), rendered in Claude coral
 * #D97757 so it stays visible on dark surfaces.
 */
export function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={{ flex: 'none', lineHeight: 1 }}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
        fill="#D97757"
      />
    </svg>
  )
}
