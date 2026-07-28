import { TryLiveDemoButton } from '@/components/try-live-demo-button';

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
    </main>
  );
}
