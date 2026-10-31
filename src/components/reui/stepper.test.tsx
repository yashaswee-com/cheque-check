import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
  useStepItem,
  useStepper,
} from './stepper'

afterEach(cleanup)

function Steps(props: React.ComponentProps<typeof Stepper>) {
  return (
    <Stepper {...props}>
      <StepperNav>
        {[1, 2, 3].map((step) => (
          <StepperItem key={step} step={step}>
            <StepperTrigger>
              <StepperIndicator>{step}</StepperIndicator>
              <StepperTitle>Step {step}</StepperTitle>
              <StepperDescription>Description {step}</StepperDescription>
            </StepperTrigger>
            <StepperSeparator />
          </StepperItem>
        ))}
      </StepperNav>
      <StepperPanel>
        <StepperContent value={1}>First form</StepperContent>
        <StepperContent value={2}>Second form</StepperContent>
        <StepperContent value={3} forceMount>
          Third form
        </StepperContent>
      </StepperPanel>
    </Stepper>
  )
}

describe('Stepper', () => {
  it('selects a default step, hides inactive panels, and advances on click', () => {
    const onValueChange = vi.fn()
    render(<Steps onValueChange={onValueChange} />)
    const first = screen.getByRole('tab', { name: /Step 1/ })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('aria-controls', 'stepper-panel-1')
    expect(first).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('First form')).toBeVisible()
    expect(screen.queryByText('Second form')).not.toBeInTheDocument()
    expect(screen.getByText('Third form')).not.toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: /Step 2/ }))
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(2)
    expect(screen.getByText('Second form')).toBeVisible()
    expect(first).toHaveAttribute('data-state', 'completed')
    expect(first).toHaveAttribute('tabindex', '-1')
  })

  it('reports changes without changing a controlled selection', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(
      <Steps value={2} onValueChange={onValueChange} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /Step 3/ }))
    expect(onValueChange).toHaveBeenCalledWith(3)
    expect(screen.getByText('Second form')).toBeVisible()
    rerender(
      <Steps value={3} onValueChange={onValueChange} orientation="vertical" />,
    )
    expect(screen.getByText('Third form')).toBeVisible()
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    )
  })

  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowDown', 0, 1],
    ['ArrowLeft', 1, 0],
    ['ArrowUp', 1, 0],
    ['ArrowRight', 2, 0],
    ['ArrowLeft', 0, 2],
    ['Home', 2, 0],
    ['End', 0, 2],
  ])('%s moves focus without selecting a step', (key, from, to) => {
    const onValueChange = vi.fn()
    render(<Steps onValueChange={onValueChange} />)
    const tabs = screen.getAllByRole('tab')
    tabs[from].focus()
    fireEvent.keyDown(tabs[from], { key })
    expect(tabs[to]).toHaveFocus()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['Enter', ' '])('%j activates the focused step', (key) => {
    render(<Steps />)
    fireEvent.keyDown(screen.getByRole('tab', { name: /Step 2/ }), { key })
    expect(screen.getByText('Second form')).toBeVisible()
  })

  it('marks disabled and loading steps and uses configured indicators', () => {
    render(
      <Stepper
        value={2}
        indicators={{
          completed: 'done',
          active: 'active',
          inactive: 'later',
          loading: 'working',
        }}
      >
        <StepperItem step={1} completed>
          <StepperTrigger>
            <StepperIndicator>one</StepperIndicator>
          </StepperTrigger>
        </StepperItem>
        <StepperItem step={2} loading>
          <StepperTrigger>
            <StepperIndicator>two</StepperIndicator>
          </StepperTrigger>
        </StepperItem>
        <StepperItem step={3} disabled>
          <StepperTrigger>
            <StepperIndicator>three</StepperIndicator>
          </StepperTrigger>
        </StepperItem>
      </Stepper>,
    )
    expect(screen.getByRole('tab', { name: 'done' })).toHaveAttribute(
      'data-state',
      'completed',
    )
    expect(screen.getByRole('tab', { name: 'working' })).toHaveAttribute(
      'data-loading',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'later' })).toBeDisabled()
  })

  it('renders the active indicator and respects an explicit tab index', () => {
    render(
      <Stepper indicators={{ active: 'current' }}>
        <StepperItem step={1}>
          <StepperTrigger tabIndex={4}>
            <StepperIndicator>fallback</StepperIndicator>
          </StepperTrigger>
        </StepperItem>
      </Stepper>,
    )
    expect(screen.getByRole('tab', { name: 'current' })).toHaveAttribute(
      'tabindex',
      '4',
    )
  })

  it('unregisters removed triggers and tolerates Strict Mode ref replay', () => {
    function DynamicSteps({ includeLast }: { includeLast: boolean }) {
      return (
        <Stepper>
          <StepperItem step={1}>
            <StepperTrigger>First</StepperTrigger>
          </StepperItem>
          <StepperItem step={2}>
            <StepperTrigger>Second</StepperTrigger>
          </StepperItem>
          {includeLast && (
            <StepperItem step={3}>
              <StepperTrigger>Last</StepperTrigger>
            </StepperItem>
          )}
        </Stepper>
      )
    }

    const { rerender } = render(
      <StrictMode>
        <DynamicSteps includeLast />
      </StrictMode>,
    )
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    rerender(
      <StrictMode>
        <DynamicSteps includeLast={false} />
      </StrictMode>,
    )
    const second = screen.getByRole('tab', { name: 'Second' })
    second.focus()
    fireEvent.keyDown(second, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('requires root and item providers for consumer hooks', () => {
    function RootConsumer() {
      useStepper()
      return null
    }
    function ItemConsumer() {
      useStepItem()
      return null
    }
    expect(() => render(<RootConsumer />)).toThrow(
      'useStepper must be used within a Stepper',
    )
    expect(() =>
      render(
        <Stepper>
          <ItemConsumer />
        </Stepper>,
      ),
    ).toThrow('useStepItem must be used within a StepperItem')
  })
})
