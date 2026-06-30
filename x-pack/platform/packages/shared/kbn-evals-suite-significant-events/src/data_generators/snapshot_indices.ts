/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sanitizeIndexComponent } from './sanitize_index_component';

// retro-compatibility with current evals suite
const FEATURES_TEMP_INDEX_PREFIX = 'sigevents-streams-features';

const KNOWLEDGE_INDICATORS_PREFIX = 'sigevents-knowledge-indicators';
const DISCOVERIES_TEMP_INDEX_PREFIX = 'sigevents-discoveries';
const DETECTIONS_TEMP_INDEX_PREFIX = 'sigevents-detections';
export const DISCOVERIES_DATA_STREAM = `.significant_events-discoveries`;
export const DETECTIONS_DATA_STREAM = `.significant_events-detections`;
export const EVENTS_DATA_STREAM = '.significant_events-events';
export const KNOWLEDGE_INDICATORS_DATA_STREAM = '.significant_events-knowledge_indicators';
export const FEATURES_TEMP_INDEX_PATTERN = `${FEATURES_TEMP_INDEX_PREFIX}-*`;
export const DISCOVERIES_TEMP_INDEX_PATTERN = `${DISCOVERIES_TEMP_INDEX_PREFIX}-*`;
export const DETECTIONS_TEMP_INDEX_PATTERN = `${DETECTIONS_TEMP_INDEX_PREFIX}-*`;
export const KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN = `${KNOWLEDGE_INDICATORS_PREFIX}-*`;

const getSnapshotIndex =
  (root: string) =>
  (snapshotName: string): string => {
    const component = sanitizeIndexComponent(snapshotName) || 'unknown';
    return `${root}-${component}`;
  };

export const getSnapshotDetectionsIndex = getSnapshotIndex(DETECTIONS_TEMP_INDEX_PREFIX);
export const getSnapshotKIFeaturesIndex = getSnapshotIndex(FEATURES_TEMP_INDEX_PREFIX);
export const getSnapshotDiscoveriesIndex = getSnapshotIndex(DISCOVERIES_TEMP_INDEX_PREFIX);
export const getSnapshotKnowledgeIndicatorsIndex = getSnapshotIndex(KNOWLEDGE_INDICATORS_PREFIX);
