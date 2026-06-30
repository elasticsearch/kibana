/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature } from '@kbn/significant-events-schema';
import { canonicalKIFeaturesFromExpectedGroundTruth } from './canonical_ki_features';

const getFeatureById = (features: Feature[], id: string) =>
  features.find((feature) => feature.id === id);

describe('canonical_ki_features', () => {
  it('creates deterministic entity/dependency/infra KI features from expected_ground_truth', () => {
    const features = canonicalKIFeaturesFromExpectedGroundTruth({
      streamName: 'logs',
      scenarioId: 'payment-unreachable',
      expectedGroundTruth:
        'entities=[frontend, checkout, payment], deps=[frontend->checkout (gRPC), checkout->payment (gRPC)], infra=[kubernetes]',
    });

    expect(getFeatureById(features, 'entity-frontend')?.type).toBe('entity');
    expect(getFeatureById(features, 'entity-frontend')?.properties).toEqual({ name: 'frontend' });

    expect(getFeatureById(features, 'dep-frontend-checkout')?.type).toBe('dependency');
    expect(getFeatureById(features, 'dep-frontend-checkout')?.properties).toEqual({
      from: 'frontend',
      to: 'checkout',
    });
    expect(getFeatureById(features, 'dep-frontend-checkout')?.title).toBe('frontend → checkout');

    expect(getFeatureById(features, 'infra-kubernetes')?.type).toBe('infrastructure');
    expect(getFeatureById(features, 'infra-kubernetes')?.properties).toEqual({
      name: 'kubernetes',
    });
  });

  it('filters ellipsis and "multiple services" items', () => {
    const features = canonicalKIFeaturesFromExpectedGroundTruth({
      streamName: 'logs',
      scenarioId: 'healthy-baseline',
      expectedGroundTruth:
        'entities=[frontend, ..., multiple services], deps=[frontend->checkout], infra=[kubernetes]',
    });

    expect(features.some((feature) => feature.id === 'entity-frontend')).toBe(true);
    expect(features.some((feature) => feature.id.includes('multiple-services'))).toBe(false);
  });

  it('skips malformed deps without ->', () => {
    const features = canonicalKIFeaturesFromExpectedGroundTruth({
      streamName: 'logs',
      scenarioId: 'healthy-baseline',
      expectedGroundTruth: 'deps=[frontend checkout, checkout->payment]',
    });

    expect(features.some((feature) => feature.id === 'dep-checkout-payment')).toBe(true);
    expect(features.some((feature) => feature.description.includes('frontend checkout'))).toBe(
      false
    );
  });

  it('drops text within parentheses from ids', () => {
    const features = canonicalKIFeaturesFromExpectedGroundTruth({
      streamName: 'logs',
      scenarioId: 'scenario',
      expectedGroundTruth: 'entities=[payment (nodejs)], deps=[frontend->checkout (gRPC)]',
    });

    expect(features.some((feature) => feature.id === 'entity-payment')).toBe(true);
    expect(features.some((feature) => feature.id.includes('nodejs'))).toBe(false);
  });
});
