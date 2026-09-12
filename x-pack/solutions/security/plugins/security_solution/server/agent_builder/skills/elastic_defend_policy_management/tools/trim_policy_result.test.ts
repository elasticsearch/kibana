/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { policyFactory } from '../../../../../common/endpoint/models/policy_config';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import {
  DEFAULT_TRIM_LIMITS,
  GUARDED_ENVELOPE_HEADROOM_TOKENS,
  estimateGuardedEnvelopeTokens,
  fitsGuardedEnvelope,
  omitTrailingToFit,
  presentBoundedIdentityStrings,
  presentFromTo,
  presentWithinGuardedBudget,
  toPresentationHash,
  trimPolicyResultWithMeta,
  tryOmitTrailingToFit,
} from './trim_policy_result';

const nest = (depth: number, leaf: unknown): unknown =>
  depth === 0 ? leaf : { next: nest(depth - 1, leaf) };

const items = (length: number) => Array.from({ length }, (_, index) => `item-${index}`);

const keyed = (length: number, value: (index: number) => unknown): Record<string, unknown> => {
  const record: Record<string, unknown> = {};
  for (let index = 0; index < length; index += 1) {
    record[`k${String(index).padStart(2, '0')}`] = value(index);
  }
  return record;
};

const META_KEYS = new Set([
  'string_truncated',
  'value_truncated',
  'value_total',
  'depth_truncated',
  'output_truncated',
  'output_total_nodes',
]);

const countPresentedNodes = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countPresentedNodes(item), 1);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>).reduce(
      (total, [key, item]) => (META_KEYS.has(key) ? total : total + countPresentedNodes(item)),
      1
    );
  }
  return 1;
};

