/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import { captureEnvSnapshot } from './capture_env_snapshot';
import { DEFAULT_ENV_SNAPSHOT_LOGS_INDEX, VALID_ALERT_INDICES } from '../lib/constants';

run(({ log, flags }) => captureEnvSnapshot({ log, flags }), {
  description: `
    Capture the current Streams/SigEvents environment into a GCS snapshot.

    Protected Kibana system indices (Streams .kibana_streams_*) and the KI data stream are
    reindexed to snapshot-safe names (snapshot-*) with mappings preserved.
    --logs-index and --alert-indices are included directly in the snapshot (not reindexed).

    Prerequisites:
      - Local Elasticsearch with GCS credentials in keystore
      - The configured user must have the manage_security cluster privilege (required to create and delete the temporary superuser account)

    Examples:
      node scripts/capture_sigevents_env_snapshot.js --snapshot-name my-snapshot
  `,
  flags: {
    string: [
      'es-url',
      'es-username',
      'es-password',
      'kibana-url',
      'snapshot-name',
      'run-id',
      'logs-index',
      'alert-indices',
    ],
    help: `
      --snapshot-name         (required) Name for the snapshot
      --run-id                Run identifier for GCS repo name and base path (default: today's date YYYY-MM-DD)
      --logs-index            Logs index to include in snapshot + replay. (default: ${DEFAULT_ENV_SNAPSHOT_LOGS_INDEX})
      --alert-indices         Alert index to include in snapshot + replay. Valid: ${VALID_ALERT_INDICES.join(
        ', '
      )}
      --es-url                Elasticsearch URL (default: from kibana.dev.yml)
      --es-username           ES username (default: from kibana.dev.yml)
      --es-password           ES password (default: from kibana.dev.yml)
      --kibana-url            Kibana base URL (default: from kibana.dev.yml)
    `,
  },
});
