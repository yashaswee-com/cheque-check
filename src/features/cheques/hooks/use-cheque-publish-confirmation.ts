import { useRef, useState, type BaseSyntheticEvent } from 'react'

interface Options {
  step: number
  nextStep: () => void | Promise<void>
  accountId: string
  chequeNumber: string
  requiresConfirmation: boolean
  confirmDuplicate: (
    accountId: string,
    chequeNumber: string,
  ) => Promise<boolean>
  submit: (event?: BaseSyntheticEvent) => Promise<void>
}

export function useChequePublishConfirmation(options: Options) {
  const [acknowledgment, setAcknowledgment] = useState('')
  const pending = useRef(false)
  const key = `${options.accountId}:${options.chequeNumber}`

  async function handleSubmit(event: BaseSyntheticEvent) {
    if (options.step < 3) {
      event.preventDefault()
      await options.nextStep()
      return
    }
    if (!options.requiresConfirmation) {
      await options.submit(event)
      return
    }
    event.preventDefault()
    if (acknowledgment !== key || pending.current) return
    pending.current = true
    try {
      if (
        await options.confirmDuplicate(options.accountId, options.chequeNumber)
      )
        await options.submit()
    } finally {
      pending.current = false
    }
  }

  return {
    confirmed: acknowledgment === key,
    setConfirmed: (checked: boolean) => setAcknowledgment(checked ? key : ''),
    handleSubmit,
  }
}
