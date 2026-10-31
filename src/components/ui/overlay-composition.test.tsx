import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it } from 'vitest'
import messages from '../../../messages/en.json'
import { Button } from './button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from './dialog'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTrigger,
} from './sheet'

afterEach(cleanup)

function wrap(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  )
}

it('preserves dialog trigger and close semantics for composed elements', () => {
  wrap(
    <Dialog open>
      <DialogTrigger>Default trigger</DialogTrigger>
      <DialogTrigger render={<button>Native element</button>} />
      <DialogTrigger render={<Button>Button component</Button>} />
      <DialogTrigger render={<span>Other element</span>} />
      <DialogTrigger nativeButton render={<button>Forced native</button>} />
      <DialogTrigger nativeButton={false} render={<span>Forced custom</span>} />
      <DialogContent>
        <p>Dialog content</p>
        <DialogClose>Default close</DialogClose>
        <DialogClose render={<button>Native close</button>} />
        <DialogClose render={<Button>Button close</Button>} />
        <DialogClose render={<a href="#close">Other close</a>} />
        <DialogClose
          nativeButton
          render={<button>Forced native close</button>}
        />
        <DialogClose
          nativeButton={false}
          render={<span>Forced custom close</span>}
        />
        <DialogFooter>Default footer</DialogFooter>
        <DialogFooter showCloseButton>Footer with close</DialogFooter>
      </DialogContent>
    </Dialog>,
  )

  for (const label of [
    'Default trigger',
    'Native element',
    'Button component',
    'Other element',
    'Forced native',
    'Forced custom',
    'Dialog content',
    'Default close',
    'Native close',
    'Button close',
    'Other close',
    'Forced native close',
    'Forced custom close',
    'Default footer',
    'Footer with close',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})

it('preserves sheet trigger and close semantics for composed elements', () => {
  wrap(
    <Sheet open>
      <SheetTrigger>Default trigger</SheetTrigger>
      <SheetTrigger render={<button>Native element</button>} />
      <SheetTrigger render={<Button>Button component</Button>} />
      <SheetTrigger render={<span>Other element</span>} />
      <SheetTrigger nativeButton render={<button>Forced native</button>} />
      <SheetTrigger nativeButton={false} render={<span>Forced custom</span>} />
      <SheetContent>
        <p>Sheet content</p>
        <SheetClose>Default close</SheetClose>
        <SheetClose render={<button>Native close</button>} />
        <SheetClose render={<Button>Button close</Button>} />
        <SheetClose render={<a href="#close">Other close</a>} />
        <SheetClose
          nativeButton
          render={<button>Forced native close</button>}
        />
        <SheetClose
          nativeButton={false}
          render={<span>Forced custom close</span>}
        />
        <SheetFooter>Default footer</SheetFooter>
        <SheetFooter showCloseButton>Footer with close</SheetFooter>
      </SheetContent>
    </Sheet>,
  )

  for (const label of [
    'Default trigger',
    'Native element',
    'Button component',
    'Other element',
    'Forced native',
    'Forced custom',
    'Sheet content',
    'Default close',
    'Native close',
    'Button close',
    'Other close',
    'Forced native close',
    'Forced custom close',
    'Default footer',
    'Footer with close',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})
