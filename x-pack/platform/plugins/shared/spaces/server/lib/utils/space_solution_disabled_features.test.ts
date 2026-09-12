/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { KibanaFeature } from '@kbn/features-plugin/server';

import { withSpaceSolutionDisabledFeatures } from './space_solution_disabled_features';

const features = [
  { id: 'feature1', category: { id: 'observability' } },
  { id: 'feature2', category: { id: 'enterpriseSearch' } },
  { id: 'feature3', category: { id: 'securitySolution' } },
  { id: 'feature5', category: { id: 'workplaceai' } },
  { id: 'feature4', category: { id: 'should_not_be_returned' } }, // not a solution, it should never appeared in the disabled features
  { id: 'feature6', category: { id: 'workplaceai' }, deprecated: true },
] as KibanaFeature[];

describe('#withSpaceSolutionDisabledFeatures', () => {
  describe('when the space solution is not set (undefined)', () => {
    test('it does not remove any features', () => {
      const spaceDisabledFeatures: string[] = ['foo'];

      const result = withSpaceSolutionDisabledFeatures(features, spaceDisabledFeatures);

      expect(result).toEqual(['foo']);
    });
  });

  describe('when the space solution is "classic"', () => {
    test('it does not remove any features', () => {
      const spaceDisabledFeatures: string[] = ['foo'];
      const spaceSolution = 'classic';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      expect(result).toEqual(['foo']);
    });
  });

  describe('when the space solution is "es"', () => {
    test('it removes the "oblt", "security" and "workplaceai" features', () => {
      const spaceDisabledFeatures: string[] = ['foo'];
      const spaceSolution = 'es';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      // merges the spaceDisabledFeatures with the disabledFeatureKeysFromSolution
      expect(result).toEqual(['feature1', 'feature3', 'feature5']); // "foo" from the spaceDisabledFeatures should not be removed
    });
  });

  describe('when the space solution is "oblt"', () => {
    test('it removes the "enterpriseSearch", "security" and "workplaceai" features', () => {
      const spaceDisabledFeatures: string[] = [];
      const spaceSolution = 'oblt';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      expect(result).toEqual(['feature2', 'feature3', 'feature5']);
    });
  });

  describe('when the space solution is "security"', () => {
    test('it removes the "observability", "enterpriseSearch" and "workplaceai" features', () => {
      const spaceDisabledFeatures: string[] = ['baz'];
      const spaceSolution = 'security';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      expect(result).toEqual(['feature1', 'feature2', 'feature5']); // "baz" from the spaceDisabledFeatures should not be removed
    });

    test('it does not include deprecated features in space disabled features', () => {
      const spaceDisabledFeatures: string[] = [];
      const spaceSolution = 'security';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      expect(result).not.toContain('feature6');
    });
  });

  describe('when the space solution is "workplaceai"', () => {
    test('it removes the "oblt", "es" and "security" features', () => {
      const spaceDisabledFeatures: string[] = ['foo'];
      const spaceSolution = 'workplaceai';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      // merges the spaceDisabledFeatures with the disabledFeatureKeysFromSolution
      expect(result).toEqual(['feature1', 'feature2', 'feature3']); // "foo" from the spaceDisabledFeatures should not be removed
    });
  });

  describe('when the space solution is "vectordb"', () => {
    test('it removes the "oblt", "security" and "workplaceai" features', () => {
      const spaceDisabledFeatures: string[] = ['foo'];
      const spaceSolution = 'vectordb';

      const result = withSpaceSolutionDisabledFeatures(
        features,
        spaceDisabledFeatures,
        spaceSolution
      );

      // merges the spaceDisabledFeatures with the disabledFeatureKeysFromSolution
      expect(result).toEqual(['feature1', 'feature3', 'feature5']); // "foo" from the spaceDisabledFeatures should not be removed
    });
  });
});
