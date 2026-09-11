/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnonymizationRule, Message } from '@kbn/inference-common';

export const PII_TOKENIZATION_CAPABILITY_ID = 'inference.pii_tokenization';
export const INFERENCE_PROCEED_CAPABILITY_ID = 'inference.proceed';

export interface PiiTextRecord {
  readonly id: string;
  readonly text: string;
}

export interface DetectedPiiEntity {
  readonly recordId: string;
  readonly start: number;
  readonly end: number;
  readonly value: string;
  readonly entityClass: string;
}

export interface PiiTokenizationContext {
  detectEntities(options: {
    records: readonly PiiTextRecord[];
    rules: readonly AnonymizationRule[];
    abortSignal?: AbortSignal;
  }): Promise<readonly DetectedPiiEntity[]>;

  /**
   * Generates a replacement token for the given entity class and original value.
   *
   * **MUST be deterministic**: calling `tokenize` with the same `(entityClass, value)` pair
   * within a single call MUST return the same token. The PII-application logic uses this
   * guarantee to deduplicate repeated occurrences into a single token-map entry and to detect
   * collisions. A non-deterministic implementation would silently corrupt the token map and
   * break PII restoration.
   */
  tokenize(entityClass: string, value: string): string;
}

export interface InferenceTokenMapEntry {
  readonly original: string;
  readonly entityClass: string;
}

export interface InferenceProceedInput {
  readonly system?: string;
  readonly messages: readonly Message[];
  readonly tokenMap?: Readonly<Record<string, InferenceTokenMapEntry>>;
  readonly restoreStreamingContent?: boolean;
  readonly restoreToolCallArguments?: boolean;
  readonly dryRun?: boolean;
  readonly abortSignal?: AbortSignal;
}

export interface InferenceProceedCapability {
  invoke(input: InferenceProceedInput): Promise<{ rawContent: string }>;
}

// Non-enumerable Symbols used as sentinels on capability value objects. They survive
// Object.freeze() but are stripped by JSON.stringify, so a serialized-and-reparsed value
// will be missing the sentinel and fail the identity check with a diagnostic error rather
// than a silent WeakMap miss.
const PII_TOKENIZATION_CAPABILITY_MARKER = Symbol('inference.pii_tokenization.capability');
const INFERENCE_PROCEED_CAPABILITY_MARKER = Symbol('inference.proceed.capability');

const piiTokenizationCapabilities = new WeakMap<object, PiiTokenizationContext>();
const inferenceProceedCapabilities = new WeakMap<object, InferenceProceedCapability>();

export const createPiiTokenizationCapabilityValue = (
  capability: PiiTokenizationContext
): object => {
  const value: Record<symbol, boolean> = {};
  value[PII_TOKENIZATION_CAPABILITY_MARKER] = true;
  Object.freeze(value);
  piiTokenizationCapabilities.set(value, capability);
  return value;
};

export const resolvePiiTokenizationCapabilityValue = (
  value: object
): PiiTokenizationContext | undefined => {
  if (!(PII_TOKENIZATION_CAPABILITY_MARKER in value)) {
    return undefined;
  }
  return piiTokenizationCapabilities.get(value);
};

export const createInferenceProceedCapabilityValue = (
  capability: InferenceProceedCapability
): object => {
  const value: Record<symbol, boolean> = {};
  value[INFERENCE_PROCEED_CAPABILITY_MARKER] = true;
  Object.freeze(value);
  inferenceProceedCapabilities.set(value, capability);
  return value;
};

export const resolveInferenceProceedCapabilityValue = (
  value: object
): InferenceProceedCapability | undefined => {
  if (!(INFERENCE_PROCEED_CAPABILITY_MARKER in value)) {
    return undefined;
  }
  return inferenceProceedCapabilities.get(value);
};
