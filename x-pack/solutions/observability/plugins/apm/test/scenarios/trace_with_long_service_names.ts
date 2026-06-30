/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Generates APM traces for services whose names are intentionally very long.
 *
 * Useful for manually verifying that long service names are truncated with an
 * ellipsis (and revealed via tooltip) in narrow places such as the Traces
 * explorer "Originating service" column. See https://github.com/elastic/kibana/issues/274838
 */

import type { ApmFields, Instance } from '@kbn/synthtrace-client';
import { apm } from '@kbn/synthtrace-client';
import type { Scenario } from '@kbn/synthtrace';
import { getSynthtraceEnvironment } from '@kbn/synthtrace';
import { withClient } from '@kbn/synthtrace';

const ENVIRONMENT = getSynthtraceEnvironment(__filename);

const SERVICES = [
  {
    name: 'synth-extremely-long-checkout-payment-gateway-orchestration-service-eu-west-1',
    transactionName:
      'POST /api/v1/checkout/payment-gateway/orchestration/authorize-and-capture-with-fraud-screening',
  },
  {
    name: 'synth-customer-identity-and-access-management-authentication-service-production',
    transactionName: '240rpm/75% 1000ms',
  },
  {
    name: 'synth-order-fulfilment-and-inventory-reconciliation-background-worker-service',
    transactionName: '240rpm/75% 1000ms',
  },
  {
    name: 'synth-recommendations-personalization-machine-learning-inference-service-v2',
    transactionName: '240rpm/75% 1000ms',
  },
];

const scenario: Scenario<ApmFields> = async (runOptions) => {
  const { logger } = runOptions;

  return {
    generate: ({ range, clients: { apmEsClient } }) => {
      const successfulTimestamps = range.interval('1m').rate(180);
      const failedTimestamps = range.interval('1m').rate(180);

      const instances = SERVICES.map(({ name, transactionName }) => ({
        instance: apm
          .service({ name, environment: ENVIRONMENT, agentName: 'nodejs' })
          .instance('instance'),
        transactionName,
      }));

      const instanceSpans = (instance: Instance, transactionName: string) => {
        const successfulTraceEvents = successfulTimestamps.generator((timestamp) =>
          instance
            .transaction({ transactionName })
            .timestamp(timestamp)
            .defaults({
              'url.domain': 'foo.bar',
            })
            .duration(1000)
            .success()
            .children(
              instance
                .span({
                  spanName: 'GET apm-*/_search',
                  spanType: 'db',
                  spanSubtype: 'elasticsearch',
                })
                .duration(1000)
                .success()
                .destination('elasticsearch')
                .timestamp(timestamp),
              instance
                .span({ spanName: 'custom_operation', spanType: 'custom' })
                .duration(100)
                .success()
                .timestamp(timestamp)
            )
        );

        const failedTraceEvents = failedTimestamps.generator((timestamp) =>
          instance
            .transaction({ transactionName })
            .timestamp(timestamp)
            .duration(1000)
            .failure()
            .errors(
              instance
                .error({
                  message: '[ResponseError] index_not_found_exception',
                  type: 'ResponseError',
                })
                .timestamp(timestamp + 50)
            )
        );

        return [successfulTraceEvents, failedTraceEvents];
      };

      return withClient(
        apmEsClient,
        logger.perf('generating_apm_events', () =>
          instances.flatMap(({ instance, transactionName }) =>
            instanceSpans(instance, transactionName)
          )
        )
      );
    },
  };
};

export default scenario;
