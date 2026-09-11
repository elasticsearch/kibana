/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRole } from '@kbn/scout';

/**
 * Least-privilege role for the Snapshot and Restore APIs. The routes disable Kibana
 * authorization and act as the current user via the ES client, so the API key needs the
 * matching cluster privileges: `manage` for snapshot/repository operations and
 * `nodes.info`, and `manage_slm` for SLM policy create/execute/status.
 */
export const SNAPSHOT_RESTORE_ADMIN_ROLE: KibanaRole = {
  elasticsearch: { cluster: ['manage', 'manage_slm'] },
  kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
};
