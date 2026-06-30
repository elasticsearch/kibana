/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const RELATIONSHIP_KINDS = [
  'accesses_frequently',
  'accesses_infrequently',
  'communicates_with',
  'administers',
  'depends_on',
  'owns',
  'supervises',
] as const;

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

type RelationshipTargetKey = `entity.relationships.${RelationshipKind}.target`;

export interface RelationshipMetadataMaintainer {
  kind: string;
  scan_id: string;
  lookback_window: string;
}

export type RelationshipMetadataDoc = {
  '@timestamp': string;
  'event.kind': 'event';
  'event.action': 'relationship_observed';
  'event.ingested'?: string;
  'entity.id': string;
  'entity.source': string;
  'related.user'?: string[];
  'related.hosts'?: string[];
  Maintainer: RelationshipMetadataMaintainer;
} & {
  [K in RelationshipTargetKey]?: string;
};
