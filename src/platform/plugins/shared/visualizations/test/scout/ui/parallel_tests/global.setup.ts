/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { globalSetupHook, tags } from '@kbn/scout';

// ES archives the visualize-listing kbn archive points at via references.
const ES_ARCHIVES = {
  LOGSTASH_FUNCTIONAL: 'src/platform/test/functional/fixtures/es_archiver/logstash_functional',
};

globalSetupHook(
  'Ingest ES data needed for Visualize listing tests',
  { tag: tags.deploymentAgnostic },
  async ({ esArchiver, log }) => {
    log.info('[setup] Loading ES archives for Visualize listing Scout tests...');
    await esArchiver.loadIfNeeded(ES_ARCHIVES.LOGSTASH_FUNCTIONAL);
    log.info('[setup] Visualize listing ES archives loaded successfully');
  }
);
