/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import { createOtherResult } from '@kbn/agent-builder-server';
import type { PolicyIdentity } from '../services/read_policy';

const MAX_STRING_LENGTH = 512;
const MAX_CONTAINER_ENTRIES = 50;
const MAX_DEPTH = 10;
const MAX_PRESENTATION_NODES = 500;

export type TrimLimits = Readonly<{
  maxStringLength: number;
  maxContainerEntries: number;
  maxDepth: number;
  maxPresentationNodes: number;
}>;

export const DEFAULT_TRIM_LIMITS: TrimLimits = {
  maxStringLength: MAX_STRING_LENGTH,
  maxContainerEntries: MAX_CONTAINER_ENTRIES,
  maxDepth: MAX_DEPTH,
  maxPresentationNodes: MAX_PRESENTATION_NODES,
};

export const TIGHTEST_TRIM_LIMITS: TrimLimits = {
  maxStringLength: 0,
  maxContainerEntries: 0,
  maxDepth: 1,
  maxPresentationNodes: 1,
};

export const TIGHTER_TRIM_LIMITS: readonly TrimLimits[] = [
  {
    maxStringLength: 256,
    maxContainerEntries: 25,
    maxDepth: 8,
    maxPresentationNodes: 200,
  },
  {
    maxStringLength: 128,
    maxContainerEntries: 10,
    maxDepth: 6,
    maxPresentationNodes: 80,
  },
  {
    maxStringLength: 64,
    maxContainerEntries: 5,
    maxDepth: 4,
    maxPresentationNodes: 30,
  },
  {
    maxStringLength: 32,
    maxContainerEntries: 2,
    maxDepth: 3,
    maxPresentationNodes: 15,
  },
  {
    maxStringLength: 16,
    maxContainerEntries: 1,
    maxDepth: 2,
    maxPresentationNodes: 8,
  },
  TIGHTEST_TRIM_LIMITS,
];

export type PolicyTrimMetadata = Readonly<{
  string_truncated?: true;
  value_truncated?: true;
  value_total?: number;
  output_truncated?: true;
  output_total_nodes?: number;
}>;

export type PolicyTrimResult = Readonly<{
  value: unknown;
  metadata: PolicyTrimMetadata;
}>;

interface TrimState {
  presentedNodes: number;
  outputTruncated: boolean;
}

interface InternalTrim {
  value: unknown;
  stringTruncated: boolean;
  valueTruncated: boolean;
  valueTotal?: number;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortedKeys = (record: Record<string, unknown>): string[] =>
  Object.keys(record).sort((left, right) => left.localeCompare(right));

const countNodes = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countNodes(item), 1);
  }
  if (isPlainObject(value)) {
    return Object.values(value).reduce<number>((total, item) => total + countNodes(item), 1);
  }
  return 1;
};

const reserveNode = (state: TrimState, limits: TrimLimits): boolean => {
  if (state.presentedNodes >= limits.maxPresentationNodes) {
    state.outputTruncated = true;
    return false;
  }
  state.presentedNodes += 1;
  return true;
};

const trimString = (value: string, limits: TrimLimits): InternalTrim => ({
  value: value.length > limits.maxStringLength ? value.slice(0, limits.maxStringLength) : value,
  stringTruncated: value.length > limits.maxStringLength,
  valueTruncated: false,
});

const trimArray = (
  value: unknown[],
  depth: number,
  state: TrimState,
  limits: TrimLimits
): InternalTrim => {
  const entriesCapped = value.length > limits.maxContainerEntries;
  if (entriesCapped) {
    state.outputTruncated = true;
  }
  const capped = value.slice(0, limits.maxContainerEntries);
  const items: unknown[] = [];
  let stringTruncated = false;

  for (const item of capped) {
    if (state.presentedNodes >= limits.maxPresentationNodes) {
      state.outputTruncated = true;
      break;
    }
    const child = trimValue(item, depth + 1, state, limits);
    items.push(child.value);
    stringTruncated = stringTruncated || child.stringTruncated;
  }

  return {
    value: items,
    stringTruncated,
    valueTruncated: entriesCapped,
    valueTotal: entriesCapped ? value.length : undefined,
  };
};

const trimObject = (
  value: Record<string, unknown>,
  depth: number,
  state: TrimState,
  limits: TrimLimits
): InternalTrim => {
  const keys = sortedKeys(value);
  const objectTruncated = keys.length > limits.maxContainerEntries;
  const keysToKeep = keys.slice(0, limits.maxContainerEntries);
  const result: Record<string, unknown> = {};
  let stringTruncated = false;

  for (const key of keysToKeep) {
    if (state.presentedNodes >= limits.maxPresentationNodes) {
      state.outputTruncated = true;
      break;
    }
    const child = trimValue(value[key], depth + 1, state, limits);
    result[key] = child.value;
    stringTruncated = stringTruncated || child.stringTruncated;
  }

  if (stringTruncated) {
    result.string_truncated = true;
  }
  if (objectTruncated) {
    result.value_truncated = true;
    result.value_total = keys.length;
  }

  return {
    value: result,
    stringTruncated,
    valueTruncated: objectTruncated,
    valueTotal: objectTruncated ? keys.length : undefined,
  };
};

