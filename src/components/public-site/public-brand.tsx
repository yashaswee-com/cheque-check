import { LoadingImage } from './loading-image'

export function PublicBrand() {
  return (
    <>
      <LoadingImage
        src="/android-chrome-192x192.png"
        width={32}
        height={32}
        alt=""
        wrapperClassName="public-brand-image"
      />
      <span>Cheque Check</span>
    </>
  )
}
