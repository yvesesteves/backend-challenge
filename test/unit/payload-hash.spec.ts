import { describe, expect, it } from 'bun:test';
import { computePayloadHash } from '../../src/domain/services/payload-hash.service';

describe('computePayloadHash', () => {
  it('produces identical hash regardless of object key order', () => {
    const payloadA = {
      providerId: 'provider-a',
      externalTransactionId: 'tx-1',
      money: { amount: '25.00', currency: 'BRL' },
      kind: 'BET',
    };

    const payloadB = {
      kind: 'BET',
      money: { currency: 'BRL', amount: '25.00' },
      externalTransactionId: 'tx-1',
      providerId: 'provider-a',
    };

    expect(computePayloadHash(payloadA)).toBe(computePayloadHash(payloadB));
  });

  it('produces different hash when any business field diverges', () => {
    const payloadA = {
      providerId: 'provider-a',
      externalTransactionId: 'tx-1',
      money: { amount: '25.00', currency: 'BRL' },
      kind: 'BET',
    };

    const payloadB = {
      ...payloadA,
      money: { amount: '30.00', currency: 'BRL' },
    };

    expect(computePayloadHash(payloadA)).not.toBe(computePayloadHash(payloadB));
  });
});
