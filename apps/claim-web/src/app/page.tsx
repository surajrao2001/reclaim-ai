import { DemoPipeline } from '@/components/demo-pipeline';
import { TryLiveDemoButton } from '@/components/try-live-demo-button';

const FLOW_NODES: { x: number; label: string }[] = [
  { x: 28, label: 'Order' },
  { x: 96, label: 'Claim' },
  { x: 164, label: 'OTP' },
  { x: 232, label: 'Offer' },
  { x: 300, label: 'WA' },
  { x: 332, label: '₹' },
];

export default function HomePage() {
  return (
    <main>
      <p className="brand">ReclaimAI</p>
      <h1>Claim your cashback</h1>
      <p>
        Scan your bill sticker, verify with OTP, and receive instant UPI cashback — or start a
        live demo order without Petpooja.
      </p>
      <TryLiveDemoButton />
      <section className="flow-section" aria-labelledby="flow-heading">
        <h2 id="flow-heading" className="flow-heading">
          How the live demo flows
        </h2>
        <p className="muted flow-lede">
          One click creates a real order in the showcase kitchen, then walks the same path
          guests use after scanning a sticker.
        </p>
        <DemoPipeline />
        <svg
          className="flow-diagram"
          viewBox="0 0 360 56"
          role="img"
          aria-label="Order to claim to OTP to offer to WhatsApp to cashback"
        >
          <defs>
            <marker
              id="flow-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
            </marker>
          </defs>
          <line
            x1="28"
            y1="28"
            x2="332"
            y2="28"
            stroke="currentColor"
            strokeWidth="1.5"
            markerEnd="url(#flow-arrow)"
            opacity="0.45"
          />
          {FLOW_NODES.map((node) => (
            <g key={node.label}>
              <circle cx={node.x} cy={28} r={7} fill="var(--rai-accent)" />
              <text
                x={node.x}
                y={48}
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                fontFamily="Segoe UI, system-ui, sans-serif"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </section>
      <p className="muted status-link-wrap">
        <a className="status-link" href="/status">
          System status
        </a>
      </p>
    </main>
  );
}
