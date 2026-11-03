import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import OnboardingPage from './onboarding/page'
import PreferencesPage from './(dashboard)/settings/preferences/page'
import NotificationsPage from './(dashboard)/settings/notifications/page'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  require: vi.fn(),
  celebrate: vi.fn(),
}))
let loading = false
let profile: Record<string, unknown> | null = null
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile,
    isLoading: loading,
    updateProfile: mocks.update,
  }),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ setActiveBusiness: mocks.activate }),
}))
vi.mock('@/features/businesses/services/business.service', () => ({
  businessService: { create: mocks.create },
}))
vi.mock('@/lib/celebrate', () => ({ celebrate: mocks.celebrate }))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/components/monitoring-preferences', () => ({
  MonitoringPreferences: () => <div>Monitoring preferences</div>,
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ requireAccess: mocks.require }),
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    path: () => <path />,
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}))
vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string
    onChange: (value: string) => void
    placeholder: string
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    options,
    value,
    onValueChange,
    testId,
  }: {
    options: Array<{ label: string; value: string }>
    value?: string
    onValueChange: (value: string) => void
    testId?: string
  }) => (
    <select
      data-testid={testId}
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/components/ui/editable-avatar', () => ({
  EditableAvatar: ({
    onUpload,
    onDelete,
  }: {
    onUpload: (url: string) => void
    onDelete: () => void
  }) => (
    <div>
      <button onClick={() => onUpload('business-logo')}>Upload logo</button>
      <button onClick={onDelete}>Remove logo</button>
    </div>
  ),
}))
vi.mock('@/features/profile/hooks/use-reminder-options', () => ({
  useReminderOptions: () => ({
    REMINDERS_PER_DAY_OPTIONS: [
      { label: 'One daily', value: '1' },
      { label: 'Twice daily', value: '2' },
    ],
    REMINDER_FREQUENCY_OPTIONS: [
      { label: 'Three days before', value: '3' },
      { label: 'Seven days before', value: '7' },
    ],
  }),
}))
function renderPage(page: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {page}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  loading = false
  profile = {
    id: 'profile',
    currency: '₹',
    language: 'en',
    date_format: 'dd/MM/yyyy',
    time_format: '12h',
    time_zone: 'Asia/Kolkata',
    reminders_per_day: 1,
    default_reminder_days: 3,
    reduce_motion: false,
    party_sms_enabled: false,
    voice_call_enabled: false,
    sms_enabled: false,
    push_enabled: false,
    whatsapp_enabled: false,
  }
  mocks.create.mockResolvedValue({ id: 'created', name: 'Acme' })
  mocks.update.mockResolvedValue(undefined)
  mocks.require.mockReturnValue(true)
  vi.stubGlobal('alert', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('onboarding page', () => {
  function reachFinalStep() {
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '+919876543210' } },
    )
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
  }
  it('keeps every brand color swatch on a single non-wrapping row', () => {
    renderPage(<OnboardingPage />)
    const row = screen.getByTestId('onboarding-brand-colors')
    expect(row).toHaveClass('flex-nowrap')
    expect(row).not.toHaveClass('flex-wrap')
    const swatches = row.querySelectorAll('button')
    expect(swatches).toHaveLength(7)
    swatches.forEach((swatch) =>
      expect(swatch).toHaveClass('size-10', 'shrink-0'),
    )
    fireEvent.click(swatches[1])
    expect(swatches[1]).toHaveAttribute('aria-pressed', 'true')
  })
  it('requires a business name and valid optional phone, while preserving values on back navigation', () => {
    renderPage(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-step1-continue')).toBeDisabled()
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '123' } },
    )
    expect(screen.getByTestId('onboarding-step3-continue')).toBeDisabled()
    expect(screen.getByTestId('onboarding-next-button')).toBeDisabled()
    expect(screen.getByText(messages.Common.invalidPhone)).toBeVisible()
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '+919876543210' } },
    )
    expect(screen.getByTestId('onboarding-step3-continue')).toBeEnabled()
    fireEvent.click(screen.getByTestId('onboarding-back-button'))
    fireEvent.click(screen.getByTestId('onboarding-back-button'))
    expect(screen.getByTestId('onboarding-business-name-input')).toHaveValue(
      'Acme',
    )
  })
  it('creates a business, activates it, persists selected preferences, and celebrates completion', async () => {
    renderPage(<OnboardingPage />)
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(
      document.querySelector('button[style*="background-color"]')!,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }))
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    const preferences = screen.getAllByRole('combobox')
    preferences.forEach((select) => {
      const option = (select as HTMLSelectElement).options[1]
      if (option) fireEvent.change(select, { target: { value: option.value } })
    })
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessEmailPlaceholder),
      { target: { value: 'acme@example.test' } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '+919876543210' } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.headquartersPlaceholder),
      { target: { value: 'Warehouse Road' } },
    )
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
    const reminders = screen.getAllByRole('combobox')
    fireEvent.change(reminders[0], { target: { value: '2' } })
    fireEvent.change(reminders[1], { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('onboarding-step4-finish'))
    await waitFor(() => expect(mocks.celebrate).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme',
        email: 'acme@example.test',
        phone: '+919876543210',
        address: 'Warehouse Road',
        logo_url: 'business-logo',
        color: expect.any(String),
      }),
    )
    expect(mocks.activate).toHaveBeenCalledWith({ id: 'created', name: 'Acme' })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reminders_per_day: 2,
        default_reminder_days: 7,
      }),
    )
    expect(screen.getByText(messages.Onboarding.allSet)).toBeVisible()
    fireEvent.click(screen.getByTestId('onboarding-enter-dashboard'))
    expect(mocks.push).toHaveBeenCalledWith('/dashboard')
  })
  it('reports failed business creation without updating profile or showing completion', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Business creation failed'))
    renderPage(<OnboardingPage />)
    reachFinalStep()
    fireEvent.click(screen.getByTestId('onboarding-step4-finish'))
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Business creation failed'),
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.celebrate).not.toHaveBeenCalled()
    expect(screen.getByTestId('onboarding-step4-finish')).toBeEnabled()
  })
  it('reports profile persistence failure after business activation and permits retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Preferences failed'))
    renderPage(<OnboardingPage />)
    reachFinalStep()
    fireEvent.click(screen.getByTestId('onboarding-step4-finish'))
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Preferences failed'),
    )
    expect(mocks.activate).toHaveBeenCalledOnce()
    expect(mocks.celebrate).not.toHaveBeenCalled()
  })

  it('creates a workspace without optional contact fields and reports unknown failures generically', async () => {
    mocks.create.mockRejectedValueOnce('offline')
    renderPage(<OnboardingPage />)

    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
    fireEvent.click(screen.getByTestId('onboarding-step4-finish'))

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(messages.Common.error),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme',
        email: null,
        phone: null,
        address: null,
      }),
    )
  })

  it('synchronizes onboarding defaults when the loaded profile changes', () => {
    profile = null
    const view = renderPage(<OnboardingPage />)
    profile = {
      id: 'loaded-profile',
      name: '',
      currency: '',
      language: '',
      date_format: '',
      time_format: '',
      time_zone: '',
      reminders_per_day: 2,
      default_reminder_days: 7,
    }
    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <OnboardingPage />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    const preferences = screen.getAllByRole('combobox')
    expect(preferences[0]).toHaveValue('₹')
    expect(preferences[1]).toHaveValue('en')
    expect(preferences[2]).toHaveValue('dd/MM/yyyy')
    expect(preferences[3]).toHaveValue('12h')
    expect(preferences[4]).toHaveValue('Asia/Kolkata')
  })

  it('orders logo, preferences, contact and notification steps without a heading back control', () => {
    renderPage(<OnboardingPage />)
    const heading = screen.getByTestId('onboarding-heading')
    expect(heading).toHaveTextContent(messages.Onboarding.welcome)
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeVisible()
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-next-button'))
    expect(heading).toHaveTextContent(messages.Onboarding.personalizeExperience)
    expect(heading.querySelector('button')).toBeNull()
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    expect(heading).toHaveTextContent(messages.Onboarding.businessDetails)
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
    expect(heading).toHaveTextContent(messages.Onboarding.notifications)
    expect(screen.getByTestId('onboarding-next-button')).toBeDisabled()
  })

  it('marks all five personalization selectors required and blocks progress when any is cleared', () => {
    renderPage(<OnboardingPage />)
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    const ids = [
      'currency',
      'language',
      'date-format',
      'time-format',
      'time-zone',
    ]
    for (const id of ids) {
      const label = document.querySelector(`label[for="onboarding-${id}"]`)
      expect(label?.querySelector('.text-destructive')).toHaveTextContent('*')
      expect(label?.parentElement).toHaveClass('min-w-0')
    }
    expect(screen.getByTestId('onboarding-preferences')).toHaveClass(
      'grid-cols-1',
    )
    expect(screen.getByTestId('onboarding-preferences')).not.toHaveClass(
      'md:grid-cols-2',
    )
    for (const id of ids) {
      const select = screen.getByTestId(`onboarding-${id}`) as HTMLSelectElement
      const original = select.value
      const blank = document.createElement('option')
      blank.value = ''
      select.prepend(blank)
      fireEvent.change(select, { target: { value: '' } })
      expect(screen.getByTestId('onboarding-step2-continue')).toBeDisabled()
      expect(screen.getByTestId('onboarding-next-button')).toBeDisabled()
      expect(screen.getByText(messages.Onboarding.fieldRequired)).toBeVisible()
      fireEvent.change(select, { target: { value: original } })
      expect(screen.getByTestId('onboarding-step2-continue')).toBeEnabled()
    }
  })
})

