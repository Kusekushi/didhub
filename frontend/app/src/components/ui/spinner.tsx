// lightweight SVG spinner

export function Spinner({ className = "", size = 6 }: { className?: string; size?: number }) {
  const s = size
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ width: `${s}rem`, height: `${s}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export default Spinner
