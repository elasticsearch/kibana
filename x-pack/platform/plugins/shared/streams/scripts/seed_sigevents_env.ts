/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { CLAIMS_APP } from '@kbn/synthtrace/src/scenarios/sigevents/mock_apps/claims';
import type { ConnectionConfig } from './seed_sigevents_env/lib/get_connection_config';
import { getConnectionConfig } from './seed_sigevents_env/lib/get_connection_config';
import { kibanaRequest } from './seed_sigevents_env/lib/kibana';
import { CLAIMS_SEED } from './seed_sigevents_env/scenarios/claims';
import {
  seedAlerts,
  seedFeatures,
  seedLogs,
  seedQueries,
  seedTasks,
  cleanSeedData,
} from './seed_sigevents_env/steps';
import type { SeedContext } from './seed_sigevents_env/types';
import { getSynthtraceDefaultStream } from './seed_sigevents_env/types';

/** Fixed RNG seed — changing this invalidates all deterministic IDs (alerts, tasks, features) across re-runs. */
const FIXED_SEED = 42;

export async function ensureStreamsEnabled(
  config: ConnectionConfig,
  log: ToolingLog
): Promise<void> {
  const { status, data } = await kibanaRequest(config, 'POST', '/api/streams/_enable');
  if (status === 200) {
    log.info('Streams enabled successfully');
  } else if (status === 400) {
    const msg = JSON.stringify(data ?? '');
    if (msg.includes('already enabled') || msg.includes('Cannot change stream types')) {
      log.info('Streams already enabled');
    } else {
      throw new Error(`Failed to enable streams: ${status} ${msg}`);
    }
  } else if (status === 404) {
    log.warning('Streams API not available — skipping');
  } else {
    throw new Error(`Failed to enable streams: ${status} ${JSON.stringify(data)}`);
  }
}

run(
  async ({ log, flags }) => {
    const config = await getConnectionConfig(flags, log);

    const scenarioName = String(flags.scenario || 'fraud_check_redis_herring');
    const streamName = getSynthtraceDefaultStream();
    const space = String(flags.space || 'default');

    // Validate CLAIMS_SEED ↔ CLAIMS_APP.scenarios alignment — catches drift at startup.
    for (const key of Object.keys(CLAIMS_SEED)) {
      if (!(key in CLAIMS_APP.scenarios)) {
        throw new Error(
          `CLAIMS_SEED defines scenario "${key}" which is absent from CLAIMS_APP.scenarios — ` +
            `update CLAIMS_SEED to match CLAIMS_APP. Valid keys: ${Object.keys(
              CLAIMS_APP.scenarios
            ).join(', ')}`
        );
      }
    }

    const scenario = CLAIMS_SEED[scenarioName];
    if (!scenario) {
      const available = Object.keys(CLAIMS_SEED).sort().join(', ');
      throw new Error(`Unknown scenario "${scenarioName}". Available: ${available}`);
    }

    await ensureStreamsEnabled(config, log);

    const ctx: SeedContext = {
      esUrl: config.esUrl,
      kibanaUrl: config.kibanaUrl,
      username: config.username,
      password: config.password,
      streamName,
      scenarioName,
      seed: FIXED_SEED,
      space,
      generatedAt: new Date().toISOString(),
    };

    const esClient = new Client({
      node: config.esUrl,
      auth: { username: config.username, password: config.password },
    });

    if (flags.clean === true) {
      log.info('Running clean before seeding…');
      await cleanSeedData(ctx, esClient, config, log);
    }

    // Step ordering matters — dependencies:
    //   logs       → must exist before alerts (ESQL runs against seeded logs)
    //   queries    → must be promoted before rule_ids can be read (needed by alerts + tasks)
    //   features + queries → all consumed by tasks (task payload embeds both)

    log.info('Seeding logs…');
    const { failureStartMs, failureEndMs, manifest } = await seedLogs(ctx, esClient, log);

    log.info('Seeding features…');
    await seedFeatures(ctx, manifest, config, log);

    log.info('Seeding queries…');

    const seededQueries = await seedQueries(ctx, scenario, config, esClient, log);

    log.info('Seeding alerts…');
    await seedAlerts(ctx, seededQueries, failureStartMs, failureEndMs, esClient, log);

    log.info('Seeding tasks…');
    await seedTasks(ctx, manifest, seededQueries, esClient, log);

    log.info('Done.');
  },
  {
    description: 'Synthetic sigevents seed for local Kibana + Elasticsearch.',
    flags: {
      string: ['scenario', 'space', 'es-url', 'es-username', 'es-password', 'kibana-url'],
      boolean: ['clean'],
      help: `
        --scenario <name>        Scenario key in CLAIMS_SEED (default: fraud_check_redis_herring)
                                 Available: fraud_check_redis_herring, healthy_baseline
        --space <name>           Kibana space for seeded assets (default: default)
        --clean                  Delete all previously seeded data (features, alerts, queries,
                                 tasks, and the data stream) before re-seeding
        --es-url <url>           Elasticsearch URL (default: from kibana.dev.yml)
        --es-username <user>     ES username (default: elastic)
        --es-password <pass>     ES password (default: changeme)
        --kibana-url <url>       Kibana base URL (default: from kibana.dev.yml, auto-detects dev base path)

        Notes:
          The target stream is auto-enabled (POST /api/streams/_enable) if not yet active.
          If the seeder crashes before completing, a temporary ES user may be left behind.
          Clean it up with: curl -u elastic:changeme -X DELETE http://localhost:9200/_security/user/seed_sigevents_tasks_tmp
      `,
    },
  }
);
