/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENDPOINT_ARTIFACT_LIST_IDS } from '@kbn/securitysolution-list-constants';
import { getEndpointArtifactsApiService, globalTeardownHook } from '@kbn/scout-security';
import { deleteEndpointFieldCapsDocs } from '../fixtures/seed_endpoint_field_caps';

globalTeardownHook(
  'Delete leftover agnostic endpoint artifact lists and field-caps seed docs',
  async ({ kbnClient, esClient, log }) => {
    log.debug('[teardown] deleting endpoint artifact exception lists');
    await getEndpointArtifactsApiService({ kbnClient, esClient, log }).deleteAll([
      ...ENDPOINT_ARTIFACT_LIST_IDS,
    ]);
    await deleteEndpointFieldCapsDocs(esClient, log);
  }
);
