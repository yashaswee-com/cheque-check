import { useEffect, useReducer, useRef } from 'react'
import type { SetStateAction } from 'react'
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { logger } from '@/lib/logger'
import { queryKeys } from '@/lib/query-keys'
import { ScanStore } from '@/lib/scan-store'
import { OCR_CONSENT_VERSION, type OcrField } from '../services/ocr-contract'
import {
  canApplyOcrResult,
  getOcrFieldUpdates,
  getUniqueExactAccountId,
  type OcrFieldSnapshot,
} from '../services/ocr-field-policy'
import { pollScanJob } from '../services/ocr-poller'
import {
  isScanPending,
  ScanCandidatesSchema,
  ScanJobSchema,
  ScanEntitySchema,
  ScanAcknowledgmentSchema,
  type ScanJob,
} from '@/validators/cheque-scan'
import { scanRequest, ScanRequestError } from '../services/scan-client'
import {
  initialOcrExtractionState,
  ocrExtractionReducer,
  type OcrExtractionState,
  type OcrUnmatchedEntities,
} from './use-ocr-extraction.reducer'
import type { Account, Bank, Party, ChequeFormValues } from '@/types'

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
type Snapshot = OcrFieldSnapshot

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
  const [state, dispatch] = useReducer(
    ocrExtractionReducer,
    initialOcrExtractionState,
  )
  const {
    job,
    isExtracting,
    isCreatingInline,
    errorCode,
    needsConsent,
    candidates,
    unmatchedEntities,
    createOptions,
    partyContact,
    allowDuplicate,
    duplicateWarning,
    applied,
  } = state
  function setOcrState<K extends keyof OcrExtractionState>(
    key: K,
    value: SetStateAction<OcrExtractionState[K]>,
  ) {
    dispatch({
      type: 'update',
      update: (previous) => ({
        ...previous,
        [key]: typeof value === 'function' ? value(previous[key]) : value,
      }),
    })
  }
  const setUnmatchedEntities = (
    value: SetStateAction<OcrUnmatchedEntities | null>,
  ) => setOcrState('unmatchedEntities', value)
  const setCreateOptions = (
    value: SetStateAction<OcrExtractionState['createOptions']>,
  ) => setOcrState('createOptions', value)
  const setPartyContact = (value: SetStateAction<string>) =>
    setOcrState('partyContact', value)
  const setAllowDuplicate = (value: SetStateAction<boolean>) =>
    setOcrState('allowDuplicate', value)
  const current = useRef(options)
  useEffect(() => {
    current.current = options
  })
  const mounted = useRef(true)
  const generation = useRef(0)
  const snapshot = useRef<Snapshot | null>(null)
  const pollController = useRef<AbortController | null>(null)
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
      pollController.current?.abort()
    }
  }, [])

  function report(error: unknown) {
    if (!mounted.current) return
    const code =
      error instanceof ScanRequestError ? error.code : 'SCAN_UNAVAILABLE'
    setOcrState('errorCode', code)
    if (code === 'CONSENT_REQUIRED') setOcrState('needsConsent', true)
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
    return canApplyOcrResult(result, {
      mounted: mounted.current,
      businessId: current.current.businessId,
      imageUrl: current.current.watch('image_url'),
      mode: current.current.watch('type'),
    })
  }
  function applyFields(result: ScanJob, fields: OcrField[]) {
    if (!result.details || !canApply(result)) return
    const updates = getOcrFieldUpdates(result, fields, snapshot.current, {
      amount: current.current.watch('amount'),
      cheque_number: current.current.watch('cheque_number'),
      cheque_date: current.current.watch('cheque_date'),
      party_id: current.current.watch('party_id'),
      account_id: current.current.watch('account_id'),
    })
    if (updates.amount !== undefined)
      setValue('amount', updates.amount, {
        shouldDirty: true,
        shouldValidate: true,
      })
    if (updates.cheque_number !== undefined)
      setValue('cheque_number', updates.cheque_number, {
        shouldDirty: true,
        shouldValidate: true,
      })
    if (updates.cheque_date !== undefined)
      setValue('cheque_date', updates.cheque_date, {
        shouldDirty: true,
        shouldValidate: true,
      })
    setOcrState('applied', true)
  }
  async function loadCandidates(result: ScanJob, token?: number) {
    const matches = await scanRequest(
      { action: 'candidates', jobId: result.id },
      ScanCandidatesSchema,
    )
    if (
      (token !== undefined && generation.current !== token) ||
      !canApply(result)
    )
      return
    setOcrState('candidates', matches)
    const exactAccountId = getUniqueExactAccountId(
      matches,
      snapshot.current,
      watch('account_id'),
    )
    if (exactAccountId) {
      setValue('account_id', exactAccountId, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }
  async function receive(result: ScanJob, token?: number) {
    if (
      (token !== undefined && generation.current !== token) ||
      !canApply(result)
    )
      return
    activeJob.current = result
    setOcrState('job', result)
    if (
      ['ready_high', 'ready_partial', 'accepted_partial'].includes(
        result.status,
      )
    ) {
      if (result.status === 'ready_high') {
        applyFields(result, ['amount', 'cheque_number', 'cheque_date'])
      }
      await loadCandidates(result, token)
    }
  }
  async function poll(
    result: ScanJob,
    token: number,
    controller: AbortController,
  ) {
    const next = await pollScanJob(result, {
      signal: controller.signal,
      isCurrent: (candidate) =>
        generation.current === token && canApply(candidate),
      onJob: (candidate) => {
        activeJob.current = candidate
        setOcrState('job', candidate)
      },
    })
    if (next && generation.current === token) await receive(next, token)
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
    pollController.current?.abort()
    const token = ++generation.current
    const controller = new AbortController()
    pollController.current = controller
    dispatch({ type: 'scan-started' })
    capture()
    try {
      let result: ScanJob | null
      if (recover) {
        result = await scanRequest(
          { action: 'read', imageUrl: url },
          ScanJobSchema.nullable(),
          controller.signal,
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
          controller.signal,
        )
      }
      if (
        generation.current !== token ||
        !mounted.current ||
        controller.signal.aborted
      )
        return
      if (result) {
        activeJob.current = result
        setOcrState('job', result)
        await poll(result, token, controller)
      }
    } catch (error) {
      if (generation.current === token && !controller.signal.aborted)
        report(error)
    } finally {
      if (generation.current === token && mounted.current) {
        setOcrState('isExtracting', false)
        if (pollController.current === controller) pollController.current = null
      }
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
    const token = generation.current
    try {
      await scanRequest(
        { action: 'consent', version: OCR_CONSENT_VERSION },
        ScanAcknowledgmentSchema,
      )
      if (!mounted.current || generation.current !== token) return
      setOcrState('needsConsent', false)
      await retry()
    } catch (error) {
      if (generation.current === token) report(error)
    }
  }
  async function cancel() {
    const latest = activeJob.current
    pollController.current?.abort()
    pollController.current = null
    generation.current++
    setOcrState('isExtracting', false)
    setOcrState('needsConsent', false)
    setOcrState('errorCode', null)
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
    setOcrState('isExtracting', true)
    try {
      const accepted =
        job.status === 'ready_partial'
          ? await scanRequest(
              { action: 'accept', jobId: job.id },
              ScanJobSchema,
            )
          : job
      if (!canApply(accepted)) return
      setOcrState('job', accepted)
      activeJob.current = accepted
      if (!['accepted_partial', 'ready_high'].includes(accepted.status)) {
        setOcrState(
          'errorCode',
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
      setOcrState('isExtracting', false)
    }
  }
  async function chooseParty(id: string) {
    if (!job || !canApply(job)) return
    setOcrState('errorCode', null)
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
    setOcrState('errorCode', null)
    try {
      const updated = await scanRequest(
        { action: 'remap', jobId: job.id, mode: watch('type') },
        ScanJobSchema,
      )
      capture()
      setOcrState('applied', false)
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
    setOcrState('errorCode', null)
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
    setOcrState('duplicateWarning', false)
    setOcrState('allowDuplicate', false)
  }
  async function handleInlineCreate() {
    if (!job || !canApply(job) || isCreatingInline) return
    setOcrState('errorCode', null)
    setOcrState('isCreatingInline', true)
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
        setOcrState('duplicateWarning', true)
      report(error)
    } finally {
      setOcrState('isCreatingInline', false)
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
      pollController.current?.abort()
      pollController.current = null
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
