import type { CSSProperties } from 'react'

const MARQUEE_THRESHOLD = 25

export function AccountName({ name }: { name: string }) {
  if (name.length <= MARQUEE_THRESHOLD) {
    return (
      <span className="block min-w-0 max-w-full truncate" title={name}>
        {name}
      </span>
    )
  }

  const style: CSSProperties & {
    '--account-name-marquee-duration': string
  } = {
    '--account-name-marquee-duration': `${Math.max(8, name.length / 4)}s`,
  }

  return (
    <span className="account-name-marquee" title={name}>
      <span className="sr-only">{name}</span>
      <span
        aria-hidden="true"
        className="account-name-marquee-track"
        style={style}
      >
        <span>{name}</span>
        <span>{name}</span>
      </span>
      <span aria-hidden="true" className="account-name-marquee-fallback">
        {name}
      </span>
    </span>
  )
}
