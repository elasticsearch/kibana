/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import {
  SYNTHETIC_SMOKE_DATA_STREAM,
  SYNTHETIC_SMOKE_DOCUMENT_COUNT,
  SYNTHETIC_SMOKE_SEED,
} from '../../src/seed_data/sources';
import { ES_CONNECTION_FLAGS, ES_CONNECTION_FLAGS_HELP } from '../lib/es_client';
import { publishSyntheticSnapshot } from './publish_synthetic_snapshot';

const { bucket, basePath, snapshotName } = SYNTHETIC_SMOKE_SEED;

run(publishSyntheticSnapshot, {
  description: `
    Publish the synthetic snapshot that the Nightshift investigations smoke eval restores.

    Seeds throwaway documents into ${SYNTHETIC_SMOKE_DATA_STREAM} on a local cluster, snapshots
    them to gs://${bucket}/${basePath} as "${snapshotName}", then removes the local copy. If that
    snapshot already exists the run fails, because overwriting one is not recoverable; pass
    --replace to refresh it anyway.

    Elasticsearch uploads to GCS itself, using credentials from its keystore. The Scout
    "evals_tracing" server config loads them from GCS_CREDENTIALS, so the usual flow is:

      export GCS_CREDENTIALS="$(cat service-account.json)"
      node scripts/scout start-server --serverConfigSet evals_tracing
      node scripts/publish_nightshift_eval_snapshot.js

    The service account needs write access to the bucket. The read-only credential CI uses to
    restore snapshots is not enough to publish one.

    Examples:
      node scripts/publish_nightshift_eval_snapshot.js
      node scripts/publish_nightshift_eval_snapshot.js --document-count 2000
      node scripts/publish_nightshift_eval_snapshot.js --es-url http://elastic:changeme@localhost:9200
  `,
  flags: {
    string: [...ES_CONNECTION_FLAGS, 'document-count'],
    boolean: ['keep-local-data', 'replace'],
    help: `${ES_CONNECTION_FLAGS_HELP}
      --replace           Delete and re-publish "${snapshotName}" when it already exists.
                          Without this, a run that would overwrite a snapshot fails instead.

      --document-count    Documents to seed (default: ${SYNTHETIC_SMOKE_DOCUMENT_COUNT}).
                          Raising it also means raising SYNTHETIC_SMOKE_DOCUMENT_COUNT, which is
                          what the eval scores against.

      --keep-local-data   Leave ${SYNTHETIC_SMOKE_DATA_STREAM} in the local cluster after
                          publishing, to inspect what went into the snapshot
    `,
  },
});
