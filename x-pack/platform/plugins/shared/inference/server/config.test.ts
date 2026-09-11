/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { configSchema } from './config';

describe('inference config schema', () => {
  it('validates with defaults', () => {
    expect(configSchema.validate({})).toMatchObject({
      enabled: true,
      anonymization: {
        workflowDriven: false,
        failureMode: 'block',
        triggerCacheTtlSeconds: 30,
      },
    });
  });

  it('accepts the explicit unsafe failure mode', () => {
    expect(
      configSchema.validate({
        anonymization: {
          workflowDriven: true,
          failureMode: 'allow_unsafe',
        },
      }).anonymization
    ).toMatchObject({
      workflowDriven: true,
      failureMode: 'allow_unsafe',
    });
  });

  it('accepts triggerCacheTtlSeconds of 0 to disable caching', () => {
    expect(
      configSchema.validate({ anonymization: { triggerCacheTtlSeconds: 0 } }).anonymization
        .triggerCacheTtlSeconds
    ).toBe(0);
  });
});
