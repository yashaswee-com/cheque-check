'use client'

import type { ReactNode } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import styles from './landing.module.css'

export function PublicHeader({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference()
  const { scrollY } = useScroll()
  const shadow = useTransform(
    scrollY,
    [0, 100],
    ['0 4px 16px rgba(0, 0, 0, 0.06)', '0 8px 32px rgba(0, 0, 0, 0.14)'],
  )

  return (
    <motion.header
      className={`${styles.header} sticky top-0 z-40`}
      style={{ boxShadow: reducedMotion ? undefined : shadow }}
    >
      {children}
    </motion.header>
  )
}
