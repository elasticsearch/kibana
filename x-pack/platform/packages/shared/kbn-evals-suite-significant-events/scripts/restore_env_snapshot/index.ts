/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import { restoreEnvSnapshot } from './restore_env_snapshot';
import {
  DEFAULT_ENV_SNAPSHOT_LOGS_INDEX,
  VALID_ALERT_INDICES,
  VALID_SYSTEM_INDICES,
  SIGNIFICANT_EVENTS_DATA_STREAMS,
  GCS_BUCKET,
} from '../lib/constants';

run(({ log, flags }) => restoreEnvSnapshot({ log, flags }), {
  description: `
    Restore a Streams/Significant events environment from a GCS snapshot.

    Automates the full restore workflow:
      1.  Restore plain system indices with rename: snapshot-* → .* (.kibana_streams_tasks)
      2.  Ensure system-index aliases (.kibana_streams_tasks)
      3.  Enable streams via Kibana API
      4.  Restore the significant events data streams (knowledge_indicators, discoveries, detections)
          by reindexing into each data stream so they are not left as plain indices
      5.  Replay data indices with timestamp transformation
      6.  Ensure alert-index alias (.alerts-streams.alerts-default)
      7.  Repromote queries (resets rule_backed, then re-creates rules after restore)

    Prerequisites:
      - Local Elasticsearch running
      - Access to the GCS bucket containing the snapshot
      - The configured user must have the manage_security cluster privilege (required to create and delete the temporary superuser account)

    Examples:
      node scripts/restore_sigevents_env_snapshot.js \\
        --snapshot-name my-snapshot \\
        --gcs-bucket ${GCS_BUCKET} \\
        --gcs-base-path 2026-03-22/sigevents-2026-03-22
  `,
  flags: {
    string: [
      'es-url',
      'es-username',
      'es-password',
      'kibana-url',
      'snapshot-name',
      'gcs-bucket',
      'gcs-base-path',
      'logs-index',
      'alert-indices',
    ],
    boolean: ['clean'],
    help: `
      --snapshot-name         (required) Name of the snapshot to restore
      --gcs-bucket            GCS bucket containing the snapshot (default: ${GCS_BUCKET})
      --gcs-base-path         (required) GCS base path to the snapshot repository
      --logs-index            Logs index to replay. (default: ${DEFAULT_ENV_SNAPSHOT_LOGS_INDEX})
      --alert-indices         Alert index to replay. Valid: ${VALID_ALERT_INDICES.join(', ')}
      --clean                 Delete pre-existing (${[
        ...VALID_ALERT_INDICES,
        ...VALID_SYSTEM_INDICES,
        ...SIGNIFICANT_EVENTS_DATA_STREAMS,
      ].join(
        ', '
      )}) indices before restoring without prompting. Without this flag the script will prompt interactively (or fail in non-TTY environments).
      --es-url                Elasticsearch URL (default: from kibana.dev.yml)
      --es-username           ES username (default: from kibana.dev.yml)
      --es-password           ES password (default: from kibana.dev.yml)
      --kibana-url            Kibana base URL (default: from kibana.dev.yml)
    `,
  },
});
