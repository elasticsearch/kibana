/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionPolicyAttachmentData } from '@kbn/alerting-v2-schemas';
import {
  executeActionPolicyOperations,
  ActionPolicyOperationValidationError,
  type ActionPolicyOperation,
} from './operations';
import { AGENT_BUILDER_TAG } from '../../common/constants';

describe('executeActionPolicyOperations', () => {
  describe('validate operation', () => {
    const validPolicy: Partial<ActionPolicyAttachmentData> = {
      name: 'Test Policy',
      description: 'A test policy',
      destinations: [{ type: 'workflow', id: '00000000-0000-0000-0000-000000000001' }],
    };

    it('passes validation for a complete action policy', () => {
      const ops: ActionPolicyOperation[] = [{ operation: 'validate' }];

      const result = executeActionPolicyOperations(validPolicy, ops);

      expect(result.name).toBe('Test Policy');
    });

    it('passes validation when validate follows mutation operations', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: 'My Policy', description: 'desc' },
        {
          operation: 'set_destinations',
          destinations: [{ type: 'workflow', id: '00000000-0000-0000-0000-000000000001' }],
        },
        { operation: 'validate' },
      ];

      const result = executeActionPolicyOperations({}, ops, { isNew: true });

      expect(result.name).toBe('My Policy');
    });

    it('throws ActionPolicyOperationValidationError when name is empty', () => {
      const ops: ActionPolicyOperation[] = [{ operation: 'validate' }];

      expect(() => executeActionPolicyOperations({ ...validPolicy, name: '' }, ops)).toThrow(
        ActionPolicyOperationValidationError
      );
    });

    it('throws when destinations are missing', () => {
      const ops: ActionPolicyOperation[] = [{ operation: 'validate' }];

      expect(() =>
        executeActionPolicyOperations({ name: 'Test', description: 'desc', destinations: [] }, ops)
      ).toThrow('Action policy is not ready to save');
    });

    it('includes Zod issue paths in the error message', () => {
      const ops: ActionPolicyOperation[] = [{ operation: 'validate' }];

      expect(() =>
        executeActionPolicyOperations({ name: '', description: '', destinations: [] }, ops)
      ).toThrow(/destinations:/);
    });

    it('does not update attachment data when validate throws', () => {
      const original: Partial<ActionPolicyAttachmentData> = {
        name: '',
        description: '',
        destinations: [],
      };
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: '' },
        { operation: 'validate' },
      ];

      expect(() => executeActionPolicyOperations(original, ops)).toThrow(
        ActionPolicyOperationValidationError
      );
    });
  });

  describe('basic operations', () => {
    it('applies set_metadata', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: 'My Policy', description: 'A description' },
      ];

      const result = executeActionPolicyOperations({}, ops);

      expect(result.name).toBe('My Policy');
      expect(result.description).toBe('A description');
    });

    it('applies set_destinations', () => {
      const ops: ActionPolicyOperation[] = [
        {
          operation: 'set_destinations',
          destinations: [{ type: 'workflow', id: '00000000-0000-0000-0000-000000000001' }],
        },
      ];

      const result = executeActionPolicyOperations({}, ops);

      expect(result.destinations).toEqual([
        { type: 'workflow', id: '00000000-0000-0000-0000-000000000001' },
      ]);
    });

    it('applies set_matcher', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_matcher', matcher: 'rule.name: "test"' },
      ];

      const result = executeActionPolicyOperations({}, ops);

      expect(result.matcher).toBe('rule.name: "test"');
    });

    it('applies set_grouping', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_grouping', groupingMode: 'per_field', groupBy: ['host.name'] },
      ];

      const result = executeActionPolicyOperations({}, ops);

      expect(result.groupingMode).toBe('per_field');
      expect(result.groupBy).toEqual(['host.name']);
    });

    it('throws when per_field grouping has no groupBy fields', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_grouping', groupingMode: 'per_field', groupBy: [] },
      ];

      expect(() => executeActionPolicyOperations({}, ops)).toThrow(
        'groupBy fields are required when groupingMode is "per_field"'
      );
    });
  });

  it('passes validation for a complete rule-scoped policy', () => {
    const ops: ActionPolicyOperation[] = [
      { operation: 'set_metadata', name: 'My Policy', description: 'desc' },
      {
        operation: 'set_destinations',
        destinations: [{ type: 'workflow', id: '00000000-0000-0000-0000-000000000001' }],
      },
      { operation: 'set_matcher', matcher: 'rule.id: "rule-123"' },
      { operation: 'validate' },
    ];

    const result = executeActionPolicyOperations({}, ops, { isNew: true });

    expect(result.matcher).toBe('rule.id: "rule-123"');
  });

  describe('agent-builder provenance tag', () => {
    it('stamps the agent-builder tag on a newly created policy', () => {
      const ops: ActionPolicyOperation[] = [{ operation: 'set_metadata', name: 'My Policy' }];

      const result = executeActionPolicyOperations({}, ops, { isNew: true });

      expect(result.tags).toEqual([AGENT_BUILDER_TAG]);
    });

    it('appends the tag without clobbering user/LLM-provided tags', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: 'My Policy', tags: ['production', 'oncall'] },
      ];

      const result = executeActionPolicyOperations({}, ops, { isNew: true });

      expect(result.tags).toEqual(['production', 'oncall', AGENT_BUILDER_TAG]);
    });

    it('does not duplicate the tag when it is already present', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: 'My Policy', tags: [AGENT_BUILDER_TAG] },
      ];

      const result = executeActionPolicyOperations({}, ops, { isNew: true });

      expect(result.tags).toEqual([AGENT_BUILDER_TAG]);
    });

    it('skips stamping when the 20-tag cap is already reached', () => {
      const maxTags = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_metadata', name: 'My Policy', tags: maxTags },
      ];

      const result = executeActionPolicyOperations({}, ops, { isNew: true });

      expect(result.tags).toEqual(maxTags);
      expect(result.tags).toHaveLength(20);
    });

    it('stamps the tag when editing an existing policy, preserving existing tags', () => {
      const existing: Partial<ActionPolicyAttachmentData> = {
        name: 'Existing Policy',
        tags: ['oncall'],
      };
      const ops: ActionPolicyOperation[] = [{ operation: 'set_metadata', description: 'updated' }];

      const result = executeActionPolicyOperations(existing, ops, { isNew: false });

      expect(result.tags).toEqual(['oncall', AGENT_BUILDER_TAG]);
    });

    it('re-adds the tag on edit when the user previously removed it', () => {
      const existing: Partial<ActionPolicyAttachmentData> = {
        name: 'Existing Policy',
        tags: ['oncall'],
      };
      const ops: ActionPolicyOperation[] = [{ operation: 'set_metadata', tags: ['oncall'] }];

      const result = executeActionPolicyOperations(existing, ops, { isNew: false });

      expect(result.tags).toEqual(['oncall', AGENT_BUILDER_TAG]);
    });
  });

  describe('throttle / grouping compatibility', () => {
    it('throws when per_episode grouping uses time_interval strategy', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_throttle', strategy: 'time_interval', interval: '5m' },
      ];

      expect(() => executeActionPolicyOperations({ groupingMode: 'per_episode' }, ops)).toThrow(
        'not valid for grouping mode'
      );
    });

    it('throws when strategy requires interval but none provided', () => {
      const ops: ActionPolicyOperation[] = [
        { operation: 'set_throttle', strategy: 'per_status_interval' },
      ];

      expect(() => executeActionPolicyOperations({}, ops)).toThrow('requires an interval');
    });
  });
});
