import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import Link from 'next/link'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'
import { ScrollArea, ScrollBar } from './scroll-area'
import { Separator } from './separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
import { PageTransition } from './page-transition'
import { Badge } from '../reui/badge'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'
import {
  CommandDialog,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './command'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'
import { EntityAvatar } from './entity-avatar'
import { EmptyState } from './empty-state'
import { TextTruncate } from './text-truncate'
import { Tag01Icon } from '@hugeicons/core-free-icons'

vi.mock('next/navigation', () => ({ usePathname: () => '/cheques' }))
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )

it('renders complete cards, badges and scrollable page content', () => {
  const { container } = wrap(
    <PageTransition>
      <Card size="sm" className="custom-card">
        <CardHeader>
          <CardTitle>Balance</CardTitle>
          <CardDescription>Current account</CardDescription>
          <CardAction>
            <Badge
              variant="success"
              radius="full"
              render={<Link href="/accounts" />}
            >
              Active
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <p>Transaction</p>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <Separator orientation="vertical" />
        </CardContent>
        <CardFooter>Updated today</CardFooter>
      </Card>
    </PageTransition>,
  )
  expect(screen.getByText('Balance')).toHaveAttribute('data-slot', 'card-title')
  expect(screen.getByRole('link', { name: 'Active' })).toHaveAttribute(
    'href',
    '/accounts',
  )
  expect(container.querySelector('[data-slot="card"]')).toHaveClass(
    'custom-card',
  )
  expect(
    screen
      .getByText('Transaction')
      .closest('[data-slot="scroll-area-viewport"]'),
  ).toBeInTheDocument()
  expect(screen.getByText('Updated today')).toHaveAttribute(
    'data-slot',
    'card-footer',
  )
})

it('recognizes an already cached avatar image', () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
    100,
  )
  render(<EntityAvatar name="Asha" imageUrl="/asha.png" />)
  expect(screen.getByRole('img', { name: 'Asha' })).not.toHaveClass('invisible')
})

it('changes tab panels while preserving the vertical line variant', () => {
  wrap(
    <Tabs defaultValue="one" orientation="vertical">
      <TabsList variant="line">
        <TabsTrigger value="one">First</TabsTrigger>
        <TabsTrigger value="two">Second</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
    </Tabs>,
  )
  expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel')
  fireEvent.click(screen.getByRole('tab', { name: 'Second' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel')
})

it('opens an accessible popover with its header and backdrop', async () => {
  wrap(
    <Popover>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent backdrop>
        <PopoverHeader>
          <PopoverTitle>Cheque details</PopoverTitle>
          <PopoverDescription>Reference number</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(await screen.findByText('Reference number')).toBeVisible()
  expect(screen.getByText('Cheque details')).toHaveAttribute(
    'data-slot',
    'popover-title',
  )
})

it('opens and closes a sheet using its footer action', async () => {
  wrap(
    <Sheet>
      <SheetTrigger>Open sheet</SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Update preferences</SheetDescription>
        </SheetHeader>
        <SheetFooter showCloseButton>Footer</SheetFooter>
      </SheetContent>
    </Sheet>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Update preferences',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('renders a command dialog with shortcut hints', () => {
  wrap(
    <CommandDialog open>
      <CommandInput placeholder="Search commands" />
      <CommandList>
        <CommandItem value="print">
          Print<CommandShortcut>Ctrl P</CommandShortcut>
        </CommandItem>
      </CommandList>
    </CommandDialog>,
  )
  expect(screen.getByPlaceholderText('Search commands')).toBeVisible()
  expect(screen.getByText('Ctrl P')).toHaveAttribute(
    'data-slot',
    'command-shortcut',
  )
})

it('renders an empty-state fallback action without a destination', () => {
  wrap(
    <EmptyState
      title="No items"
      action={{ label: 'Add item' }}
      data-testid="empty-state"
    />,
  )
  expect(screen.getByTestId('empty-state')).toHaveTextContent('No items')
  expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled()
})

it('supports empty-state illustrations, icons, descriptions and actions', () => {
  const action = vi.fn()
  const { rerender, container } = render(
    <EmptyState
      title="No tags"
      description="Create your first tag"
      icon={Tag01Icon}
      action={{ label: 'Create tag', onClick: action }}
    />,
  )
  expect(screen.getByText('Create your first tag')).toBeInTheDocument()
  expect(container.querySelector('svg')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
  expect(action).toHaveBeenCalledOnce()

  rerender(
    <EmptyState
      title="No tags"
      illustration={<span>Tag illustration</span>}
      action={{ label: 'Open tags', href: '/tags' }}
    />,
  )
  expect(screen.getByText('Tag illustration')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open tags' })).toHaveAttribute(
    'href',
    '/tags',
  )
})

it('truncates long text and preserves its full value in the title', () => {
  render(<TextTruncate text="A long cheque description" maxLength={10} />)
  expect(screen.getByText('A long che...')).toHaveAttribute(
    'title',
    'A long cheque description',
  )
})

it('renders no element for empty text', () => {
  const { container } = render(<TextTruncate text="" maxLength={10} />)
  expect(container).toBeEmptyDOMElement()
})

it('selects an option in a grouped select', async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  wrap(
    <Select defaultValue="one" onValueChange={change}>
      <SelectTrigger aria-label="Account">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Accounts</SelectLabel>
          <SelectItem value="one">Main</SelectItem>
          <SelectSeparator />
          <SelectItem value="two">Savings</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>,
  )
  await user.click(screen.getByRole('combobox', { name: 'Account' }))
  await user.click(await screen.findByRole('option', { name: 'Savings' }))
  expect(change).toHaveBeenCalledWith('two', expect.anything())
})
