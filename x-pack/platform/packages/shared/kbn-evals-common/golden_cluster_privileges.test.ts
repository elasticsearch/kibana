/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LOGS_INDEX_PATTERN } from './constants';
import { goldenClusterPrivileges } from './golden_cluster_privileges';

describe('goldenClusterPrivileges', () => {
  it('allows harness API keys to read log-backed trace evidence', () => {
    const { indices } =
      goldenClusterPrivileges.kibana_role_descriptors['kbn-evals-all'].elasticsearch;
    const logsPrivileges = indices.find(({ names }) =>
      (names as readonly string[]).includes(LOGS_INDEX_PATTERN)
    );

    expect(logsPrivileges?.privileges).toEqual(
      expect.arrayContaining(['read', 'view_index_metadata'])
    );
  });
});
