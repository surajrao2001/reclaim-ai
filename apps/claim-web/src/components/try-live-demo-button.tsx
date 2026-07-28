'use client';

import { useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import { simulateOrder } from '@/lib/pos-api';

export function TryLiveDemoButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setError('');
    setLoading(true);
    try {
      const result = await simulateOrder();
      window.location.assign(result.claim_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start demo');
      setLoading(false);
    }
  }

  return (
    <div className="demo-cta">
      <Button variant="primary" onClick={handleClick} disabled={loading}>
        {loading ? 'Starting demo…' : 'Try live demo'}
      </Button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
