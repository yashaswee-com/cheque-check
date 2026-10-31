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
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ requireAccess: mocks.require }),
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
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
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
  }
  it('requires a business name and valid optional phone, while preserving values on back navigation', () => {
    renderPage(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-step1-continue')).toBeDisabled()
    fireEvent.change(screen.getByTestId('onboarding-business-name-input'), {
      target: { value: 'Acme' },
    })
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '123' } },
    )
    expect(screen.getByTestId('onboarding-step2-continue')).toBeDisabled()
    expect(screen.getByText(messages.Common.invalidPhone)).toBeVisible()
    fireEvent.change(
      screen.getByPlaceholderText(messages.Onboarding.businessPhonePlaceholder),
      { target: { value: '+919876543210' } },
    )
    expect(screen.getByTestId('onboarding-step2-continue')).toBeEnabled()
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
    fireEvent.click(screen.getByTestId('onboarding-step1-continue'))
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
    fireEvent.click(screen.getByTestId('onboarding-step2-continue'))
    const preferences = screen.getAllByRole('combobox')
    preferences.forEach((select) => {
      const option = (select as HTMLSelectElement).options[1]
      if (option) fireEvent.change(select, { target: { value: option.value } })
    })
    fireEvent.click(screen.getByTestId('onboarding-step3-continue'))
    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }))
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
})
describe('general preferences page', () => {
  it('persists currency, date/time formats, timezone, reminder counts and reduce motion', () => {
    renderPage(<PreferencesPage />)
    const selects = screen.getAllByRole('combobox')
    const expectedFields = [
      'currency',
      'language',
      'date_format',
      'time_format',
      'time_zone',
      'reminders_per_day',
      'default_reminder_days',
    ]
    selects.forEach((select, index) => {
      if (index === 1) return
      const option = (select as HTMLSelectElement).options[1]
      fireEvent.change(select, { target: { value: option.value } })
      expect(mocks.update).toHaveBeenCalledWith({
        [expectedFields[index]]:
          index >= 5 ? Number(option.value) : option.value,
      })
    })
    fireEvent.click(
      screen.getByRole('switch', { name: messages.Settings.reduceMotion }),
    )
    expect(mocks.update).toHaveBeenCalledWith({ reduce_motion: true })
  })
})
