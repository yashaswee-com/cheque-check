import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import styles from './landing.module.css'

export function PublicIcon({ size = 24, ...props }: HugeiconsIconProps) {
  return (
    <span
      className={styles.toneIcon}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <HugeiconsIcon {...props} size={size} aria-hidden="true" />
    </span>
  )
}
