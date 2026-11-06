'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type TimelinePoint = {
  label: string
  date: Date
  detail: string
  tone?: 'default' | 'warning' | 'success'
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const parseInputDate = (value: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

const defaultBounceDate = toInputDate(addDays(new Date(), -14))

const keyJudgments = [
  'Dashrath Rupsingh Rathod v. State of Maharashtra (2014) — Complaint to be filed where the cheque was delivered for collection.',
  'Rangappa v. Sri Mohan (2010) — Presumption under Section 139 shifts the burden to the drawer once signature and cheque are admitted.',
  'Metre and Instruments v. Kanchan Mehta (2017) — Summary trial and interim compensation under Section 143A are valid procedural tools.',
  'Bir Singh v. Mukesh Kumar (2019) — Holder in due course can file under Section 138.',
  'Surinder Singh Deswal v. Virender Gandhi (2019) — Compounding can continue even at appellate stages.',
]

const faqItems = [
  {
    question: 'What is the time limit to file a cheque bounce case in India?',
    answer:
      'You must send a demand notice within 30 days of receiving the return memo. After 15 days for payment, file the complaint within the next 30 days. The total window is roughly 75 days from the bounce date.',
  },
  {
    question: 'What is the maximum compensation in a cheque bounce case?',
    answer:
      'The court can award imprisonment up to two years, a fine up to twice the cheque amount, or both. Interim compensation can also be granted up to 20% of the cheque amount under Section 143A.',
  },
  {
    question: 'Can a cheque bounce case be settled out of court?',
    answer:
      'Yes. Section 147 allows compounding with the court’s permission, and the Supreme Court has set staged compounding costs under the Damodar S. Prabhu framework.',
  },
  {
    question: 'What is the BNS equivalent of Section 138 NI Act?',
    answer:
      'Section 138 remains under the Negotiable Instruments Act, 1881 and has not been replaced by the BNS. Only procedural references to the CrPC have been mapped to BNSS, 2023.',
  },
  {
    question: 'What are valid defenses in a cheque bounce case?',
    answer:
      'Common defenses include no legally enforceable debt, delay in notice, limitation expiry, security cheque disputes, or a genuine challenge to the underlying consideration.',
  },
  {
    question: 'Where should a cheque bounce case be filed?',
    answer:
      'As per Dashrath Rupsingh Rathod, the complaint is usually filed where the cheque was presented and returned for collection, i.e., the payee’s bank branch jurisdiction.',
  },
]

export function ChequeBounceTool() {
  const [bounceDate, setBounceDate] = useState(defaultBounceDate)
  const [noticeDate, setNoticeDate] = useState('')

  const timeline = useMemo<TimelinePoint[]>(() => {
    const bounce = parseInputDate(bounceDate) ?? new Date()
    const noticeSent = parseInputDate(noticeDate) ?? addDays(bounce, 30)
    const paymentDeadline = addDays(noticeSent, 15)
    const complaintDeadline = addDays(paymentDeadline, 30)

    return [
      {
        label: 'Cheque bounces',
        date: bounce,
        detail: 'Return memo received; case starts here.',
        tone: 'default',
      },
      {
        label: 'Send demand notice',
        date: addDays(bounce, 30),
        detail: 'Within 30 days of return memo under Section 138(b).',
        tone: 'warning',
      },
      {
        label: 'Payment by drawer',
        date: paymentDeadline,
        detail: '15 days from notice receipt to pay or satisfy the debt.',
        tone: 'default',
      },
      {
        label: 'File complaint',
        date: complaintDeadline,
        detail: 'Within 30 days after the 15-day payment window.',
        tone: 'success',
      },
    ]
  }, [bounceDate, noticeDate])

  const legalNoticeDeadline = timeline[1].date
  const paymentDueDate = timeline[2].date
  const complaintDueDate = timeline[3].date

  return (
    <main className="bg-white text-[#1d1d1f]">
      <section className="relative overflow-hidden border-b border-[#e0e0e0] bg-[#f5f5f7]">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(0,102,204,0.10),_transparent_58%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dfeafc] bg-white/80 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-[#0066cc] uppercase shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            Free tool
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <p className="text-sm font-medium tracking-[0.18em] text-[#333333] uppercase">
                Legal resource • Section 138 NI Act
              </p>
              <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.06em] text-[#1d1d1f] sm:text-5xl lg:text-6xl">
                Cheque Bounce
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[#333333]">
                Timeline calculator, step-by-step legal guidance, and action
                points to protect your rights when a cheque is dishonoured.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/legal-notice?type=cheque-bounce"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Draft legal notice
                </Link>
                <a
                  href="#calculator"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d8d8dc] bg-white px-6 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#fafafc]"
                >
                  View calculator
                </a>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#e0e0e0] bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.06)]">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1d1d1f]">
                  Deadlines snapshot
                </span>
                <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0066cc]">
                  Live
                </span>
              </div>

              <div className="space-y-4">
                {[
                  {
                    label: 'Notice deadline',
                    value: formatDate(legalNoticeDeadline),
                  },
                  { label: 'Payment due', value: formatDate(paymentDueDate) },
                  {
                    label: 'Complaint filing',
                    value: formatDate(complaintDueDate),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-[#edf0f2] bg-[#f9fafb] px-4 py-3"
                  >
                    <span className="text-sm text-[#666]">{label}</span>
                    <span className="text-sm font-semibold text-[#1d1d1f]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="calculator"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
            Timeline Calculator
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-4xl">
            Timeline Calculator
          </h2>
          <p className="mt-3 text-base text-[#333333]">
            Enter the cheque bounce date to calculate notice and filing
            deadlines.
          </p>
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={(event) => event.preventDefault()}
            className="rounded-[28px] border border-[#e0e0e0] bg-[#fafafc] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.04)] sm:p-6"
          >
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#1d1d1f]">
                  Cheque bounce date
                </span>
                <input
                  type="date"
                  value={bounceDate}
                  onChange={(event) => setBounceDate(event.target.value)}
                  className="h-12 w-full rounded-full border border-[#dfe3e7] bg-white px-4 text-base text-[#1d1d1f] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#1d1d1f]">
                  Notice sent date (optional)
                </span>
                <input
                  type="date"
                  value={noticeDate}
                  onChange={(event) => setNoticeDate(event.target.value)}
                  className="h-12 w-full rounded-full border border-[#dfe3e7] bg-white px-4 text-base text-[#1d1d1f] outline-none transition focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Calculate Timeline
                </button>
                <button
                  type="button"
                  onClick={() => setNoticeDate('')}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-[#0066cc] transition hover:bg-[#0066cc]/5"
                >
                  Reset notice date
                </button>
              </div>
            </div>
          </form>

          <div className="rounded-[28px] border border-[#e0e0e0] bg-[#ffffff] p-6 shadow-[0_18px_44px_rgba(0,0,0,0.04)]">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-lg font-semibold text-[#1d1d1f]">
                Timeline result
              </span>
              <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0066cc]">
                Section 138
              </span>
            </div>

            <div className="space-y-4">
              {timeline.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[#edf0f2] bg-[#f9fafb] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-[#333333]">
                        {item.detail}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        item.tone === 'success'
                          ? 'bg-[#eafaf4] text-[#0e7f55]'
                          : item.tone === 'warning'
                            ? 'bg-[#fff4da] text-[#a26d00]'
                            : 'bg-[#edf3ff] text-[#0066cc]'
                      }`}
                    >
                      {formatDate(item.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#272729] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#99c6ff]">
                Legal overview
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                What is a Cheque Bounce Case?
              </h2>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
              <p className="text-base leading-7 text-[#dfe3e7]">
                A cheque bounce case arises when the cheque is dishonoured for
                insufficient funds or other valid reasons. The payee may file a
                criminal complaint under Section 138 of the Negotiable
                Instruments Act, 1881, demanding the cheque amount, interest,
                and legal costs.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ['Offence', 'Criminal complaint under Section 138'],
              ['Penalty', 'Up to 2 years imprisonment or twice the amount'],
              ['Status', 'One of India’s most common debt recovery disputes'],
            ].map(([title, value]) => (
              <div
                key={title}
                className="rounded-[24px] border border-white/10 bg-[#2c2c2f] p-5"
              >
                <p className="text-sm font-medium text-[#dfe3e7]">{title}</p>
                <p className="mt-3 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
            Procedure
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-4xl">
            Section 138 NI Act vs BNS/BNSS — what changed?
          </h2>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#e0e0e0] bg-white">
          <table className="min-w-full divide-y divide-[#edf0f2] text-left">
            <thead className="bg-[#f5f5f7] text-sm uppercase tracking-[0.08em] text-[#333333]">
              <tr>
                <th className="px-4 py-4 font-semibold">Matter</th>
                <th className="px-4 py-4 font-semibold">Old law</th>
                <th className="px-4 py-4 font-semibold">Current status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f2] text-sm text-[#333333]">
              {[
                [
                  'Cheque bounce',
                  'Section 138, NI Act 1881',
                  'Unchanged — NI Act remains in force',
                ],
                [
                  'Summary trial',
                  'Section 262, CrPC',
                  'Mapped to Section 283, BNSS 2023',
                ],
                [
                  'Compensation',
                  'Section 357, CrPC',
                  'Mapped to Section 395, BNSS 2023',
                ],
                [
                  'Complaint filing',
                  'Section 200, CrPC',
                  'Mapped to Section 223, BNSS 2023',
                ],
                [
                  'Compounding',
                  'Section 147, NI Act',
                  'Unchanged and legally recognised',
                ],
              ].map(([matter, oldLaw, currentStatus]) => (
                <tr key={matter} className="bg-white">
                  <td className="px-4 py-4 font-medium text-[#1d1d1f]">
                    {matter}
                  </td>
                  <td className="px-4 py-4">{oldLaw}</td>
                  <td className="px-4 py-4">{currentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
              Timeline
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-4xl">
              Complete timeline and deadlines
            </h2>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-[#e0e0e0] bg-white">
            <table className="min-w-full divide-y divide-[#edf0f2] text-left">
              <thead className="bg-[#f5f5f7] text-sm uppercase tracking-[0.08em] text-[#333333]">
                <tr>
                  <th className="px-4 py-4 font-semibold">Step</th>
                  <th className="px-4 py-4 font-semibold">Deadline</th>
                  <th className="px-4 py-4 font-semibold">Legal basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f2] text-sm text-[#333333]">
                {[
                  ['Cheque bounces', 'Day 0', 'Return memo issued'],
                  [
                    'Send demand notice',
                    'Within 30 days of bounce',
                    'Section 138(b), NI Act',
                  ],
                  [
                    'Payment by drawer',
                    '15 days from receipt of notice',
                    'Section 138(c), NI Act',
                  ],
                  [
                    'File criminal complaint',
                    'Within 30 days after the grace window',
                    'Section 142(b), NI Act',
                  ],
                ].map(([step, deadline, basis]) => (
                  <tr key={step} className="bg-white">
                    <td className="px-4 py-4 font-medium text-[#1d1d1f]">
                      {step}
                    </td>
                    <td className="px-4 py-4">{deadline}</td>
                    <td className="px-4 py-4">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
            Compensation
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-4xl">
            Compensation and penalties
          </h2>
        </div>

        <ul className="grid gap-4 md:grid-cols-2">
          {[
            'Imprisonment: up to 2 years under Section 138.',
            'Fine: up to twice the cheque amount.',
            'Interim compensation: up to 20% of the cheque amount under Section 143A.',
            'Final compensation: full cheque amount, interest, and litigation costs.',
            'Compounding costs: reduced at early stages under Damodar S. Prabhu guidance.',
            'A complaint can proceed despite settlement attempts if the court is satisfied with the statutory requirements.',
          ].map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 rounded-[22px] border border-[#e0e0e0] bg-white p-5"
            >
              <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#0066cc]" />
              <span className="text-base leading-7 text-[#333333]">
                {point}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-[#272729] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#99c6ff]">
              Judgments
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              Key Supreme Court judgments on cheque bounce
            </h2>
          </div>
          <ul className="space-y-3">
            {keyJudgments.map((judgment) => (
              <li
                key={judgment}
                className="rounded-[22px] border border-white/10 bg-[#2c2c2f] p-4 text-base leading-7 text-[#edf0f2]"
              >
                {judgment}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {faqItems.map(({ question, answer }) => (
            <article
              key={question}
              className="rounded-[24px] border border-[#e0e0e0] bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-[#1d1d1f]">
                {question}
              </h3>
              <p className="mt-3 text-base leading-7 text-[#333333]">
                {answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[#e0e0e0] bg-[#f5f5f7]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-[28px] bg-[#ffffff] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.04)] sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0066cc]">
                  Legal notice generator
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d1d1f] sm:text-3xl">
                  Need a professional demand notice?
                </h2>
              </div>
              <Link
                href="/legal-notice?type=cheque-bounce"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Draft notice
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
