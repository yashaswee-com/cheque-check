import { useEffect, useRef, useState } from 'react'
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { logger } from '@/lib/logger'
import { queryKeys } from '@/lib/query-keys'
import { ScanStore } from '@/lib/scan-store'
import { OCR_CONSENT_VERSION, type OcrField } from '../services/ocr-contract'
import {
  isScanPending,
  ScanCandidatesSchema,
  ScanJobSchema,
  ScanEntitySchema,
  ScanAcknowledgmentSchema,
  type ScanJob,
  type ScanCandidates,
} from '@/validators/cheque-scan'
import { scanRequest, ScanRequestError } from '../services/scan-client'
import type { Account, Bank, Party, ChequeFormValues } from '@/types'

interface UnmatchedEntities {
  payee_name?: string
  account_name?: string
  account_number?: string
  ifsc_code?: string
  bank_name?: string
  bank_id?: string
}
interface Options {
  businessId: string | undefined
  imageUrlParam: string | null
  parties: Party[] | undefined
  accounts: Account[] | undefined
  banks: Bank[] | undefined
  watch: UseFormWatch<ChequeFormValues>
  setValue: UseFormSetValue<ChequeFormValues>
  handleImageUpload: (file: File) => Promise<string | null>
  isLoadingDraft: boolean
  isUploading?: boolean
  aiScanEnabled: boolean | undefined
}
const editable = [
  'amount',
  'cheque_number',
  'cheque_date',
  'party_id',
  'account_id',
] as const
type Editable = (typeof editable)[number]
type Snapshot = Pick<ChequeFormValues, Editable>