describe.each([PreferencesPage, NotificationsPage])(
  'preference loading states',
  (Component) => {
    it('shows pending preferences and renders nothing without a profile', () => {
      loading = true
      renderPage(<Component />)
      expect(
        screen.getByText(messages.Settings.loadingPreferences),
      ).toBeVisible()
      cleanup()
      loading = false
      profile = null
      const { container } = renderPage(<Component />)
      expect(container).toBeEmptyDOMElement()
    })
  },
)
describe('notification preferences page', () => {
  it.each([
    'voice_call_enabled',
    'sms_enabled',
    'push_enabled',
    'whatsapp_enabled',
  ])('persists the %s channel choice', async (channel) => {
    renderPage(<NotificationsPage />)
    fireEvent.click(screen.getByTestId(`notifications-toggle-${channel}`))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ [channel]: true }),
    )
  })
  it('requires premium only when enabling party SMS', async () => {
    mocks.require.mockReturnValueOnce(false)
    renderPage(<NotificationsPage />)
    fireEvent.click(
      screen.getByTestId('notifications-toggle-party_sms_enabled'),
    )
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByTestId('notifications-toggle-party_sms_enabled'),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ party_sms_enabled: true }),
    )
    expect(mocks.require).toHaveBeenCalledWith('notify-party')
  })
  it('converts reminder days to a number and reports persistence failures', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Offline'))
    renderPage(<NotificationsPage />)
    fireEvent.change(screen.getByTestId('notifications-reminder-days'), {
      target: { value: '7' },
    })
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Offline', type: 'error' }),
      ),
    )
    expect(mocks.update).toHaveBeenCalledWith({ default_reminder_days: 7 })
    expect(
      screen.getByTestId('notifications-toggle-push_enabled'),
    ).toBeEnabled()
  })

  it('uses the default reminder value when the saved lead time is zero', () => {
    profile = { ...profile, default_reminder_days: 0 }
    renderPage(<NotificationsPage />)

    expect(screen.getByTestId('notifications-reminder-days')).toHaveValue('3')
  })

  it('uses a generic message when preference persistence rejects a non-error value', async () => {
    mocks.update.mockRejectedValueOnce('offline')
    renderPage(<NotificationsPage />)

    fireEvent.click(screen.getByTestId('notifications-toggle-sms_enabled'))

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: messages.Common.error,
          type: 'error',
        }),
      ),
    )
  })
  it('edits individual reminder times and saves the sorted list', () => {
    profile = {
      ...profile,
      reminders_per_day: 2,
      reminder_times: ['09:00:00', '17:00:00'],
    }
    renderPage(<NotificationsPage />)
    const first = screen.getByTestId('reminder-time-1')
    const second = screen.getByTestId('reminder-time-2')
    expect(first).toHaveValue('09:00')
    expect(second).toHaveValue('17:00')
    expect(
      Array.from((first as HTMLSelectElement).options).map((o) => o.value),
    ).not.toContain('17:00')
    expect(
      screen.getByRole('option', { name: '9:00 AM', hidden: true }),
    ).toBeInTheDocument()
    fireEvent.change(second, { target: { value: '07:30' } })
    expect(mocks.update).toHaveBeenCalledWith({
      reminder_times: ['07:30', '09:00'],
    })
  })

  it('falls back to the historical slots before reminder times load', () => {
    profile = { ...profile, reminders_per_day: 3, time_format: '24h' }
    renderPage(<NotificationsPage />)
    expect(
      ['reminder-time-1', 'reminder-time-2', 'reminder-time-3'].map(
        (id) => (screen.getByTestId(id) as HTMLSelectElement).value,
      ),
    ).toEqual(['09:00', '13:00', '18:00'])
    expect(screen.getAllByText('13:00').length).toBeGreaterThan(0)
  })

  it('persists the daily frequency and places reminder times directly under it', () => {
    renderPage(<NotificationsPage />)
    const schedule = screen.getByTestId('notifications-reminder-schedule')
    const frequency = screen.getByTestId('notifications-daily-frequency')
    const firstTime = screen.getByTestId('reminder-time-1')
    const warning = screen.getByTestId('notifications-reminder-days')
    expect(schedule).toContainElement(frequency)
    expect(
      frequency.compareDocumentPosition(firstTime) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      firstTime.compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.change(frequency, { target: { value: '2' } })
    expect(mocks.update).toHaveBeenCalledWith({ reminders_per_day: 2 })
  })

  it('defaults a zero daily frequency to once a day', () => {
    profile = { ...profile, reminders_per_day: 0 }
    renderPage(<NotificationsPage />)
    expect(screen.getByTestId('notifications-daily-frequency')).toHaveValue('1')
  })
})
describe('general preferences page', () => {
  it('includes the browser-local analytics and session recording preference', () => {
    renderPage(<PreferencesPage />)
    expect(screen.getByText('Monitoring preferences')).toBeVisible()
  })

  it('persists currency, date/time formats, timezone and reduce motion', () => {
    renderPage(<PreferencesPage />)
    const selects = screen.getAllByRole('combobox').slice(1, 6)
    const expectedFields = [
      'currency',
      'language',
      'date_format',
      'time_format',
      'time_zone',
    ]
    selects.forEach((select, index) => {
      if (index === 1) return
      const option = (select as HTMLSelectElement).options[1]
      fireEvent.change(select, { target: { value: option.value } })
      expect(mocks.update).toHaveBeenCalledWith({
        [expectedFields[index]]: option.value,
      })
    })
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Settings.reduceMotion }),
    )
    expect(mocks.update).toHaveBeenCalledWith({ reduce_motion: true })
  })

  it('persists the language through the profile provider', () => {
    renderPage(<PreferencesPage />)
    fireEvent.change(screen.getByTestId('preferences-language'), {
      target: { value: 'hi' },
    })
    expect(mocks.update).toHaveBeenCalledWith({ language: 'hi' })
  })

  it('reports failed preference saves without changing the locale cookie', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Save failed'))
    const before = document.cookie
    renderPage(<PreferencesPage />)
    fireEvent.change(screen.getByTestId('preferences-language'), {
      target: { value: 'hi' },
    })
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Common.error,
        description: 'Save failed',
        type: 'error',
      }),
    )
    expect(document.cookie).toBe(before)
  })

  it('defaults blank time formats', () => {
    profile = { ...profile, time_format: '' }
    renderPage(<PreferencesPage />)
    expect(screen.getByTestId('preferences-time-format')).toHaveValue('12h')
  })

  it('no longer hosts the notification reminder schedule', () => {
    renderPage(<PreferencesPage />)
    expect(screen.queryByText(messages.Onboarding.dailyFrequency)).toBeNull()
    expect(screen.queryByTestId('reminder-time-1')).toBeNull()
  })
})
