import { ImageResponse } from 'next/og'

export const alt = 'Cheque Check cheque management and reminder app'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background:
          'linear-gradient(135deg, #eff6ff 0%, #ffffff 52%, #e0f2fe 100%)',
        color: '#111827',
        padding: '72px 80px',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontSize: 34,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            background: '#0f6cbd',
            color: '#ffffff',
            fontSize: 38,
          }}
        >
          C
        </div>
        Cheque Check
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            maxWidth: 920,
            fontSize: 68,
            lineHeight: 1.06,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          Every business cheque. One place.
        </div>
        <div style={{ fontSize: 30, color: '#374151' }}>
          Records, phone-call reminders, AI scanning and reports
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          color: '#0f4c81',
          fontSize: 23,
          fontWeight: 600,
        }}
      >
        <span
          style={{
            border: '2px solid #93c5fd',
            borderRadius: 999,
            padding: '12px 20px',
            background: '#ffffff',
          }}
        >
          Free to start
        </span>
        <span
          style={{
            border: '2px solid #93c5fd',
            borderRadius: 999,
            padding: '12px 20px',
            background: '#ffffff',
          }}
        >
          No bank connection
        </span>
        <span
          style={{
            border: '2px solid #93c5fd',
            borderRadius: 999,
            padding: '12px 20px',
            background: '#ffffff',
          }}
        >
          English · Hindi · Hinglish
        </span>
      </div>
    </div>,
    size,
  )
}
