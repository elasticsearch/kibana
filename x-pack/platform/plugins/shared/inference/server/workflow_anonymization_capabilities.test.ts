/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createPiiTokenizationCapabilityValue,
  resolvePiiTokenizationCapabilityValue,
  createInferenceProceedCapabilityValue,
  resolveInferenceProceedCapabilityValue,
} from './workflow_anonymization_capabilities';
import type {
  PiiTokenizationContext,
  InferenceProceedCapability,
} from './workflow_anonymization_capabilities';

const makePiiContext = (): PiiTokenizationContext => ({
  detectEntities: jest.fn(),
  tokenize: jest.fn(),
});

const makeProceedCapability = (): InferenceProceedCapability => ({
  invoke: jest.fn(),
});

describe('PiiTokenizationCapability', () => {
  it('round-trips: resolved value matches registered capability', () => {
    const capability = makePiiContext();
    const token = createPiiTokenizationCapabilityValue(capability);
    expect(resolvePiiTokenizationCapabilityValue(token)).toBe(capability);
  });

  it('returns undefined for a plain object without the marker', () => {
    expect(resolvePiiTokenizationCapabilityValue({})).toBeUndefined();
  });

  it('returns undefined for a frozen object without the marker', () => {
    expect(resolvePiiTokenizationCapabilityValue(Object.freeze({}))).toBeUndefined();
  });

  it('produces an opaque token — the value object exposes no capability methods', () => {
    const token = createPiiTokenizationCapabilityValue(makePiiContext());
    expect((token as Record<string, unknown>).detectEntities).toBeUndefined();
    expect((token as Record<string, unknown>).tokenize).toBeUndefined();
  });
});

describe('InferenceProceedCapability', () => {
  it('round-trips: resolved value matches registered capability', () => {
    const capability = makeProceedCapability();
    const token = createInferenceProceedCapabilityValue(capability);
    expect(resolveInferenceProceedCapabilityValue(token)).toBe(capability);
  });

  it('returns undefined for a plain object without the marker', () => {
    expect(resolveInferenceProceedCapabilityValue({})).toBeUndefined();
  });

  it('returns undefined for a frozen object without the marker', () => {
    expect(resolveInferenceProceedCapabilityValue(Object.freeze({}))).toBeUndefined();
  });

  it('produces an opaque token — the value object exposes no capability methods', () => {
    const token = createInferenceProceedCapabilityValue(makeProceedCapability());
    expect((token as Record<string, unknown>).invoke).toBeUndefined();
  });

  it('different capability instances produce distinct tokens that each resolve correctly', () => {
    const capA = makeProceedCapability();
    const capB = makeProceedCapability();
    const tokenA = createInferenceProceedCapabilityValue(capA);
    const tokenB = createInferenceProceedCapabilityValue(capB);
    expect(resolveInferenceProceedCapabilityValue(tokenA)).toBe(capA);
    expect(resolveInferenceProceedCapabilityValue(tokenB)).toBe(capB);
    expect(resolveInferenceProceedCapabilityValue(tokenA)).not.toBe(capB);
  });
});
