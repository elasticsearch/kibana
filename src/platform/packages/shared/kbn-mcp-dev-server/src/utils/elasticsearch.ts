/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License"
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import { Client } from '@elastic/elasticsearch';

const {
  ELASTICSEARCH_USERNAME = 'elastic',
  ELASTICSEARCH_PASSWORD = 'changeme',
  ELASTICSEARCH_ENDPOINT = 'http://localhost:9200',
  ELASTICSEARCH_API_KEY,
  ELASTICSEARCH_CLOUD_ID,
} = process.env;

const clientOptions: ClientOptions = {};

if (ELASTICSEARCH_CLOUD_ID) {
  clientOptions.cloud = { id: ELASTICSEARCH_CLOUD_ID };
} else if (ELASTICSEARCH_ENDPOINT) {
  clientOptions.node = ELASTICSEARCH_ENDPOINT;
}

if (ELASTICSEARCH_API_KEY) {
  clientOptions.auth = { apiKey: ELASTICSEARCH_API_KEY };
} else if (ELASTICSEARCH_PASSWORD && ELASTICSEARCH_PASSWORD) {
  clientOptions.auth = {
    username: ELASTICSEARCH_USERNAME,
    password: ELASTICSEARCH_PASSWORD,
  };
}

export const client = new Client(clientOptions);
