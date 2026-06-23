/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature, FeatureUpsert } from '@kbn/streams-schema';
import { computeFeatureUuid } from '@kbn/streams-schema';

const normalizeIdPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const parseBracketList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\([^)]*\)/g, '').trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.includes('...'))
    .filter((s) => !s.toLowerCase().includes('multiple services'));

const parseGroundTruthBlocks = (expectedGroundTruth: string): Record<string, string[]> => {
  const blocks: Record<string, string[]> = {};
  const re = /([a-zA-Z_]+)\s*=\s*\[([^\]]*)\]/g;
  for (const match of expectedGroundTruth.matchAll(re)) {
    const key = match[1];
    const list = match[2];
    if (!key || list == null) continue;
    blocks[key] = parseBracketList(list);
  }
  return blocks;
};

const makeKIFeature = ({
  streamName,
  scenarioId,
  id,
  type,
  title,
  description,
  properties,
}: {
  streamName: string;
  scenarioId: string;
  id: string;
  type: string;
  title?: string;
  description: string;
  properties: Record<string, unknown>;
}): FeatureUpsert => ({
  id,
  stream_name: streamName,
  type,
  title,
  description,
  properties,
  confidence: 100,
});

/**
 * Builds a deterministic "canonical" KI feature set from the dataset's
 * `expected_ground_truth` string (e.g. `entities=[...], deps=[...], infra=[...]`).
 *
 * This is intended to decouple query-generation evals from snapshot-extracted
 * KI features so query-generation regressions can be distinguished from KI
 * identification regressions.
 */
export const canonicalKIFeaturesFromExpectedGroundTruth = ({
  streamName,
  scenarioId,
  expectedGroundTruth,
}: {
  streamName: string;
  scenarioId: string;
  expectedGroundTruth: string;
}): Feature[] => {
  const blocks = parseGroundTruthBlocks(expectedGroundTruth);

  const { entities = [], deps = [], infra = [] } = blocks;

  const features: FeatureUpsert[] = [];

  for (const entity of entities) {
    const name = entity.trim();
    const id = `entity-${normalizeIdPart(name)}`;
    features.push(
      makeKIFeature({
        streamName,
        scenarioId,
        id,
        type: 'entity',
        title: name,
        description: `Service/entity: ${name}`,
        properties: { name },
      })
    );
  }

  for (const dep of deps) {
    const arrowIdx = dep.indexOf('->');
    if (arrowIdx === -1) continue;
    const from = dep.slice(0, arrowIdx).trim();
    const to =
      dep
        .slice(arrowIdx + 2)
        .trim()
        .split(/\s+/)[0] ?? '';
    if (!from || !to) continue;

    const id = `dep-${normalizeIdPart(from)}-${normalizeIdPart(to)}`;
    features.push(
      makeKIFeature({
        streamName,
        scenarioId,
        id,
        type: 'dependency',
        title: `${from} → ${to}`,
        description: `Dependency: ${from} → ${to}`,
        properties: { from, to },
      })
    );
  }

  for (const item of infra) {
    const name = item.trim();
    const id = `infra-${normalizeIdPart(name)}`;
    features.push(
      makeKIFeature({
        streamName,
        scenarioId,
        id,
        type: 'infrastructure',
        title: name,
        description: `Infrastructure: ${name}`,
        properties: { name },
      })
    );
  }

  return features.map((feature) => ({ ...feature, uuid: computeFeatureUuid(feature) }));
};
