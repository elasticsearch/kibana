/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import type { Logger } from '@kbn/logging';
import {
  type Feature,
  type FeatureUpsert,
  type BaseFeature,
  isDuplicateFeature,
  hasSameFingerprint,
  mergeFeature,
  normalizeFeatureSlug,
  toBaseFeature,
} from '@kbn/streams-schema';
import type { IgnoredFeature } from '@kbn/streams-ai';

export const toFeatureSummary = ({ id, title }: BaseFeature) => ({ id, title: title ?? id });

export const toFeatureProjection = ({
  id,
  type,
  subtype,
  title,
  description,
  properties,
}: BaseFeature) => ({
  id,
  type,
  subtype,
  title,
  description,
  properties,
});

export function createFeatureMetadata({ runId }: { runId: string }) {
  return { run_id: runId };
}

export function reconcileComputedFeatures({
  computedFeatures,
  streamName,
  runId,
}: {
  computedFeatures: BaseFeature[];
  streamName: string;
  runId: string;
}): FeatureUpsert[] {
  const metadata = createFeatureMetadata({ runId });
  return computedFeatures.map((feature) => ({
    ...feature,
    ...metadata,
  }));
}

function filterExcluded(
  rawFeatures: ReadonlyArray<BaseFeature>,
  excludedFeatures: ReadonlyArray<Feature>,
  logger: Logger
): { nonExcluded: BaseFeature[]; codeIgnoredCount: number } {
  const excludedByLowerId = new Set(excludedFeatures.map((f) => normalizeFeatureSlug(f.id)));
  let codeIgnoredCount = 0;

  const nonExcluded = rawFeatures.filter((feature) => {
    const lowerId = normalizeFeatureSlug(feature.id);
    if (excludedByLowerId.has(lowerId)) {
      codeIgnoredCount++;
      logger.debug(`Dropping inferred feature [${feature.id}] matches excluded feature by ID`);
      return false;
    }
    const fingerprintMatch = excludedFeatures.find((excluded) =>
      hasSameFingerprint(feature, excluded)
    );
    if (fingerprintMatch) {
      codeIgnoredCount++;
      logger.debug(
        `Dropping inferred feature [${feature.id}] because it matches excluded feature [${fingerprintMatch.id}] by fingerprint`
      );
      return false;
    }
    return true;
  });

  return { nonExcluded, codeIgnoredCount };
}

export function reconcileInferredFeatures({
  rawFeatures,
  allKnownFeatures,
  discoveredFeatures,
  ignoredFeatures,
  excludedFeatures,
  runId,
  logger,
}: {
  rawFeatures: BaseFeature[];
  allKnownFeatures: Feature[];
  discoveredFeatures: ReadonlyArray<Feature>;
  ignoredFeatures: IgnoredFeature[];
  excludedFeatures: ReadonlyArray<Feature>;
  runId: string;
  logger: Logger;
}): { newFeatures: FeatureUpsert[]; updatedFeatures: FeatureUpsert[]; codeIgnoredCount: number } {
  const metadata = createFeatureMetadata({ runId });
  const newFeatures: FeatureUpsert[] = [];
  const updatedFeatures: FeatureUpsert[] = [];

  for (const ignored of ignoredFeatures) {
    logger.debug(
      `LLM ignored feature "${ignored.feature_id}" (matched excluded "${ignored.excluded_feature_id}"): ${ignored.reason}`
    );
  }

  const { nonExcluded, codeIgnoredCount } = filterExcluded(rawFeatures, excludedFeatures, logger);

  const discoveredSet = new Set(discoveredFeatures.map((f) => f.id));
  const byLowerId = new Map<string, Feature>();
  for (const f of allKnownFeatures) {
    byLowerId.set(normalizeFeatureSlug(f.id), f);
  }

  for (const raw of nonExcluded) {
    const match =
      byLowerId.get(normalizeFeatureSlug(raw.id)) ??
      allKnownFeatures.find((f) => isDuplicateFeature(f, raw));

    if (match) {
      if (!discoveredSet.has(match.id)) {
        updatedFeatures.push({ ...raw, ...metadata });
      } else {
        const merged = mergeFeature(match, raw);
        if (!isEqual(merged, toBaseFeature(match))) {
          updatedFeatures.push({ ...merged, ...metadata });
        }
      }
    } else {
      newFeatures.push({ ...raw, ...metadata });
    }
  }

  return { newFeatures, updatedFeatures, codeIgnoredCount };
}
