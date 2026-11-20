'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import styles from './loading-image.module.css'

type LoadingImageProps = ImageProps & {
  wrapperClassName?: string
}

export function LoadingImage({
  wrapperClassName,
  fill,
  alt,
  onLoad,
  onError,
  ...props
}: LoadingImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )

  return (
    <span
      className={[styles.wrapper, fill && styles.fill, wrapperClassName]
        .filter(Boolean)
        .join(' ')}
      data-image-status={status}
    >
      <Image
        {...props}
        fill={fill}
        alt={alt}
        loading={props.loading ?? 'lazy'}
        onLoad={(event) => {
          setStatus('loaded')
          onLoad?.(event)
        }}
        onError={(event) => {
          setStatus('error')
          console.error('Unable to load public site image:', props.src)
          onError?.(event)
        }}
      />
    </span>
  )
}
