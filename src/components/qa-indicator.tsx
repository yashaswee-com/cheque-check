export function QaIndicator() {
  return (
    <div
      data-testid="qa-indicator"
      className="relative z-[110] flex h-2 w-full shrink-0 items-center justify-center bg-[#facc15] bg-[repeating-linear-gradient(135deg,#facc15_0px,#facc15_6px,#171717_6px,#171717_12px)]"
      aria-label="qa environment"
    >
      <span className="bg-white px-2 text-[8px] leading-2 font-semibold tracking-wide text-black">
        qa environment
      </span>
    </div>
  )
}
