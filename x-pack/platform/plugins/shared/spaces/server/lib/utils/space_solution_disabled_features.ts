/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SolutionId } from '@kbn/core-chrome-browser';
import type { KibanaFeature } from '@kbn/features-plugin/server';

import type { SolutionView } from '../../../common';

const getFeatureIdsForCategories = (
  features: KibanaFeature[],
  categories: Array<
    'observability' | 'enterpriseSearch' | 'securitySolution' | 'workplaceai' | 'vectordb'
  >
) => {
  return features
    .filter((feature) =>
      // We need to make sure we only reference non-deprecated features
      feature.category && !feature.deprecated
        ? categories.includes(
            feature.category.id as
              | 'observability'
              | 'enterpriseSearch'
              | 'securitySolution'
              | 'workplaceai'
              | 'vectordb'
          )
        : false
    )
    .map((feature) => feature.id);
};

/**
 * These features will be enabled per solution view, even if they fall under a category that is disabled in the solution.
 */

const enabledFeaturesPerSolution: Record<SolutionId, string[]> = {
  es: ['observabilityAIAssistant'],
  oblt: [],
  security: [],
  workplaceai: [],
  vectordb: [],
};

/**
 * When a space has a `solution` defined, we want to disable features that are not part of that solution.
 * This function takes the current space's disabled features and the space solution and returns
 * the updated array of disabled features.
 *
 * @param features The list of all Kibana registered features.
 * @param spaceDisabledFeatures The current space's disabled features
 * @param spaceSolution The current space's solution (es, oblt, security or classic)
 * @returns The updated array of disabled features
 */
export function withSpaceSolutionDisabledFeatures(
  features: KibanaFeature[],
  spaceDisabledFeatures: string[] = [],
  spaceSolution: SolutionView = 'classic'
): string[] {
  if (spaceSolution === 'classic') {
    return spaceDisabledFeatures;
  }

  let disabledFeatureKeysFromSolution: string[] = [];

  if (spaceSolution === 'es') {
    disabledFeatureKeysFromSolution = getFeatureIdsForCategories(features, [
      'observability',
      'securitySolution',
      'workplaceai',
    ]).filter((featureId) => !enabledFeaturesPerSolution.es.includes(featureId));
  } else if (spaceSolution === 'oblt') {
    disabledFeatureKeysFromSolution = getFeatureIdsForCategories(features, [
      'enterpriseSearch',
      'securitySolution',
      'workplaceai',
    ]).filter((featureId) => !enabledFeaturesPerSolution.oblt.includes(featureId));
  } else if (spaceSolution === 'security') {
    disabledFeatureKeysFromSolution = getFeatureIdsForCategories(features, [
      'observability',
      'enterpriseSearch',
      'workplaceai',
    ]).filter((featureId) => !enabledFeaturesPerSolution.security.includes(featureId));
  } else if (spaceSolution === 'workplaceai') {
    disabledFeatureKeysFromSolution = getFeatureIdsForCategories(features, [
      'observability',
      'securitySolution',
      'enterpriseSearch',
    ]).filter((featureId) => !enabledFeaturesPerSolution.workplaceai.includes(featureId));
  } else if (spaceSolution === 'vectordb') {
    disabledFeatureKeysFromSolution = getFeatureIdsForCategories(features, [
      'observability',
      'securitySolution',
      'workplaceai',
    ]).filter((featureId) => !enabledFeaturesPerSolution.vectordb.includes(featureId));
  }

  return Array.from(new Set([...disabledFeatureKeysFromSolution]));
}
