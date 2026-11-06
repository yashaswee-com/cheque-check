import Link from 'next/link'

export default function LegalNoticePage({
  searchParams,
}: {
  searchParams?: { type?: string }
}) {
  const type = searchParams?.type ?? 'general'

  return (
    <main className="mx-auto max-w-4xl px-4 py-16 text-[#1d1d1f] sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-[#e0e0e0] bg-[#f5f5f7] p-8 shadow-[0_18px_44px_rgba(0,0,0,0.04)] sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
          Legal notice generator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#1d1d1f]">
          {type === 'cheque-bounce'
            ? 'Cheque bounce demand notice'
            : 'Legal notice generator'}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#333333]">
          This generator is a streamlined drafting flow for demand notices
          issued under India’s legal framework. Use it to prepare a professional
          notice addressed to the drawer, outlining the cheque, the dishonour,
          and the demand for payment within the statutory window.
        </p>

        <div className="mt-8 rounded-[24px] border border-[#e0e0e0] bg-white p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#333333]">
            Draft checklist
          </p>
          <ul className="mt-4 space-y-3 text-base leading-7 text-[#333333]">
            <li>
              • Mention the cheque number, date, bank, amount, and return memo.
            </li>
            <li>
              • State the statutory notice timeline under Section 138 of the NI
              Act.
            </li>
            <li>• Demand payment within 15 days of receipt of the notice.</li>
            <li>• Keep a signed copy and proof of service for court record.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/cheque-bounce"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Back to calculator
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#dfe3e7] bg-white px-6 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#fafafc]"
          >
            Talk to our team
          </Link>
        </div>
      </div>
    </main>
  )
}
