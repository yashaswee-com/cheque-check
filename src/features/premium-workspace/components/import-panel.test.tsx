import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { ImportPanel } from './import-panel'
import type { WorkspaceContext } from '../types'

const mocks = vi.hoisted(() => ({
  readImportFile: vi.fn(),
  downloadImportSample: vi.fn(),
  importRows: vi.fn(),
}))
vi.mock('../import-file', () => mocks)
vi.mock('../service', () => ({ premiumWorkspaceService: mocks }))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.readImportFile.mockResolvedValue([
    { name: 'Asha', contact: '+919876543210' },
  ])
  mocks.importRows.mockResolvedValue(undefined)
})
const context: WorkspaceContext = { cheques: [], parties: [], accounts: [] }
function mount(props: Partial<React.ComponentProps<typeof ImportPanel>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ImportPanel
        businessId="b1"
        context={context}
        busy={false}
        run={async (action) => {
          await action()
        }}
        {...props}
      />
    </NextIntlClientProvider>,
  )
}
function upload() {
  fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.file), {
    target: {
      files: [
        new File(['name,contact\nAsha,9876543210'], 'parties.csv', {
          type: 'text/csv',
        }),
      ],
    },
  })
}

describe('ImportPanel', () => {
  it('shows owned reference names and IDs for cheque import', () => {
    mount({
      initialKind: 'cheques',
      context: {
        cheques: [],
        parties: [
          { id: 'p1', name: 'Asha' } as WorkspaceContext['parties'][number],
        ],
        accounts: [
          {
            id: 'a1',
            account_name: 'Main',
            account_number: '1111',
          } as WorkspaceContext['accounts'][number],
        ],
      },
    })
    expect(screen.getByText('p1')).toBeInTheDocument()
    expect(screen.getByText('a1')).toBeInTheDocument()
    expect(screen.getByText(/Main/)).toBeInTheDocument()
  })
  it('previews valid rows and requires explicit confirmation to import', async () => {
    mount()
    upload()
    await screen.findByText(/Asha/)
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.commitImport,
      }),
    )
    expect(mocks.importRows).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.cancel }),
    )
    expect(mocks.importRows).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.commitImport,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.confirm }),
    )
    await waitFor(() =>
      expect(mocks.importRows).toHaveBeenCalledWith(
        'b1',
        'parties',
        expect.arrayContaining([expect.objectContaining({ name: 'Asha' })]),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByText(/Asha/)).not.toBeInTheDocument(),
    )
  })

  it('prevents committing invalid rows', async () => {
    mocks.readImportFile.mockResolvedValue([{ name: '', contact: '' }])
    mount()
    upload()
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: messages.PremiumWorkspace.commitImport,
        }),
      ).toBeDisabled(),
    )
    expect(mocks.importRows).not.toHaveBeenCalled()
  })

  it('surfaces file-read failure and allows a corrected file', async () => {
    mocks.readImportFile.mockRejectedValueOnce(new Error('invalid workbook'))
    mount()
    upload()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.PremiumWorkspace.fileError,
    )
    upload()
    await screen.findByText(/Asha/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('downloads the selected sample and clears preview on kind changes', async () => {
    mount()
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.downloadSample,
      }),
    )
    expect(mocks.downloadImportSample).toHaveBeenCalledWith('parties')
    upload()
    await screen.findByText(/Asha/)
    fireEvent.change(
      screen.getByRole('combobox', {
        name: messages.PremiumWorkspace.importKind,
      }),
      { target: { value: 'cheques' } },
    )
    expect(screen.queryByText(/Asha/)).not.toBeInTheDocument()
    expect(
      screen.getByText(messages.PremiumWorkspace.referenceIds),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.downloadSample,
      }),
    )
    expect(mocks.downloadImportSample).toHaveBeenLastCalledWith('cheques')
  })

  it('disables file selection while busy and hides a fixed import kind selector', () => {
    mount({ busy: true, initialKind: 'cheques', allowedKinds: ['cheques'] })
    expect(screen.getByLabelText(messages.PremiumWorkspace.file)).toBeDisabled()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
