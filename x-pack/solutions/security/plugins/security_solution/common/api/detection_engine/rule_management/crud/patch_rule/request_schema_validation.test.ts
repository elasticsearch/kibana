/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ThresholdRulePatchProps } from '../../../model';
import type { PatchRuleRequestBody } from './patch_rule_route.gen';
import { getPatchRulesSchemaMock, getPatchThresholdRulesSchemaMock } from './patch_rule_route.mock';
import { validatePatchRuleRequestBody } from './request_schema_validation';

describe('Patch rule request schema, additional validation', () => {
  describe('validatePatchRuleRequestBody', () => {
    test('You cannot omit timeline_title when timeline_id is present', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        timeline_id: '123',
      };
      delete schema.timeline_title;
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['when "timeline_id" exists, "timeline_title" must also exist']);
    });

    test('You cannot have empty string for timeline_title when timeline_id is present', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        timeline_id: '123',
        timeline_title: '',
      };
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['"timeline_title" cannot be an empty string']);
    });

    test('You cannot have timeline_title with an empty timeline_id', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        timeline_id: '',
        timeline_title: 'some-title',
      };
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['"timeline_id" cannot be an empty string']);
    });

    test('You cannot have timeline_title without timeline_id', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        timeline_title: 'some-title',
      };
      delete schema.timeline_id;
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['when "timeline_title" exists, "timeline_id" must also exist']);
    });

    test('You cannot have both an id and a rule_id', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        id: 'some-id',
        rule_id: 'some-rule-id',
      };
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['both "id" and "rule_id" cannot exist, choose one or the other']);
    });

    test('You must set either an id or a rule_id', () => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
      };
      delete schema.id;
      delete schema.rule_id;
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['either "id" or "rule_id" must be set']);
    });

    test.each([
      {
        name: 'shorter than the rule interval',
        from: 'now-7m',
        to: 'now-5m',
        expectedErrors: [
          'the time range defined by "from" and "to" must be greater than or equal to "interval"',
        ],
      },
      {
        name: 'equal to the rule interval',
        from: 'now-10m',
        to: 'now-5m',
        expectedErrors: [],
      },
      {
        name: 'longer than the rule interval',
        from: 'now-10m',
        to: 'now',
        expectedErrors: [],
      },
    ])('validates a time range that is $name', ({ from, to, expectedErrors }) => {
      const schema: PatchRuleRequestBody = {
        ...getPatchRulesSchemaMock(),
        interval: '5m',
        from,
        to,
      };

      expect(validatePatchRuleRequestBody(schema)).toEqual(expectedErrors);
    });

    test('threshold.cardinality[0].field should not be in threshold.field', () => {
      const schema: ThresholdRulePatchProps = {
        ...getPatchThresholdRulesSchemaMock(),
        threshold: {
          field: ['field-1', 'field-2', 'field-3'],
          value: 1,
          cardinality: [
            {
              field: 'field-1',
              value: 2,
            },
          ],
        },
      };
      const errors = validatePatchRuleRequestBody(schema);
      expect(errors).toEqual(['Cardinality of a field that is being aggregated on is always 1']);
    });
  });

  describe('threat mapping validation', () => {
    test('validates threat mapping fields', () => {
      const payload: PatchRuleRequestBody = {
        id: 'rule-id',
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'threat.indicator.user.name',
                type: 'mapping' as const,
                negate: false,
              },
            ],
          },
        ],
      };
      const errors = validatePatchRuleRequestBody(payload);
      expect(errors).toEqual([]);
    });

    test('does not validate single negate entry', () => {
      const payload: PatchRuleRequestBody = {
        id: 'rule-id',
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping' as const,
                negate: true,
              },
            ],
          },
        ],
      };
      const errors = validatePatchRuleRequestBody(payload);
      expect(errors).toEqual([
        'Negate mappings cannot be used as a single entry in the AND condition. Please use at least one matching mapping entry.',
      ]);
    });

    test('does not validate entries with identical fields and values and negate=true', () => {
      const payload: PatchRuleRequestBody = {
        id: 'rule-id',
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping' as const,
                negate: false,
              },
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping' as const,
                negate: true,
              },
            ],
          },
        ],
      };
      const errors = validatePatchRuleRequestBody(payload);
      expect(errors).toEqual([
        'Negate and matching mappings cannot have identical fields and values in the same AND condition.',
      ]);
    });
  });
});
