import { signDevStaffToken, verifyDevStaffToken } from '../src/index';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('dev staff token', () => {
  it('round-trips', async () => {
    const token = await signDevStaffToken({
      secret: 'test-secret-at-least-32-chars-long!!',
      sub: 'dev|demo-owner',
      email: 'owner@demo.reclaimai.local',
    });
    const claims = await verifyDevStaffToken(
      token,
      'test-secret-at-least-32-chars-long!!',
    );
    assert.equal(claims.sub, 'dev|demo-owner');
    assert.equal(claims.email, 'owner@demo.reclaimai.local');
  });
});
