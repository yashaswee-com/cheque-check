import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountService,
  AccountService,
} from '@/features/accounts/services/account.service'
import {
  bankService,
  BankService,
} from '@/features/accounts/services/bank.service'
import {
  businessService,
  BusinessService,
} from '@/features/businesses/services/business.service'
import {
  chequeService,
  ChequeService,
} from '@/features/cheques/services/cheque.service'
import {
  partyService,
  PartyService,
} from '@/features/parties/services/party.service'
import { tagService, TagService } from '@/features/tags/services/tag.service'
import {
  profileService,
  ProfileService,
} from '@/features/profile/services/profile.service'
import {
  monetizationService,
  MonetizationService,
} from '@/features/monetization/services/monetization.service'
import { authService, AuthService } from '@/features/auth/services/auth.service'
import {
  reportService,
  ReportService,
} from '@/features/reports/services/report.service'
import { BrowserReportRepository } from '@/features/reports/repositories/report.repository'
import { getNpsService } from '@/features/feedback/services/nps.service'
import {
  accountDraftService,
  partyDraftService,
  chequeDraftService,
  ChequeDraftService,
} from '@/features/drafts/services/draft.service'
import type { IChequeDraftRepository } from '@/features/drafts/repositories/draft.repository'
import { storageService, StorageService } from './storage.service'
import type { IStorageRepository } from '@/repositories/storage.repository'
import type {
  Account,
  Business,
  ChequeWithRelations,
  Party,
  Tag,
} from '@/types'

const boundary = vi.hoisted(() => {
  const result = { data: null as unknown, error: null as unknown }
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: typeof result) => unknown) =>
      Promise.resolve(resolve({ ...result })),
    ),
  }
  const user = { id: 'user-1' }
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn(),
  }
  return {
    result,
    query,
    user,
    auth,
    from: vi.fn(() => query),
    rpc: vi.fn(() => query),
  }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: boundary.from,
    rpc: boundary.rpc,
    auth: boundary.auth,
  }),
}))

const timestamps = { created_at: '2026-10-01', updated_at: '2026-10-02' }
const account: Account = {
  ...timestamps,
  id: 'account-1',
  business_id: 'business-1',
  bank_id: 'bank-1',
  account_name: 'Main',
  account_number: '1234',
  ifsc_code: null,
  opening_balance: 0,
  is_default: false,
}
const party: Party = {
  ...timestamps,
  id: 'party-1',
  business_id: 'business-1',
  name: 'Acme',
  contact: '+919876543210',
  email: null,
  address: null,
  notes: null,
}
const business: Business = {
  ...timestamps,
  id: 'business-1',
  user_id: 'user-1',
  name: 'Shop',
  email: null,
  phone: null,
  address: null,
  logo_url: null,
}
const cheque: ChequeWithRelations = {
  ...timestamps,
  id: 'cheque-1',
  business_id: 'business-1',
  party_id: 'party-1',
  account_id: 'account-1',
  cheque_number: '123456',
  amount: 100,
  cheque_date: '2026-10-01',
  deposit_date: null,
  remind_before_days: null,
  type: 'Outward',
  status: 'Issued',
  notes: null,
  image_url: null,
}
const tag: Tag = {
  ...timestamps,
  id: 'tag-1',
  business_id: 'business-1',
  name: 'Urgent',
  color: '#ff0000',
}

beforeEach(() => {
  vi.clearAllMocks()
  boundary.result.data = []
  boundary.result.error = null
  boundary.auth.getUser.mockResolvedValue({
    data: { user: boundary.user },
    error: null,
  })
})