export function useOcrExtraction(options: Options) {
  const {
    businessId,
    watch,
    setValue,
    aiScanEnabled,
    isLoadingDraft,
    imageUrlParam,
  } = options
  const t = useTranslations('Ocr')
  const queryClient = useQueryClient()
  const [job, setJob] = useState<ScanJob | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isCreatingInline, setIsCreatingInline] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [needsConsent, setNeedsConsent] = useState(false)
  const [candidates, setCandidates] = useState<ScanCandidates>({
    parties: [],
    accounts: [],
  })
  const [unmatchedEntities, setUnmatchedEntities] =
    useState<UnmatchedEntities | null>(null)
  const [createOptions, setCreateOptions] = useState({
    party: false,
    account: false,
  })
  const [partyContact, setPartyContact] = useState('')
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [applied, setApplied] = useState(false)
  const current = useRef(options)
  useEffect(() => {
    current.current = options
  })
  const mounted = useRef(true)
  const generation = useRef(0)
  const snapshot = useRef<Snapshot | null>(null)
  const attempt = useRef<{ image: string; key: string } | null>(null)
  const activeJob = useRef<ScanJob | null>(null)
  const processedParam = useRef<string | null>(null)
  const recoveredImage = useRef<string | null>(null)
  const activeImage = watch('image_url')
  const mode = watch('type')

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function report(error: unknown) {
    if (!mounted.current) return
    const code =
      error instanceof ScanRequestError ? error.code : 'SCAN_UNAVAILABLE'
    setErrorCode(code)
    if (code === 'CONSENT_REQUIRED') setNeedsConsent(true)
    logger.error('ocr.client.failed', undefined, { code })
  }
  function capture() {
    snapshot.current = {
      amount: watch('amount'),
      cheque_number: watch('cheque_number'),
      cheque_date: watch('cheque_date'),
      party_id: watch('party_id'),
      account_id: watch('account_id'),
    }
  }
  function canApply(result: ScanJob) {
    return (
      mounted.current &&
      current.current.businessId === result.business_id &&
      current.current.watch('image_url') === result.image_url &&
      current.current.watch('type') === result.mode
    )
  }
  function applyFields(result: ScanJob, fields: OcrField[]) {
    if (!result.details || !canApply(result)) return
    for (const field of ['amount', 'cheque_number', 'cheque_date'] as const) {
      if (
        !fields.includes(field) ||
        result.details[field] === null ||
        current.current.watch(field) !== snapshot.current?.[field]
      )
        continue
      if (field === 'amount')
        setValue(field, result.details.amount!, {
          shouldDirty: true,
          shouldValidate: true,
        })
      else
        setValue(field, result.details[field]!, {
          shouldDirty: true,
          shouldValidate: true,
        })
    }
    setApplied(true)
  }
  async function loadCandidates(result: ScanJob) {
    const matches = await scanRequest(
      { action: 'candidates', jobId: result.id },
      ScanCandidatesSchema,
    )
    if (!canApply(result)) return
    setCandidates(matches)
    const exact = matches.accounts.filter((account) => account.exact)
    if (
      exact.length === 1 &&
      watch('account_id') === snapshot.current?.account_id
    ) {
      setValue('account_id', exact[0].id, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }
  async function receive(result: ScanJob) {
    if (!canApply(result)) return
    activeJob.current = result
    setJob(result)
    if (
      ['ready_high', 'ready_partial', 'accepted_partial'].includes(
        result.status,
      )
    ) {
      if (result.status === 'ready_high') {
        applyFields(result, ['amount', 'cheque_number', 'cheque_date'])
      }
      await loadCandidates(result)
    }
  }
  async function poll(result: ScanJob, token: number) {
    let next = result
    while (
      isScanPending(next) &&
      generation.current === token &&
      mounted.current
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      if (generation.current !== token || !mounted.current) return
      const read = await scanRequest(
        { action: 'read', imageUrl: next.image_url },
        ScanJobSchema.nullable(),
      )
      if (!read) throw new ScanRequestError('IMAGE_NOT_FOUND')
      next = read
      if (!canApply(next)) return
      activeJob.current = next
      setJob(next)
    }
    if (generation.current === token) await receive(next)
  }
  async function run(url: string, recover: boolean) {
    const ctx = current.current
    if (
      !ctx.businessId ||
      ctx.isLoadingDraft ||
      ctx.aiScanEnabled !== true ||
      !url
    )
      return
    const token = ++generation.current
    setErrorCode(null)
    setApplied(false)
    setCandidates({ parties: [], accounts: [] })
    setUnmatchedEntities(null)
    capture()
    setIsExtracting(true)
    try {
      let result: ScanJob | null
      if (recover) {
        result = await scanRequest(
          { action: 'read', imageUrl: url },
          ScanJobSchema.nullable(),
        )
        // Recovery never overwrites populated fields, including edits from another device.
        if (snapshot.current) {
          snapshot.current = {
            ...snapshot.current,
            amount: 0,
            cheque_number: '',
            cheque_date: '',
            party_id: '',
            account_id: '',
          }
        }
      } else {
        if (attempt.current?.image !== url)
          attempt.current = { image: url, key: crypto.randomUUID() }
        result = await scanRequest(
          {
            action: 'start',
            imageUrl: url,
            key: attempt.current.key,
            mode: ctx.watch('type'),
            consent: OCR_CONSENT_VERSION,
          },
          ScanJobSchema,
        )
      }
      if (generation.current !== token || !mounted.current) return
      if (result) {
        activeJob.current = result
        setJob(result)
        await poll(result, token)
      }
    } catch (error) {
      if (generation.current === token) report(error)
    } finally {
      if (generation.current === token && mounted.current)
        setIsExtracting(false)
    }
  }
  const extractData = async (url: string) => {
    if (!url) return
    recoveredImage.current = url
    setValue('image_url', url, { shouldDirty: true })
    await run(url, false)
  }
  async function retry() {
    const url = watch('image_url')
    if (!url) return
    // Unknown request outcomes reuse their key; only a known terminal scan starts a new attempt.
    if (activeJob.current && !isScanPending(activeJob.current))
      attempt.current = null
    await run(url, false)
  }
  async function recover() {
    const url = watch('image_url')
    if (url) await run(url, true)
  }
  async function acknowledgeConsent() {
    try {
      await scanRequest(
        { action: 'consent', version: OCR_CONSENT_VERSION },
        ScanAcknowledgmentSchema,
      )
      setNeedsConsent(false)
      await retry()
    } catch (error) {
      report(error)
    }
  }
  async function cancel() {
    const latest = activeJob.current
    generation.current++
    setIsExtracting(false)
    setNeedsConsent(false)
    setErrorCode(null)
    if (!latest) return
    try {
      await receive(
        await scanRequest(
          { action: 'cancel', jobId: latest.id },
          ScanJobSchema,
        ),
      )
    } catch (error) {
      report(error)
    }
  }
  async function accept(fields: OcrField[]) {
    if (!job || !canApply(job)) return
    if (
      !['amount', 'cheque_number', 'cheque_date'].some(
        (field) =>
          fields.includes(field as OcrField) &&
          job.details?.[field as 'amount' | 'cheque_number' | 'cheque_date'] !==
            null &&
          job.reliability?.[field]?.reason === 'clear',
      )
    )
      return
    setIsExtracting(true)
    try {
      const accepted =
        job.status === 'ready_partial'
          ? await scanRequest(
              { action: 'accept', jobId: job.id },
              ScanJobSchema,
            )
          : job
      if (!canApply(accepted)) return
      setJob(accepted)
      activeJob.current = accepted
      if (!['accepted_partial', 'ready_high'].includes(accepted.status)) {
        setErrorCode(
          accepted.status === 'expired_review'
            ? 'REVIEW_EXPIRED'
            : 'SCAN_NOT_READY',
        )
        return
      }
      applyFields(accepted, fields)
      queryClient.invalidateQueries({
        queryKey: queryKeys.premiumWorkspace.all(),
      })
    } catch (error) {
      report(error)
    } finally {
      setIsExtracting(false)
    }
  }
  async function chooseParty(id: string) {
    if (!job || !canApply(job)) return
    try {
      await scanRequest(
        { action: 'confirm-party', jobId: job.id, partyId: id },
        ScanAcknowledgmentSchema,
      )
      if (canApply(job))
        setValue('party_id', id, { shouldDirty: true, shouldValidate: true })
    } catch (error) {
      report(error)
    }
  }
  async function remap() {
    if (!job || !mounted.current) return
    try {
      const updated = await scanRequest(
        { action: 'remap', jobId: job.id, mode: watch('type') },
        ScanJobSchema,
      )
      capture()
      setApplied(false)
      setUnmatchedEntities(null)
      await receive(updated)
    } catch (error) {
      report(error)
    }
  }
  async function confirmDuplicate(accountId: string, chequeNumber: string) {
    if (!job || !canApply(job)) return false
    try {
      await scanRequest(
        { action: 'confirm-duplicate', jobId: job.id, accountId, chequeNumber },
        ScanAcknowledgmentSchema,
      )
      return true
    } catch (error) {
      report(error)
      toast.add({ title: t('errors.SCAN_UNAVAILABLE'), type: 'error' })
      return false
    }
  }
  function chooseAccount(id: string) {
    if (job && canApply(job))
      setValue('account_id', id, { shouldDirty: true, shouldValidate: true })
  }
  function openCreate() {
    if (!job?.details || !canApply(job)) return
    const details = job.details
    setUnmatchedEntities({
      payee_name:
        (mode === 'Inward' ? details.account_name : details.payee_name) ??
        undefined,
      account_name:
        mode === 'Outward' ? (details.account_name ?? undefined) : undefined,
      account_number:
        mode === 'Outward' ? (details.account_number ?? undefined) : undefined,
      ifsc_code:
        mode === 'Outward' ? (details.ifsc_code ?? undefined) : undefined,
      bank_name:
        mode === 'Outward' ? (details.bank_name ?? undefined) : undefined,
    })
    setCreateOptions({ party: false, account: false })
    setDuplicateWarning(false)
    setAllowDuplicate(false)
  }
  async function handleInlineCreate() {
    if (!job || !canApply(job) || isCreatingInline) return
    setIsCreatingInline(true)
    try {
      for (const kind of ['party', 'account'] as const) {
        if (!createOptions[kind]) continue
        const entity = await scanRequest(
          {
            action: 'create',
            jobId: job.id,
            kind,
            contact: partyContact || null,
            bankId: unmatchedEntities?.bank_id ?? null,
            allowDuplicate,
          },
          ScanEntitySchema,
        )
        if (!canApply(job)) return
        setValue(kind === 'party' ? 'party_id' : 'account_id', entity.id, {
          shouldDirty: true,
          shouldValidate: true,
        })
        setCreateOptions((previous) => ({ ...previous, [kind]: false }))
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.parties.list(businessId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.accounts.list(businessId),
        }),
      ])
      setUnmatchedEntities(null)
      await loadCandidates(job)
      toast.add({ title: t('created'), type: 'success' })
    } catch (error) {
      if (
        error instanceof ScanRequestError &&
        error.code === 'DUPLICATE_ENTITY'
      )
        setDuplicateWarning(true)
      report(error)
    } finally {
      setIsCreatingInline(false)
    }
  }

  useEffect(() => {
    if (!businessId || isLoadingDraft || aiScanEnabled === undefined) return
    const file = ScanStore.getFile()
    if (file)
      void (async () => {
        try {
          const url = await current.current.handleImageUpload(file)
          if (url && mounted.current) await extractData(url)
        } catch (error) {
          report(error)
        }
      })()
    // The pending file is a one-shot handoff, not a reactive scan trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isLoadingDraft, aiScanEnabled])
  useEffect(() => {
    if (
      imageUrlParam &&
      aiScanEnabled !== undefined &&
      processedParam.current !== imageUrlParam
    ) {
      processedParam.current = imageUrlParam
      void extractData(imageUrlParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrlParam, aiScanEnabled])
  useEffect(() => {
    if (
      !isLoadingDraft &&
      !options.isUploading &&
      aiScanEnabled === true &&
      activeImage &&
      recoveredImage.current !== activeImage
    ) {
      recoveredImage.current = activeImage
      void run(activeImage, true)
    }
    if (!activeImage) {
      generation.current++
      activeJob.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeImage,
    isLoadingDraft,
    options.isUploading,
    aiScanEnabled,
    businessId,
  ])
  useEffect(() => {
    if (!errorCode) return
    const reconnect = () => {
      const url = current.current.watch('image_url')
      if (url) void run(url, true)
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
    // Reconnect only changes transport state; never starts another paid scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCode])

  return {
    job:
      activeImage === job?.image_url && businessId === job?.business_id
        ? job
        : null,
    candidates,
    errorCode,
    needsConsent,
    applied,
    modeMismatch: !!job && job.mode !== mode,
    isExtracting: !!activeImage && isExtracting,
    unmatchedEntities: activeImage ? unmatchedEntities : null,
    setUnmatchedEntities,
    createOptions,
    setCreateOptions,
    isCreatingInline,
    extractData,
    handleInlineCreate,
    retry,
    recover,
    cancel,
    acknowledgeConsent,
    accept,
    chooseParty,
    chooseAccount,
    openCreate,
    partyContact,
    setPartyContact,
    allowDuplicate,
    setAllowDuplicate,
    duplicateWarning,
    remap,
    confirmDuplicate,
  }
}
