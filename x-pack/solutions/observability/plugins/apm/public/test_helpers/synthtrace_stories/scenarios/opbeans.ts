/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Opbeans synthtrace scenario — deterministic 15-minute in-memory APM dataset, no Elasticsearch.
 * Topology: node → go (products) / java (payment); go → python (recommendations) / dotnet (inventory).
 */

import { apm, timerange, type ApmFields } from '@kbn/synthtrace-client';

/** Fixed 15-minute window so every render of a story is deterministic. */
export const SCENARIO_START = new Date('2024-01-15T12:00:00.000Z');
export const SCENARIO_END = new Date('2024-01-15T12:15:00.000Z');

const ENV = 'opbeans';

// ── service instances ──────────────────────────────────────────────────────────

const node = apm.service('opbeans-node', ENV, 'nodejs').instance('node-01');
const go = apm.service('opbeans-go', ENV, 'go').instance('go-01');
const java = apm.service('opbeans-java', ENV, 'java').instance('java-01');
const python = apm.service('opbeans-python', ENV, 'python').instance('python-01');
const dotnet = apm.service('opbeans-dotnet', ENV, 'dotnet').instance('dotnet-01');

// ── scenario generator ─────────────────────────────────────────────────────────

let _cached: ApmFields[] | null = null;

/** Memoised: returns in-memory APM documents for the opbeans topology. */
export function opbeansScenario(): ApmFields[] {
  if (_cached) return _cached;

  const gen = timerange(SCENARIO_START, SCENARIO_END)
    .interval('1m')
    .rate(1)
    .generator((ts) => [
      // ── opbeans-node → opbeans-go (browse products)
      node
        .transaction('GET /products', 'request')
        .timestamp(ts)
        .duration(220)
        .success()
        .children(
          node
            .span('GET /api/products', 'external', 'http')
            .destination('opbeans-go:8080')
            .timestamp(ts + 5)
            .duration(180)
            .success()
            .children(
              go
                .transaction('GET /api/products', 'request')
                .timestamp(ts + 10)
                .duration(150)
                .success()
                .children(
                  go
                    .span('SELECT * FROM products', 'db', 'postgresql')
                    .destination('postgresql')
                    .timestamp(ts + 15)
                    .duration(40)
                    .success(),
                  go
                    .span('GET products:list', 'db', 'redis')
                    .destination('redis')
                    .timestamp(ts + 60)
                    .duration(5)
                    .success(),
                  go
                    .span('GET /api/recommendations', 'external', 'http')
                    .destination('opbeans-python:5000')
                    .timestamp(ts + 70)
                    .duration(60)
                    .success()
                    .children(
                      python
                        .transaction('GET /api/recommendations', 'request')
                        .timestamp(ts + 75)
                        .duration(50)
                        .success()
                        .children(
                          python
                            .span('GET recommendation-idx', 'db', 'elasticsearch')
                            .destination('elasticsearch')
                            .timestamp(ts + 80)
                            .duration(30)
                            .success()
                        )
                    ),
                  go
                    .span('GET /api/inventory', 'external', 'http')
                    .destination('opbeans-dotnet:9000')
                    .timestamp(ts + 90)
                    .duration(70)
                    .success()
                    .children(
                      dotnet
                        .transaction('GET /api/inventory', 'request')
                        .timestamp(ts + 95)
                        .duration(60)
                        .success()
                        .children(
                          dotnet
                            .span('SELECT * FROM inventory', 'db', 'postgresql')
                            .destination('postgresql')
                            .timestamp(ts + 100)
                            .duration(20)
                            .success()
                        )
                    )
                )
            )
        ),

      // ── opbeans-node → opbeans-java (payment)
      node
        .transaction('POST /orders', 'request')
        .timestamp(ts)
        .duration(450)
        .success()
        .children(
          node
            .span('POST /api/payment', 'external', 'http')
            .destination('opbeans-java:8090')
            .timestamp(ts + 5)
            .duration(400)
            .success()
            .children(
              java
                .transaction('POST /api/payment', 'request')
                .timestamp(ts + 10)
                .duration(380)
                .success()
                .children(
                  java
                    .span('INSERT INTO orders', 'db', 'postgresql')
                    .destination('postgresql')
                    .timestamp(ts + 15)
                    .duration(50)
                    .success()
                )
            )
        ),
    ]);

  _cached = Array.from(gen).flatMap((e) => e.serialize()) as ApmFields[];
  return _cached;
}
