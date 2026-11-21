'use client'

import { useId, useState } from 'react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import styles from './landing.module.css'

export function FaqItem({
  question,
  quickAnswer,
  answer,
}: {
  question: string
  quickAnswer: string
  answer: string
}) {
  const [expanded, setExpanded] = useState(false)
  const answerId = useId()

  return (
    <div className={styles.faqItem}>
      <h3>
        <button
          type="button"
          aria-label={`${question} ${quickAnswer}`}
          aria-expanded={expanded}
          aria-controls={answerId}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className={styles.faqQuestion}>{question}</span>
          <span className={styles.faqQuickAnswer}>{quickAnswer}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={20} aria-hidden="true" />
        </button>
      </h3>
      <div id={answerId} className={styles.faqAnswer} inert={!expanded}>
        <div>
          <p>{answer}</p>
        </div>
      </div>
    </div>
  )
}