describe('trimPolicyResultWithMeta', () => {
  const presentedValue = (input: unknown) => trimPolicyResultWithMeta(input).value;

  it('caps strings at 512 and annotates only the parent object when cut', () => {
    const exact = 'E'.repeat(512);
    const over = 'Y'.repeat(600);
    expect(presentedValue({ label: exact })).toEqual({ label: exact });
    expect(presentedValue({ label: over })).toEqual({
      label: 'Y'.repeat(512),
      string_truncated: true,
    });
    expect(presentedValue(over)).toBe('Y'.repeat(512));
  });

  it('caps arrays at 50 and discloses the cap through root output metadata', () => {
    const exact = items(50);
    const over = items(80);
    expect(presentedValue({ values: exact })).toEqual({ values: exact });
    expect(presentedValue({ values: over })).toEqual({
      values: over.slice(0, 50),
      output_truncated: true,
      output_total_nodes: 82,
    });
    expect(presentedValue(over)).toEqual(over.slice(0, 50));
  });

  it('discloses nested array caps at the root without hoisting value_total onto complete ancestors', () => {
    const over = items(80);
    const capped = over.slice(0, 50);
    expect(presentedValue({ child: { values: over } })).toEqual({
      child: { values: capped },
      output_truncated: true,
      output_total_nodes: 1 + 1 + 1 + 80,
    });

    const keyCappedChild = { ...keyed(60, (index) => `keep-${index}`), k05: over };
    expect(presentedValue({ child: keyCappedChild })).toEqual({
      child: expect.objectContaining({ value_truncated: true, value_total: 60, k05: capped }),
      output_truncated: true,
      output_total_nodes: 1 + 1 + 59 + 81,
    });
  });

  it('caps object entries at 50 in deterministic key order and reports totals', () => {
    const exact = keyed(50, (index) => `keep-${index}`);
    const over: Record<string, string> = { alpha: 'first', mu: 'middle' };
    for (let index = 0; index < 48; index += 1) {
      over[`n${String(index).padStart(2, '0')}`] = `keep-${index}`;
    }
    over.zzz_secret = 'RAW_DROPPED_VALUE';

    const trimmedExact = presentedValue(exact) as Record<string, unknown>;
    expect(Object.keys(trimmedExact)).toEqual(
      Object.keys(exact).sort((a, b) => a.localeCompare(b))
    );
    expect(trimmedExact).not.toHaveProperty('value_truncated');

    const trimmedOver = presentedValue(over) as Record<string, unknown>;
    const dataKeys = Object.keys(trimmedOver).filter(
      (key) => key !== 'value_truncated' && key !== 'value_total'
    );
    expect(dataKeys).toHaveLength(50);
    expect(dataKeys).toEqual([...dataKeys].sort((a, b) => a.localeCompare(b)));
    expect(dataKeys[0]).toBe('alpha');
    expect(trimmedOver).toEqual(
      expect.objectContaining({
        alpha: 'first',
        mu: 'middle',
        value_truncated: true,
        value_total: 51,
      })
    );
    expect(trimmedOver).not.toHaveProperty('zzz_secret');
    expect(JSON.stringify(trimmedOver)).not.toContain('RAW_DROPPED_VALUE');
  });

  it('stops expanding below depth 10 and does not keep raw deep values', () => {
    const trimmed = presentedValue(nest(10, { secret: 'HIDDEN_DEEP_VALUE' }));
    let leaf = trimmed;
    while (typeof leaf === 'object' && leaf !== null && 'next' in leaf) {
      leaf = (leaf as { next: unknown }).next;
    }
    expect(leaf).toEqual({ depth_truncated: true });
    expect(JSON.stringify(trimmed)).not.toContain('HIDDEN_DEEP_VALUE');
    expect(JSON.stringify(trimmed)).not.toContain('secret');
  });

  it('applies the 500-node presentation budget and reports the original total', () => {
    const trimmed = presentedValue(
      keyed(50, () => Array.from({ length: 50 }, (_, item) => item))
    ) as Record<string, unknown>;
    expect(trimmed.output_truncated).toBe(true);
    expect(trimmed.output_total_nodes).toBe(1 + 50 + 50 * 50);
    expect(countPresentedNodes(trimmed)).toBeLessThanOrEqual(500);
    expect(Object.keys(trimmed).some((key) => /^k\d{2}$/.test(key) && key > 'k09')).toBe(false);
  });

  it('digests the complete stableStringify service hash as a compact SHA-256', () => {
    const serviceHash = hashPolicyConfig(normalize(policyFactory()));
    const digest = toPresentationHash(serviceHash);
    expect(digest).toBe(createHash('sha256').update(serviceHash).digest('hex'));
  });

  it('estimates the exact guarded envelope and omits trailing items with totals', () => {
    const dto = omitTrailingToFit(
      (keep) => ({
        items: Array.from({ length: keep }, (_, index) => ({
          id: `row-${index}`,
          pad: 'N'.repeat(200),
        })),
        items_total: 8,
        items_truncated: keep < 8,
      }),
      8,
      200
    );
    expect(estimateGuardedEnvelopeTokens(dto)).toBeLessThanOrEqual(
      200 - GUARDED_ENVELOPE_HEADROOM_TOKENS
    );
    expect(dto.items_total).toBe(8);
    expect(dto.items_truncated).toBe(true);
    expect(dto.items.length).toBeGreaterThan(0);
    expect(dto.items.length).toBeLessThan(8);
  });

  it("projects only supplied identity fields and keeps those fields' truncation flags", () => {
    expect(
      presentBoundedIdentityStrings({
        id: 'I'.repeat(600),
        name: 'Endpoint Policy',
        revision: 4,
        version: 'V'.repeat(600),
      })
    ).toEqual({
      id: 'I'.repeat(512),
      id_string_truncated: true,
      name: 'Endpoint Policy',
      revision: 4,
      version: 'V'.repeat(512),
      version_string_truncated: true,
    });
  });

  it('presents trimmed from/to values with sided parent metadata only', () => {
    const fromOver = 'Y'.repeat(600);
    const toOver = items(80);
    expect(presentFromTo({ from: fromOver, to: { label: fromOver } }, DEFAULT_TRIM_LIMITS)).toEqual(
      {
        from: 'Y'.repeat(512),
        to: { label: 'Y'.repeat(512), string_truncated: true },
        from_string_truncated: true,
      }
    );

    const capped = toOver.slice(0, 50);
    expect(presentFromTo({ from: toOver, to: toOver }, DEFAULT_TRIM_LIMITS)).toEqual({
      from: capped,
      to: capped,
      from_value_truncated: true,
      from_value_total: 80,
      from_output_truncated: true,
      from_output_total_nodes: 81,
      to_value_truncated: true,
      to_value_total: 80,
      to_output_truncated: true,
      to_output_total_nodes: 81,
    });
  });

  it('returns undefined from tryOmitTrailingToFit when even keep=0 overflows', () => {
    expect(tryOmitTrailingToFit(() => ({ pad: 'X'.repeat(4_000) }), 3, 200)).toBeUndefined();
  });

  it('does not return an over-budget last attempt from omitTrailingToFit', () => {
    const oversized = { pad: 'X'.repeat(4_000) };
    const skeleton = { ok: true, value_total: 8, value_truncated: true };
    const dto = omitTrailingToFit(
      () => oversized,
      3,
      200,
      () => skeleton
    );
    expect(dto).toEqual(skeleton);
    expect(fitsGuardedEnvelope(dto, 200)).toBe(true);
    expect(() => omitTrailingToFit(() => oversized, 0, 200)).toThrow(
      'Policy tool result exceeded the guarded token envelope'
    );
  });

  it('does not return an over-budget last attempt from presentWithinGuardedBudget', () => {
    const oversized = { pad: 'X'.repeat(4_000) };
    const skeleton = { ok: true };
    const dto = presentWithinGuardedBudget(
      () => oversized,
      200,
      () => skeleton
    );
    expect(dto).toEqual(skeleton);
    expect(fitsGuardedEnvelope(dto, 200)).toBe(true);
    expect(
      presentWithinGuardedBudget(
        () => ({ ok: true }),
        200,
        () => skeleton
      )
    ).toEqual({
      ok: true,
    });
    expect(() =>
      presentWithinGuardedBudget(
        () => oversized,
        200,
        () => oversized
      )
    ).toThrow('Policy tool result exceeded the guarded token envelope');
  });
});