describe('lazy production services', () => {
  it('binds account, party and business methods to their cached real repositories', async () => {
    for (const [service, constructor, row] of [
      [accountService, AccountService, account],
      [partyService, PartyService, party],
      [businessService, BusinessService, business],
    ] as const) {
      expect(service).toBeInstanceOf(constructor)
      expect(Reflect.get(service, 'missingProperty')).toBeUndefined()
      boundary.result.data = row
      const getById = service.getById
      await expect(getById(row.id)).resolves.toEqual(row)
      expect(boundary.query.eq).toHaveBeenCalledWith('id', row.id)
      const remove = service.delete
      await expect(remove(row.id)).resolves.toBeUndefined()
      expect(boundary.rpc).toHaveBeenLastCalledWith(
        'lifecycle_delete',
        expect.objectContaining({ requested_id: row.id }),
      )
    }
    boundary.result.data = [account]
    await expect(accountService.getAll('business-1')).resolves.toEqual([
      account,
    ])
    boundary.result.data = account
    await expect(accountService.create(account)).resolves.toEqual(account)
    await accountService.update(account.id, { account_name: 'Edited' })
    expect(boundary.query.update).toHaveBeenLastCalledWith({
      account_name: 'Edited',
    })
    boundary.result.data = [party]
    await expect(partyService.getAll('business-1')).resolves.toEqual([party])
    boundary.result.data = party
    await expect(partyService.create(party)).resolves.toEqual(party)
    await partyService.update(party.id, { name: 'Edited' })
    expect(boundary.query.update).toHaveBeenLastCalledWith({ name: 'Edited' })
    boundary.result.data = [business]
    await expect(businessService.getAll()).resolves.toEqual([business])
    boundary.result.data = business
    await expect(businessService.create(business)).resolves.toEqual(business)
    await businessService.update(business.id, { name: 'Edited' })
    boundary.result.error = { message: 'Persistence unavailable' }
    await expect(accountService.getById(account.id)).rejects.toThrow(
      'Persistence unavailable',
    )
    await expect(partyService.getById(party.id)).rejects.toThrow(
      'Persistence unavailable',
    )
    await expect(businessService.getAll()).rejects.toThrow(
      'Persistence unavailable',
    )
  })

  it('initializes the bank proxy once, trims names and delegates lifecycle deletion', async () => {
    expect(bankService).toBeInstanceOf(BankService)
    expect(Reflect.get(bankService, 'missingProperty')).toBeUndefined()
    const getAll = bankService.getAll
    await expect(getAll()).resolves.toEqual([])
    boundary.result.data = { id: 'bank-1', name: 'Private Bank' }
    const create = bankService.create
    await expect(create('  Private Bank  ')).resolves.toEqual(
      boundary.result.data,
    )
    expect(boundary.query.insert).toHaveBeenLastCalledWith({
      name: 'Private Bank',
      owner_id: 'user-1',
      category: 'custom',
    })
    await bankService.delete('bank-1')
    expect(boundary.rpc).toHaveBeenLastCalledWith('delete_private_bank', {
      requested_id: 'bank-1',
    })
  })

  it('maps rows through bound cheque methods and preserves requested changes', async () => {
    expect(chequeService).toBeInstanceOf(ChequeService)
    expect(Reflect.get(chequeService, 'missingProperty')).toBeUndefined()
    boundary.result.data = [cheque]
    const getAll = chequeService.getAll
    const rows = await getAll('business-1')
    expect(rows[0].toJSON()).toEqual(cheque)
    boundary.result.data = cheque
    const getById = chequeService.getById
    expect((await getById(cheque.id)).toJSON()).toEqual(cheque)
    expect((await chequeService.create(cheque)).toJSON()).toEqual(cheque)
    expect(
      (await chequeService.update(cheque.id, { notes: 'Edited' })).id,
    ).toBe(cheque.id)
    expect(boundary.query.update).toHaveBeenLastCalledWith({ notes: 'Edited' })
    await chequeService.updateStatus(cheque.id, 'Cleared')
    expect(boundary.query.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Cleared' }),
    )
    await chequeService.delete(cheque.id)
    expect(boundary.rpc).toHaveBeenLastCalledWith('lifecycle_delete', {
      requested_table: 'cheques',
      requested_id: cheque.id,
    })
  })

  it('delegates profile reads/updates and local cleanup through the real default repository', async () => {
    expect(profileService).toBeInstanceOf(ProfileService)
    expect(Reflect.get(profileService, 'missingProperty')).toBeUndefined()
    boundary.result.data = { id: 'profile-1', name: 'Owner' }
    const get = profileService.get
    await expect(get()).resolves.toEqual(boundary.result.data)
    await expect(profileService.update({ name: 'Edited' })).resolves.toEqual(
      boundary.result.data,
    )
    expect(boundary.query.update).toHaveBeenLastCalledWith({ name: 'Edited' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, providerCleanup: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(profileService.delete()).resolves.toEqual({
        providerCleanup: false,
      })
      expect(fetchMock).toHaveBeenCalledWith('/api/account/deactivate', {
        method: 'POST',
      })
      expect(boundary.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('binds all monetization reads to the authenticated user', async () => {
    expect(monetizationService).toBeInstanceOf(MonetizationService)
    expect(Reflect.get(monetizationService, 'missingProperty')).toBeUndefined()
    for (const method of [
      'getEntitlements',
      'getQuotas',
      'getTransactions',
    ] as const) {
      const read = monetizationService[method]
      await expect(read()).resolves.toEqual([])
      expect(boundary.query.eq).toHaveBeenCalledWith('user_id', 'user-1')
    }
    boundary.result.error = { message: 'Entitlements unavailable' }
    await expect(monetizationService.getEntitlements()).rejects.toThrow(
      'Entitlements unavailable',
    )
  })

  it('exposes every tag operation and groups/sorts entity tags without mixing entities', async () => {
    expect(tagService).toBeInstanceOf(TagService)
    expect(Reflect.get(tagService, 'missingProperty')).toBeUndefined()
    boundary.result.data = [tag]
    await expect(tagService.getAll('business-1')).resolves.toEqual([tag])
    boundary.result.data = [{ ...tag, entity_tags: [] }]
    await expect(tagService.getAllWithUsage('business-1')).resolves.toEqual([
      { ...tag, usage_count: 0 },
    ])
    boundary.result.data = tag
    const getById = tagService.getById
    await expect(getById(tag.id)).resolves.toEqual(tag)
    const input = {
      business_id: tag.business_id,
      name: tag.name,
      color: tag.color,
    }
    await expect(tagService.create(input)).resolves.toEqual(tag)
    expect(boundary.query.insert).toHaveBeenLastCalledWith([input])
    await tagService.update(tag.id, { color: '#000000' })
    expect(boundary.query.update).toHaveBeenLastCalledWith({ color: '#000000' })
    const link = {
      tag_id: tag.id,
      entity_type: 'party' as const,
      entity_id: party.id,
    }
    boundary.result.data = [link]
    await expect(tagService.getLinks(tag.id)).resolves.toEqual([link])
    boundary.result.data = [{ tag }]
    await expect(tagService.getForEntity('party', party.id)).resolves.toEqual([
      tag,
    ])
    await tagService.attach(link)
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'lifecycle_set_tag',
      expect.objectContaining({ requested_attached: true }),
    )
    await tagService.detach(link)
    expect(boundary.rpc).toHaveBeenLastCalledWith(
      'lifecycle_set_tag',
      expect.objectContaining({ requested_attached: false }),
    )
    await tagService.delete(tag.id)
    expect(boundary.rpc).toHaveBeenLastCalledWith('lifecycle_delete', {
      requested_table: 'tags',
      requested_id: tag.id,
    })
    const alpha = { ...tag, id: 'alpha', name: 'Alpha' }
    boundary.result.data = [
      { entity_id: 'p1', tag },
      { entity_id: 'p1', tag: alpha },
      { entity_id: 'p2', tag },
    ]
    await expect(tagService.getTagMap('business-1', 'party')).resolves.toEqual({
      p1: [alpha, tag],
      p2: [tag],
    })
    boundary.result.data = []
    await expect(tagService.getTagMap(null, 'party')).resolves.toEqual({})
  })

  it('initializes the default NPS service once and delegates feedback', async () => {
    const service = getNpsService()
    expect(getNpsService()).toBe(service)
    boundary.result.data = null
    await expect(service.shouldPrompt()).resolves.toBe(true)
    await service.submit({
      score: 10,
      comment: ' Great ',
      businessId: 'business-1',
      chequeId: null,
    })
    expect(boundary.query.insert).toHaveBeenLastCalledWith({
      score: 10,
      comment: 'Great',
      business_id: 'business-1',
      cheque_id: null,
    })
  })
})

describe('default auth service', () => {
  it('binds password, OAuth, session and auth-state delegation', async () => {
    expect(authService).toBeInstanceOf(AuthService)
    expect(Reflect.get(authService, 'missingProperty')).toBeUndefined()
    const login = authService.loginWithPassword
    await login('owner@example.test', 'password')
    expect(boundary.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.test',
      password: 'password',
    })
    await authService.signupWithPassword(
      'owner@example.test',
      'password',
      'Owner',
    )
    expect(boundary.auth.signUp).toHaveBeenCalledWith({
      email: 'owner@example.test',
      password: 'password',
      options: { data: { name: 'Owner' } },
    })
    await authService.loginWithOAuth('google')
    expect(boundary.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    await authService.resetPassword('owner@example.test')
    expect(boundary.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'owner@example.test',
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings/password`,
      },
    )
    await expect(authService.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    })
    const callback = vi.fn()
    authService.onAuthStateChange(callback)
    expect(boundary.auth.onAuthStateChange).toHaveBeenCalledWith(callback)
    await authService.signOut()
    expect(boundary.auth.signOut).toHaveBeenCalledWith()
  })

  it('unwraps users, treats missing sessions as signed out and propagates other auth failures', async () => {
    await expect(authService.getUser()).resolves.toEqual(boundary.user)
    boundary.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    })
    await expect(authService.getUser()).resolves.toBeNull()
    const error = new Error('Provider unavailable')
    boundary.auth.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(authService.getUser()).rejects.toBe(error)
  })

  it('forwards phone OTP request payloads and returns provider responses unchanged', async () => {
    const response = { ok: false, status: 429, code: 'rate_limited' }
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const send = {
        phone: '+919876543210',
        purpose: 'login' as const,
        captchaToken: 'captcha',
      }
      await expect(authService.sendPhoneOtp(send)).resolves.toEqual(response)
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/auth/phone/send',
        expect.objectContaining({ body: JSON.stringify(send) }),
      )
      const verify = {
        phone: send.phone,
        token: '123456',
        purpose: 'login' as const,
      }
      await expect(authService.verifyPhoneOtp(verify)).resolves.toEqual(
        response,
      )
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/auth/phone/verify',
        expect.objectContaining({ body: JSON.stringify(verify) }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('default draft services', () => {
  it('binds all inherited operations and initializes each lazy default repository', async () => {
    for (const service of [
      accountDraftService,
      partyDraftService,
      chequeDraftService,
    ]) {
      expect(Reflect.get(service, 'missingProperty')).toBeUndefined()
      boundary.result.data = []
      const list = service.list
      await expect(list('business-1')).resolves.toEqual([])
      expect(boundary.query.eq).toHaveBeenCalledWith('is_draft', true)
      boundary.result.data = { id: 'draft-1' }
      await expect(service.getById('draft-1')).resolves.toEqual({
        id: 'draft-1',
      })
      await expect(service.create('business-1', {})).resolves.toEqual({
        id: 'draft-1',
      })
      expect(boundary.query.insert).toHaveBeenLastCalledWith([
        { business_id: 'business-1', is_draft: true },
      ])
      await service.update('draft-1', {})
      expect(boundary.query.update).toHaveBeenLastCalledWith({
        updated_at: expect.any(String),
      })
      await service.delete('draft-1')
      expect(boundary.rpc).toHaveBeenLastCalledWith(
        'lifecycle_delete',
        expect.objectContaining({ requested_id: 'draft-1' }),
      )
    }
    boundary.result.data = { id: 'copied' }
    await expect(chequeDraftService.duplicate('source')).resolves.toEqual({
      id: 'copied',
    })
    expect(boundary.rpc).toHaveBeenLastCalledWith('duplicate_cheque_draft', {
      requested_cheque: 'source',
    })
  })

  it('rejects duplication when an injected repository has no duplicate implementation', () => {
    const repository = {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      publish: vi.fn(),
      hasNumberConflict: vi.fn(),
    } satisfies IChequeDraftRepository
    expect(() =>
      new ChequeDraftService(repository).duplicate('source'),
    ).toThrow('Duplicate operation unavailable')
    expect(repository.create).not.toHaveBeenCalled()
  })
})

describe('remaining service exports', () => {
  it('binds default report methods and supplies format-specific default filenames', async () => {
    const csv = vi
      .spyOn(BrowserReportRepository.prototype, 'exportToCSV')
      .mockResolvedValue(undefined)
    const json = vi
      .spyOn(BrowserReportRepository.prototype, 'exportToJSON')
      .mockResolvedValue(undefined)
    const pdf = vi
      .spyOn(BrowserReportRepository.prototype, 'exportToPDF')
      .mockResolvedValue(undefined)
    const excel = vi
      .spyOn(BrowserReportRepository.prototype, 'exportToExcel')
      .mockResolvedValue(undefined)
    try {
      expect(reportService).toBeInstanceOf(ReportService)
      expect(Reflect.get(reportService, 'missingProperty')).toBeUndefined()
      const exportCSV = reportService.exportToCSV
      await exportCSV([])
      await reportService.exportToJSON([])
      await reportService.exportToPDF([])
      await reportService.exportToExcel([])
      expect(csv).toHaveBeenCalledWith([], 'cheques_report.csv')
      expect(json).toHaveBeenCalledWith([], 'cheques_report.json')
      expect(pdf).toHaveBeenCalledWith([], 'cheques_report.pdf')
      expect(excel).toHaveBeenCalledWith([], 'cheques_report.xlsx')
    } finally {
      csv.mockRestore()
      json.mockRestore()
      pdf.mockRestore()
      excel.mockRestore()
    }
  })

  it('delegates avatar upload and media unlinking and propagates storage errors', async () => {
    const repository = {
      uploadChequeImage: vi.fn(),
      uploadAvatar: vi.fn().mockResolvedValue('/avatar'),
      deleteAvatar: vi.fn().mockResolvedValue(undefined),
      deleteChequeImage: vi.fn().mockResolvedValue(undefined),
    } satisfies IStorageRepository
    const service = new StorageService(repository)
    const file = new File(['image'], 'avatar.jpg', { type: 'image/jpeg' })
    await expect(service.uploadAvatar(file)).resolves.toBe('/avatar')
    expect(repository.uploadAvatar).toHaveBeenCalledWith(file)
    await service.deleteAvatar('/avatar')
    await service.deleteChequeImage('/cheque')
    expect(repository.deleteAvatar).toHaveBeenCalledWith('/avatar')
    expect(repository.deleteChequeImage).toHaveBeenCalledWith('/cheque')
    repository.uploadAvatar.mockRejectedValue(new Error('Storage unavailable'))
    await expect(service.uploadAvatar(file)).rejects.toThrow(
      'Storage unavailable',
    )
    await expect(
      storageService.deleteAvatar('/retained'),
    ).resolves.toBeUndefined()
    await expect(
      storageService.deleteChequeImage('/retained'),
    ).resolves.toBeUndefined()
  })
})