const trimValue = (
  value: unknown,
  depth: number,
  state: TrimState,
  limits: TrimLimits
): InternalTrim => {
  if (!reserveNode(state, limits)) {
    return { value: undefined, stringTruncated: false, valueTruncated: false };
  }

  if (typeof value === 'string') {
    return trimString(value, limits);
  }

  if (value === null || typeof value !== 'object') {
    return { value, stringTruncated: false, valueTruncated: false };
  }

  if (depth >= limits.maxDepth) {
    return { value: { depth_truncated: true }, stringTruncated: false, valueTruncated: false };
  }

  if (Array.isArray(value)) {
    return trimArray(value, depth, state, limits);
  }

  if (!isPlainObject(value)) {
    return { value, stringTruncated: false, valueTruncated: false };
  }

  return trimObject(value, depth, state, limits);
};

const attachRootBudget = (
  value: Record<string, unknown>,
  state: TrimState,
  originalNodeCount: number
): Record<string, unknown> => {
  if (!state.outputTruncated) {
    return value;
  }

  return {
    ...value,
    output_truncated: true,
    output_total_nodes: originalNodeCount,
  };
};

const toMetadata = (
  trimmed: InternalTrim,
  state: TrimState,
  originalNodeCount: number,
  presentedValue: unknown
): PolicyTrimMetadata => {
  const metadata: {
    string_truncated?: true;
    value_truncated?: true;
    value_total?: number;
    output_truncated?: true;
    output_total_nodes?: number;
  } = {};

  if (trimmed.stringTruncated) {
    metadata.string_truncated = true;
  }

  if (isPlainObject(presentedValue) && presentedValue.value_truncated === true) {
    metadata.value_truncated = true;
    if (typeof presentedValue.value_total === 'number') {
      metadata.value_total = presentedValue.value_total;
    }
  } else if (trimmed.valueTruncated) {
    metadata.value_truncated = true;
    if (trimmed.valueTotal !== undefined) {
      metadata.value_total = trimmed.valueTotal;
    }
  }

  if (state.outputTruncated) {
    metadata.output_truncated = true;
    metadata.output_total_nodes = originalNodeCount;
  }

  return metadata;
};

export const toPresentationHash = (serviceHash: string): string =>
  createHash('sha256').update(serviceHash).digest('hex');

export const trimPolicyResultWithMeta = (
  input: unknown,
  limits: TrimLimits = DEFAULT_TRIM_LIMITS
): PolicyTrimResult => {
  const state: TrimState = { presentedNodes: 0, outputTruncated: false };
  const originalNodeCount = countNodes(input);
  const trimmed = trimValue(input, 0, state, limits);
  const value = isPlainObject(trimmed.value)
    ? attachRootBudget(trimmed.value, state, originalNodeCount)
    : trimmed.value;

  return {
    value,
    metadata: toMetadata(trimmed, state, originalNodeCount, value),
  };
};

export const parentTrimMetadata = (
  value: unknown,
  metadata: PolicyTrimMetadata
): PolicyTrimMetadata => (isPlainObject(value) ? {} : metadata);

export const sidedTrimMetadata = (
  side: 'from' | 'to',
  metadata: PolicyTrimMetadata
): Record<string, true | number> => {
  const prefixed: Record<string, true | number> = {};
  if (metadata.string_truncated) {
    prefixed[`${side}_string_truncated`] = true;
  }
  if (metadata.value_truncated) {
    prefixed[`${side}_value_truncated`] = true;
    if (metadata.value_total !== undefined) {
      prefixed[`${side}_value_total`] = metadata.value_total;
    }
  }
  if (metadata.output_truncated) {
    prefixed[`${side}_output_truncated`] = true;
    if (metadata.output_total_nodes !== undefined) {
      prefixed[`${side}_output_total_nodes`] = metadata.output_total_nodes;
    }
  }
  return prefixed;
};

export type PrefixedTrimMetadata<Side extends 'from' | 'to'> = {
  [Key in keyof PolicyTrimMetadata as `${Side}_${Key & string}`]?: PolicyTrimMetadata[Key];
};

export type PresentedFromTo = Readonly<{ from: unknown; to: unknown }> &
  PrefixedTrimMetadata<'from'> &
  PrefixedTrimMetadata<'to'>;

