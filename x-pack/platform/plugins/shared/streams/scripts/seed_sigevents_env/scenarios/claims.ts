/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeedScenario } from '../types';
import { fromStream } from '../types';

export const CLAIMS_SEED: Record<string, SeedScenario> = {
  healthy_baseline: {
    scenarioName: 'healthy_baseline',
    queries: [
      {
        title: 'Successful claim intake requests',
        description: 'Health check: successful claim-intake paths during baseline traffic.',
        esql: (streamName: string) =>
          `${fromStream(streamName)}
| WHERE \`service.name\` == "claim-intake" AND message LIKE "*completed*"
| LIMIT 500`,
      },
    ],
  },

  fraud_check_redis_herring: {
    scenarioName: 'fraud_check_redis_herring',
    queries: [
      {
        title: 'Primary fraud gateway timeouts',
        description: 'True incident: fraud-check deadline / upstream timeout errors.',
        severityScore: 9,
        esql: (streamName: string) =>
          `${fromStream(streamName)}
| WHERE \`service.name\` == "fraud-check" AND (message LIKE "*deadline*" OR message LIKE "*Upstream timeout*" OR message LIKE "*timeout*")
| LIMIT 500`,
      },
      {
        title: 'Redis / Kafka red-herring mentions',
        description:
          'Ghost mention lines (Redis/Kafka) that can mislead without fraud-check timeouts.',
        severityScore: 4,
        esql: (streamName: string) =>
          `${fromStream(streamName)}
| WHERE message LIKE "*Redis*" OR message LIKE "*Kafka*" OR message LIKE "*consumer lag*"
| LIMIT 500`,
      },
    ],
  },
};
