import { ClaimFlow } from './claim-flow';

interface ClaimPageProps {
  params: Promise<{ token: string }>;
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { token } = await params;

  return (
    <main>
      <p className="brand">ReclaimAI</p>
      <ClaimFlow token={token} />
    </main>
  );
}
