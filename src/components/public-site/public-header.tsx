import type { ReactNode } from 'react'
import styles from './landing.module.css'

export function PublicHeader({ children }: { children: ReactNode }) {
  return (
    <header className={`${styles.header} sticky top-0 z-40`}>{children}</header>
  )
}
