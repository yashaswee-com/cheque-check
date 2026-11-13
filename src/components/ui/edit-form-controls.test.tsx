import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { EditSaveBar } from './edit-save-bar'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { ThemeColorRow, PARTY_THEME_COLORS } from './theme-color-row'
import {
  ShellBottomSlot,
  ShellBottomSlotProvider,
} from '@/components/shell-bottom-slot'

afterEach(cleanup)

function mount(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )
}

describe('EditSaveBar', () => {
  it('keeps the secondary action next to submit and sends Continue to the form', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    mount(
      <>
        <form id="steps" onSubmit={submit} />
        <EditSaveBar
          formId="steps"
          label="Continue"
          isContinue
          isDirty
          isSaving={false}
          secondaryAction={
            <button type="button" aria-label="Delete">
              x
            </button>
          }
        />
      </>,
    )
    const save = screen.getByRole('button', { name: 'Continue' })
    const remove = screen.getByRole('button', { name: 'Delete' })
    expect(save.parentElement).toBe(remove.parentElement)
    expect(screen.getByTestId('edit-save-bar')).toContainElement(remove)
    fireEvent.click(save)
    expect(submit).toHaveBeenCalledOnce()
  })
  it('stays disabled with a hint until the form has changes', () => {
    mount(
      <EditSaveBar
        formId="f"
        label="Update"
        isDirty={false}
        isSaving={false}
      />,
    )
    const button = screen.getByTestId('edit-save-button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', messages.SharedUI.noChangesToSave)
    expect(screen.getByTestId('edit-save-bar')).toHaveClass(
      'sticky',
      'bottom-0',
    )
  })

  it('submits the referenced form from outside it when dirty', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    mount(
      <>
        <form id="edit-form" onSubmit={onSubmit} />
        <EditSaveBar
          formId="edit-form"
          label="Update"
          isDirty
          isSaving={false}
          testId="custom-save"
        />
      </>,
    )
    const button = screen.getByTestId('custom-save')
    expect(button).toHaveAttribute('form', 'edit-form')
    expect(button).not.toHaveAttribute('title')
    fireEvent.click(button)
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('shows progress and blocks resubmission while saving', () => {
    mount(<EditSaveBar formId="f" label="Update" isDirty isSaving />)
    const button = screen.getByTestId('edit-save-button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('docks into the shell bottom slot when one is available', () => {
    mount(
      <ShellBottomSlotProvider>
        <main>
          <EditSaveBar formId="f" label="Update" isDirty isSaving={false} />
        </main>
        <ShellBottomSlot />
      </ShellBottomSlotProvider>,
    )
    const bar = screen.getByTestId('edit-save-bar')
    expect(screen.getByTestId('shell-bottom-slot')).toContainElement(bar)
    expect(bar).not.toHaveClass('sticky')
  })
})

describe('UnsavedChangesDialog', () => {
  it('offers discard and keep editing actions', () => {
    const onDiscard = vi.fn()
    const onCancel = vi.fn()
    mount(
      <UnsavedChangesDialog open onDiscard={onDiscard} onCancel={onCancel} />,
    )
    expect(screen.getByText(messages.SharedUI.unsavedTitle)).toBeVisible()
    expect(screen.getByText(messages.SharedUI.unsavedDescription)).toBeVisible()
    expect(
      screen
        .getByRole('button', { name: messages.SharedUI.discardChanges })
        .querySelector('svg'),
    ).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: messages.SharedUI.keepEditing })
        .querySelector('svg'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.keepEditing }),
    )
    expect(onCancel).toHaveBeenCalledOnce()
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.discardChanges }),
    )
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('renders nothing while closed', () => {
    mount(
      <UnsavedChangesDialog
        open={false}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('unsaved-changes-dialog')).toBeNull()
  })
})

describe('ThemeColorRow', () => {
  it('keeps every swatch on one non-wrapping row and reports selection', () => {
    const onChange = vi.fn()
    mount(
      <ThemeColorRow
        label="Theme color"
        colors={PARTY_THEME_COLORS}
        value="#007AFF"
        onChange={onChange}
        testId="colors"
      />,
    )
    const row = screen.getByRole('group', { name: 'Theme color' })
    expect(row).toHaveClass('flex-nowrap', 'justify-between')
    expect(row).not.toHaveClass('flex-wrap')
    const swatches = screen.getAllByRole('button')
    expect(swatches).toHaveLength(PARTY_THEME_COLORS.length)
    for (const swatch of swatches)
      expect(swatch).toHaveClass(
        'min-w-0',
        'flex-1',
        'aspect-square',
        'sm:size-10',
      )
    expect(screen.getByRole('button', { name: '#007AFF' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: '#FF3B30' }))
    expect(onChange).toHaveBeenCalledWith('#FF3B30')
    expect(screen.getByTestId('colors')).toContainElement(row)
  })
})
