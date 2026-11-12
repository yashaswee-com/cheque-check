import Image from 'next/image'

export function PublicBrand() {
  return (
    <>
      <Image src="/android-chrome-192x192.png" width={32} height={32} alt="" />
      <span>Cheque Check</span>
    </>
  )
}