export const presentFromTo = (
  entry: Readonly<{ from: unknown; to: unknown }>,
  limits: TrimLimits
): PresentedFromTo => {
  const fromTrim = trimPolicyResultWithMeta(entry.from, limits);
  const toTrim = trimPolicyResultWithMeta(entry.to, limits);
  return {
    from: fromTrim.value,
    to: toTrim.value,
    ...sidedTrimMetadata('from', parentTrimMetadata(fromTrim.value, fromTrim.metadata)),
    ...sidedTrimMetadata('to', parentTrimMetadata(toTrim.value, toTrim.metadata)),
  };
};

export const GUARDED_ENVELOPE_HEADROOM_TOKENS = 64;

type PolicyIdentityStringKey =
  | 'id'
  | 'name'
  | 'description'
  | 'version'
  | 'updatedAt'
  | 'updatedBy'
  | 'packageVersion';

export type PresentedPolicyIdentity<T extends Partial<PolicyIdentity> = PolicyIdentity> = Pick<
  T,
  Extract<keyof T, keyof PolicyIdentity>
> &
  Partial<Record<`${Extract<keyof T, PolicyIdentityStringKey>}_string_truncated`, true>>;

type WritablePresentedIdentity = {
  -readonly [Key in keyof PresentedPolicyIdentity<
    Partial<PolicyIdentity>
  >]?: PresentedPolicyIdentity<Partial<PolicyIdentity>>[Key];
};

const IDENTITY_STRING_KEYS = [
  'id',
  'name',
  'description',
  'version',
  'updatedAt',
  'updatedBy',
  'packageVersion',
] as const satisfies readonly PolicyIdentityStringKey[];

const capPresentedIdentityString = (value: string): { text: string; truncated: boolean } => {
  if (value.length <= MAX_STRING_LENGTH) {
    return { text: value, truncated: false };
  }

  return { text: value.slice(0, MAX_STRING_LENGTH), truncated: true };
};

export function presentBoundedIdentityStrings<T extends Partial<PolicyIdentity>>(
  policy: T
): PresentedPolicyIdentity<T>;
export function presentBoundedIdentityStrings(
  policy: Partial<PolicyIdentity>
): PresentedPolicyIdentity<Partial<PolicyIdentity>> {
  const presented: WritablePresentedIdentity = {};

  if (policy.revision !== undefined) {
    presented.revision = policy.revision;
  }

  for (const key of IDENTITY_STRING_KEYS) {
    const value = policy[key];
    if (value !== undefined) {
      const { text, truncated } = capPresentedIdentityString(value);
      presented[key] = text;
      if (truncated) {
        presented[`${key}_string_truncated`] = true;
      }
    }
  }

  return presented;
}

export const estimateGuardedEnvelopeTokens = (dto: object): number =>
  estimateTokens(JSON.stringify({ results: [createOtherResult(dto)] }));

export const fitsGuardedEnvelope = (dto: object, maxTokens: number): boolean =>
  estimateGuardedEnvelopeTokens(dto) + GUARDED_ENVELOPE_HEADROOM_TOKENS <= maxTokens;

const requireFittedEnvelope = <T extends object>(dto: T, maxTokens: number): T => {
  if (!fitsGuardedEnvelope(dto, maxTokens)) {
    throw new Error('Policy tool result exceeded the guarded token envelope');
  }
  return dto;
};

const omitTrailingUntilFit = <T extends object>(
  build: (keep: number) => T,
  initialKeep: number,
  maxTokens: number
): { dto: T; fitted: boolean } => {
  let keep = initialKeep;
  let dto = build(keep);
  while (keep > 0 && !fitsGuardedEnvelope(dto, maxTokens)) {
    keep -= 1;
    dto = build(keep);
  }
  return { dto, fitted: fitsGuardedEnvelope(dto, maxTokens) };
};

export const tryOmitTrailingToFit = <T extends object>(
  build: (keep: number) => T,
  initialKeep: number,
  maxTokens: number
): T | undefined => {
  const { dto, fitted } = omitTrailingUntilFit(build, initialKeep, maxTokens);
  return fitted ? dto : undefined;
};

export const omitTrailingToFit = <T extends object, F extends object = T>(
  build: (keep: number) => T,
  initialKeep: number,
  maxTokens: number,
  fallback?: () => F
): T | F => {
  const { dto, fitted } = omitTrailingUntilFit(build, initialKeep, maxTokens);
  if (fitted) {
    return dto;
  }
  return requireFittedEnvelope(fallback !== undefined ? fallback() : dto, maxTokens);
};

export const presentWithinGuardedBudget = <T extends object, F extends object>(
  build: (limits: TrimLimits) => T,
  maxTokens: number,
  fallback: () => F
): T | F => {
  let dto = build(DEFAULT_TRIM_LIMITS);
  if (fitsGuardedEnvelope(dto, maxTokens)) {
    return dto;
  }

  for (const limits of TIGHTER_TRIM_LIMITS) {
    dto = build(limits);
    if (fitsGuardedEnvelope(dto, maxTokens)) {
      return dto;
    }
  }

  return requireFittedEnvelope(fallback(), maxTokens);
};
