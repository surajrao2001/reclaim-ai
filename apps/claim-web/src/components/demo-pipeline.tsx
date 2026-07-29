const STEPS = [
  'Order',
  'Claim',
  'OTP',
  'Offer',
  'WhatsApp',
  'Cashback',
] as const;

export function DemoPipeline({ highlightIndex = -1 }: { highlightIndex?: number }) {
  return (
    <ol className="pipeline" aria-label="Demo pipeline">
      {STEPS.map((label, index) => (
        <li
          key={label}
          className={
            highlightIndex >= 0 && index <= highlightIndex
              ? 'pipeline-step pipeline-step--done'
              : 'pipeline-step'
          }
        >
          <span className="pipeline-dot" aria-hidden="true" />
          <span className="pipeline-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
