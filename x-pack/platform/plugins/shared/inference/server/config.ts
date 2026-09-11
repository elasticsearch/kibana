/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  anonymization: schema.object({
    workflowDriven: schema.boolean({ defaultValue: false }),
    encryptionKey: schema.maybe(schema.string({ maxLength: 512 })),
    failureMode: schema.oneOf([schema.literal('block'), schema.literal('allow_unsafe')], {
      defaultValue: 'block',
    }),
    // How long (in seconds) the resolved trigger-match result is cached per (space, agentId).
    // A workflow configuration change (enable/disable/delete) takes up to this many seconds to
    // take effect. Set to 0 to disable caching entirely at the cost of an ES lookup on every
    // anonymization-eligible inference call.
    triggerCacheTtlSeconds: schema.number({ defaultValue: 30, min: 0 }),
    // Maximum time (ms) the anonymization workflow may run before the LLM connector is invoked.
    // The clock starts after saltPromise resolves; salt-resolution time is excluded from this
    // budget. Bounds only the anonymization execution overhead, not LLM response time.
    // Set to 0 to disable the timeout.
    preLLMTimeoutMs: schema.number({ defaultValue: 5000, min: 0 }),
  }),
  workers: schema.object({
    anonymization: schema.object({
      enabled: schema.boolean({ defaultValue: true }),
      minThreads: schema.number({ defaultValue: 0, min: 0 }),
      maxThreads: schema.number({ defaultValue: 3, min: 1 }),
      maxQueue: schema.number({ defaultValue: 20, min: 1 }),
      idleTimeout: schema.duration({ defaultValue: '30s' }),
      taskTimeout: schema.duration({ defaultValue: '15s' }),
    }),
    workflowAnonymization: schema.object({
      enabled: schema.boolean({ defaultValue: true }),
      // Defaults to maxThreads to keep workers pre-warmed; the workflow-driven path runs
      // synchronously on the request hot-path so cold-start latency is unacceptable.
      // Lower this to allow partial thread scaling at the cost of occasional cold starts.
      minThreads: schema.number({ defaultValue: 3, min: 0 }),
      maxThreads: schema.number({ defaultValue: 3, min: 1 }),
      maxQueue: schema.number({ defaultValue: 20, min: 1 }),
      idleTimeout: schema.duration({ defaultValue: '30s' }),
      taskTimeout: schema.duration({ defaultValue: '15s' }),
    }),
  }),
});

export type InferenceConfig = TypeOf<typeof configSchema>;

export type AnonymizationWorkerConfig = InferenceConfig['workers']['anonymization'];
export type WorkflowAnonymizationWorkerConfig = InferenceConfig['workers']['workflowAnonymization'];
export type WorkflowAnonymizationFailureMode = InferenceConfig['anonymization']['failureMode'];
