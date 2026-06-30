/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ClientOptions as ESClientOptions } from '@elastic/elasticsearch/lib/client';
import { Client as ESClient, HttpConnection } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createFailError } from '@kbn/dev-cli-errors';

/**
 * Get an Elasticsearch client for which connectivity has been validated
 *
 * @param esClientOptions Elasticsearch client options
 * @param helperSettings Settings for this helper
 * @param helperSettings.log Logger instance
 * @param helperSettings.cli Set to `true` when invoked from a CLI context
 * @throws FailError if cluster information cannot be read from the target Elasticsearch instance
 */
export async function getValidatedESClient(
  esClientOptions: ESClientOptions,
  helperSettings: {
    log?: ToolingLog;
    cli?: boolean;
  }
): Promise<ESClient> {
  const { log, cli = false } = helperSettings;
  const es = new ESClient({
    Connection: HttpConnection,
    requestTimeout: 30_000,
    ...esClientOptions,
  });

  try {
    const esInfo = await es.info();
    if (log !== undefined) {
      log.info(`Connected to Elasticsearch node '${esInfo.name}'`);
    }
  } catch (err) {
    const msg = `Failed to connect to Elasticsearch\n${err}`;
    throw cli ? createFailError(msg) : Error(msg);
  }

  return es;
}
