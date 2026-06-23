/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import type { KibanaRole } from '@kbn/scout';

export const GRAPH_UI_TAGS = [...tags.stateful.classic];

export const SECREPO_ES_ARCHIVE = 'x-pack/platform/test/fixtures/es_archives/graph/secrepo';

export const SECREPO_INDEX = 'secrepo';
export const SECREPO_TIME_FIELD = '@timestamp';

// Default fields the FTR workspace flow added before running its first query.
export const SECREPO_DEFAULT_FIELDS = ['url.parts', 'url', 'params', 'src'];

// FTR parity: roles used by the security feature-control specs. Mirrors the
// shapes of the FTR `feature_controls/graph_security.ts` roles.
export const GRAPH_ALL_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [{ names: [SECREPO_INDEX], privileges: ['read', 'view_index_metadata'] }],
  },
  kibana: [
    {
      base: [],
      feature: { graph: ['all'] },
      spaces: ['*'],
    },
  ],
};

export const GRAPH_READ_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [{ names: [SECREPO_INDEX], privileges: ['read', 'view_index_metadata'] }],
  },
  kibana: [
    {
      base: [],
      feature: { graph: ['read'] },
      spaces: ['*'],
    },
  ],
};

export const CUSTOM_SPACE_ID = 'custom_space';

/**
 * Shared sample graph workspaces and saved-object attributes used by the
 * graph listing Scout specs. Hoisted into the fixtures module so spec files
 * can't drift on shape (the `kbnClient.savedObjects.create` payloads have
 * to stay in lockstep with the `graph-workspace` saved-object schema).
 */

export const GRAPH_A = { title: 'Graph Alpha', description: 'First test graph' };
export const GRAPH_B = { title: 'Graph Beta', description: 'Second test graph' };

/**
 * Required saved-object fields for a `graph-workspace` beyond `title` and
 * `description`. Empty workspace state is fine for listing-only coverage.
 */
export const WORKSPACE_ATTRS = { numLinks: 0, numVertices: 0, wsState: '{}', version: 1 };
