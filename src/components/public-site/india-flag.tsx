export function IndiaFlag({
  title,
  className,
}: {
  title: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 30 20"
      role="img"
      aria-label={title}
      className={className}
    >
      <rect width="30" height="20" rx="2" fill="#ffffff" />
      <path d="M2 0h26a2 2 0 0 1 2 2v4.67H0V2a2 2 0 0 1 2-2Z" fill="#ff9933" />
      <path
        d="M0 13.33h30V18a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-4.67Z"
        fill="#138808"
      />
      <g stroke="#000080" fill="none">
        <circle cx="15" cy="10" r="2.6" strokeWidth="0.45" />
        {Array.from({ length: 12 }, (_, index) => (
          <line
            key={index}
            x1="15"
            y1="7.4"
            x2="15"
            y2="12.6"
            strokeWidth="0.2"
            transform={`rotate(${index * 15} 15 10)`}
          />
        ))}
      </g>
      <rect
        x="0.25"
        y="0.25"
        width="29.5"
        height="19.5"
        rx="1.75"
        fill="none"
        stroke="rgb(0 0 0 / 12%)"
        strokeWidth="0.5"
      />
    </svg>
  )
}
