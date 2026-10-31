import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Input } from './input'

const speech = vi.hoisted(() => ({
  transcript: '',
  listening: false,
  browserSupportsSpeechRecognition: true,
  resetTranscript: vi.fn(),
  startListening: vi.fn(),
  stopListening: vi.fn(),
}))
vi.mock('react-speech-recognition', () => ({
  default: speech,
  useSpeechRecognition: () => speech,
}))
beforeEach(() => {
  vi.clearAllMocks()
  speech.transcript = ''
  speech.listening = false
  speech.browserSupportsSpeechRecognition = true
})
afterEach(cleanup)

describe('Input', () => {
  it('forwards refs and typed changes', () => {
    const ref = createRef<HTMLInputElement>()
    const onChange = vi.fn()
    render(<Input ref={ref} aria-label="Name" onChange={onChange} />)
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Name' }))
    fireEvent.change(ref.current!, { target: { value: 'Asha' } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it.each(['password', 'number', 'email', 'date'])(
    'does not offer speech for %s inputs',
    (type) => {
      render(<Input type={type} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    },
  )

  it('hides speech controls when unsupported or explicitly disabled', () => {
    speech.browserSupportsSpeechRecognition = false
    const { rerender } = render(<Input />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    speech.browserSupportsSpeechRecognition = true
    rerender(<Input enableMic={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('starts, transfers, and stops the single speech-recognition session', () => {
    const { rerender, unmount } = render(
      <>
        <Input aria-label="First" />
        <Input aria-label="Second" />
      </>,
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(speech.resetTranscript).toHaveBeenCalledOnce()
    expect(speech.startListening).toHaveBeenCalledWith({ continuous: true })
    speech.listening = true
    speech.transcript = 'Asha'
    rerender(
      <>
        <Input aria-label="First" />
        <Input aria-label="Second" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'First' })).toHaveValue('Asha')
    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveValue('')
    fireEvent.click(buttons[1])
    expect(speech.startListening).toHaveBeenCalledTimes(2)
    fireEvent.click(buttons[1])
    expect(speech.stopListening).toHaveBeenCalledOnce()
    fireEvent.click(buttons[0])
    unmount()
    expect(speech.stopListening).toHaveBeenCalledTimes(2)
  })

  it('stops active recognition when focus leaves the input', () => {
    const { rerender } = render(<Input aria-label="Name" />)
    fireEvent.click(screen.getByRole('button'))
    speech.listening = true
    rerender(<Input aria-label="Name" />)
    fireEvent.blur(screen.getByRole('textbox'))
    expect(speech.stopListening).toHaveBeenCalledOnce()
  })
})
