'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import styles from '@/components/public-site/article.module.css'

const TITLES = {
  en: 'Articles',
  hi: 'लेख',
  'hi-en': 'Articles',
} as const

export function ArticleHeader({ locale }: { locale: 'en' | 'hi' | 'hi-en' }) {
  const router = useRouter()
  return (
    <div className={styles.articlePageHeader}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => router.back()}
        aria-label="Back"
        className="rounded-full -ml-2 h-9 w-9 shrink-0"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="h-5 w-5" />
      </Button>
      <span>{TITLES[locale]}</span>
    </div>
  )
}
