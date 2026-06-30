/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';

export const FIRST_CLIENT_P12 = readFileSync(
  require.resolve('@kbn/security-api-integration-helpers/pki/first_client.p12')
);

export const SECOND_CLIENT_P12 = readFileSync(
  require.resolve('@kbn/security-api-integration-helpers/pki/second_client.p12')
);

// Must match the `pki` config set's pinned Kibana host:port (set via configureHTTP2)
export const KIBANA_TLS_ORIGIN = 'https://localhost:5620';
