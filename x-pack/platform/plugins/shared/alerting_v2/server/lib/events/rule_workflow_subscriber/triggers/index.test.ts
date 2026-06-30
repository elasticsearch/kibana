/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RULE_WORKFLOW_TRIGGERS } from '.';

describe('RULE_WORKFLOW_TRIGGERS', () => {
  it('declares unique trigger ids (no two bindings register the same workflows-extensions trigger)', () => {
    const triggerIds = RULE_WORKFLOW_TRIGGERS.map((t) => t.triggerId);
    expect(new Set(triggerIds).size).toBe(triggerIds.length);
  });

  it('declares unique event types (one binding per bus event)', () => {
    const eventTypes = RULE_WORKFLOW_TRIGGERS.map((t) => t.eventType);
    expect(new Set(eventTypes).size).toBe(eventTypes.length);
  });

  it('keeps every binding `triggerId` in sync with its `definition.id`', () => {
    for (const binding of RULE_WORKFLOW_TRIGGERS) {
      expect(binding.definition.id).toBe(binding.triggerId);
    }
  });

  it('namespaces every trigger id under `alerting.`', () => {
    for (const binding of RULE_WORKFLOW_TRIGGERS) {
      expect(binding.triggerId.startsWith('alerting.')).toBe(true);
    }
  });
});
