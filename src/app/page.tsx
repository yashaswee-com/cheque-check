import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('Unable to check session on landing page:', error)
  } else if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">ChequeCheck</h1>
        <p className="text-sm text-muted-foreground">
          Simple cheque management for your business.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button render={<Link href="/login" />} className="min-h-12 w-full">
          Log in
        </Button>
        <Button
          render={<Link href="/signup" />}
          variant="outline"
          className="min-h-12 w-full"
        >
          Sign up
        </Button>
      </div>
    </main>
  )
}
