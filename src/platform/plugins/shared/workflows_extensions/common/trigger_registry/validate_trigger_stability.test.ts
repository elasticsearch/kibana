/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { validateTriggerStability } from './validate_trigger_stability';

describe('validateTriggerStability', () => {
  const triggerId = 'example.myTrigger';

  it('rejects missing stability', () => {
    expect(() => validateTriggerStability(triggerId, undefined)).toThrow(
      'Trigger "example.myTrigger": "stability" is required. Set stability: \'tech_preview\' for new triggers.'
    );
  });

  it('accepts tech_preview stability', () => {
    expect(() => validateTriggerStability(triggerId, 'tech_preview')).not.toThrow();
  });

  it('rejects stable stability', () => {
    expect(() => validateTriggerStability(triggerId, 'stable')).toThrow(
      'Trigger "example.myTrigger": stability "stable" is not supported until event-driven triggers GA. Use "tech_preview".'
    );
  });

  it('rejects beta stability', () => {
    expect(() => validateTriggerStability(triggerId, 'beta')).toThrow(
      'Trigger "example.myTrigger": stability "beta" is not supported until event-driven triggers GA. Use "tech_preview".'
    );
  });
});
