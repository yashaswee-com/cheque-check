'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  DeliveryBox01Icon,
  Layers01Icon,
  Medicine01Icon,
  Shirt01Icon,
} from '@hugeicons/core-free-icons'
import { PublicIcon } from './public-icon'
import styles from './landing.module.css'

const AUDIENCES = [
  { key: 'textiles', icon: Shirt01Icon },
  { key: 'steel', icon: Layers01Icon },
  { key: 'pharma', icon: Medicine01Icon },
  { key: 'distribution', icon: DeliveryBox01Icon },
] as const

export function IndustryMarquee() {
  const t = useTranslations('PublicSite.landing')
  const [paused, setPaused] = useState(false)

  return (
    <div className={styles.marqueeArea}>
      <div
        className={styles.marquee}
        data-paused={paused}
        tabIndex={0}
        aria-label={t('audienceLabel')}
      >
        <div className={styles.marqueeTrack} data-testid="industry-marquee">
          {[false, true].map((duplicate) => (
            <ul
              key={String(duplicate)}
              className={styles.audienceTrack}
              aria-hidden={duplicate || undefined}
            >
              {AUDIENCES.map(({ key, icon }) => (
                <li key={key}>
                  <PublicIcon icon={icon} size={24} />
                  <strong>{t(`audience.${key}`)}</strong>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles.marqueeControl}
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {t(paused ? 'marqueeResume' : 'marqueePause')}
      </button>
    </div>
  )
}
