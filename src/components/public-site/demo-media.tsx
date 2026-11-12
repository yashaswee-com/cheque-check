'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import styles from './landing.module.css'

export function DemoMedia({ kind }: { kind: 'video' | 'audio' }) {
  const t = useTranslations('PublicSite.landing')
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const isVideo = kind === 'video'

  async function togglePlayback() {
    const media = mediaRef.current
    if (!media) return
    if (!media.paused) {
      media.pause()
      return
    }
    setFailed(false)
    if (!started || media.error) {
      media.src = isVideo ? '/assets/ad.mp4' : '/assets/voice-reminder.mp3'
      setStarted(true)
    }
    try {
      await media.play()
    } catch {
      setFailed(true)
    }
  }

  const mediaProps = {
    ref: (element: HTMLMediaElement | null) => {
      mediaRef.current = element
    },
    controls: started,
    preload: 'none' as const,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onError: () => setFailed(true),
    'aria-label': t(isVideo ? 'videoTitle' : 'audioTitle'),
  }

  return (
    <div className={isVideo ? styles.videoPlayer : styles.audioPlayer}>
      {isVideo ? (
        <video
          {...mediaProps}
          width={720}
          height={1280}
          playsInline
          poster="/assets/demo-poster.jpg"
        >
          {t('mediaUnsupported')}
        </video>
      ) : (
        <audio {...mediaProps}>{t('mediaUnsupported')}</audio>
      )}
      {(!isVideo || !started || failed) && (
        <button
          type="button"
          className={styles.mediaPlay}
          onClick={togglePlayback}
          aria-label={t(
            isVideo ? 'videoPlay' : playing ? 'audioPause' : 'audioPlay',
          )}
        >
          <HugeiconsIcon
            icon={playing ? PauseIcon : PlayIcon}
            size={24}
            aria-hidden="true"
          />
          {!isVideo && <span>{t(playing ? 'audioPause' : 'audioPlay')}</span>}
        </button>
      )}
      {failed && (
        <p role="alert" className={styles.mediaError}>
          {t('mediaError')}
        </p>
      )}
    </div>
  )
}
