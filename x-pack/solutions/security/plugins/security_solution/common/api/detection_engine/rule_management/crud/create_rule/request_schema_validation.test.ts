/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleCreateProps } from '../../../model/rule_schema';
import {
  getCreateRulesSchemaMock,
  getCreateThreatMatchRulesSchemaMock,
} from '../../../model/rule_schema/mocks';
import { validateCreateRuleProps } from './request_schema_validation';

describe('Create rule request schema, additional validation', () => {
  test('You cannot omit timeline_title when timeline_id is present', () => {
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      timeline_id: '123',
    };
    delete schema.timeline_title;
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual(['when "timeline_id" exists, "timeline_title" must also exist']);
  });

  test('You cannot have empty string for timeline_title when timeline_id is present', () => {
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      timeline_id: '123',
      timeline_title: '',
    };
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual(['"timeline_title" cannot be an empty string']);
  });

  test('You cannot have timeline_title with an empty timeline_id', () => {
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      timeline_id: '',
      timeline_title: 'some-title',
    };
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual(['"timeline_id" cannot be an empty string']);
  });

  test('You cannot have timeline_title without timeline_id', () => {
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      timeline_title: 'some-title',
    };
    delete schema.timeline_id;
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual(['when "timeline_title" exists, "timeline_id" must also exist']);
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
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      interval: '5m',
      from,
      to,
    };

    expect(validateCreateRuleProps(schema)).toEqual(expectedErrors);
  });

  test('validates the effective default time range when schedule fields are omitted', () => {
    const schema: RuleCreateProps = {
      ...getCreateRulesSchemaMock(),
      interval: '10m',
    };
    delete schema.from;
    delete schema.to;

    expect(validateCreateRuleProps(schema)).toEqual([
      'the time range defined by "from" and "to" must be greater than or equal to "interval"',
    ]);
  });

  test('validates that both "items_per_search" and "concurrent_searches" works when together', () => {
    const schema: RuleCreateProps = {
      ...getCreateThreatMatchRulesSchemaMock(),
      concurrent_searches: 10,
      items_per_search: 10,
    };
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual([]);
  });

  test('does NOT validate when only "items_per_search" is present', () => {
    const schema: RuleCreateProps = {
      ...getCreateThreatMatchRulesSchemaMock(),
      items_per_search: 10,
    };
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual([
      'when "items_per_search" exists, "concurrent_searches" must also exist',
    ]);
  });

  test('does NOT validate when only "concurrent_searches" is present', () => {
    const schema: RuleCreateProps = {
      ...getCreateThreatMatchRulesSchemaMock(),
      concurrent_searches: 10,
    };
    const errors = validateCreateRuleProps(schema);
    expect(errors).toEqual([
      'when "concurrent_searches" exists, "items_per_search" must also exist',
    ]);
  });

  describe('threat mapping validation', () => {
    test('validates threat mapping fields', () => {
      const payload: RuleCreateProps = {
        ...getCreateThreatMatchRulesSchemaMock(),
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'threat.indicator.user.name',
                type: 'mapping',
                negate: false,
              },
            ],
          },
        ],
      };
      const errors = validateCreateRuleProps(payload);
      expect(errors).toEqual([]);
    });

    test('does not validate single negate entry', () => {
      const payload: RuleCreateProps = {
        ...getCreateThreatMatchRulesSchemaMock(),
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping',
                negate: true,
              },
            ],
          },
        ],
      };
      const errors = validateCreateRuleProps(payload);
      expect(errors).toEqual([
        'Negate mappings cannot be used as a single entry in the AND condition. Please use at least one matching mapping entry.',
      ]);
    });

    test('does not validate entries with identical fields and values and negate=true', () => {
      const payload: RuleCreateProps = {
        ...getCreateThreatMatchRulesSchemaMock(),
        threat_mapping: [
          {
            entries: [
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping',
                negate: false,
              },
              {
                field: 'user.name',
                value: 'user.name',
                type: 'mapping',
                negate: true,
              },
            ],
          },
        ],
      };
      const errors = validateCreateRuleProps(payload);
      expect(errors).toEqual([
        'Negate and matching mappings cannot have identical fields and values in the same AND condition.',
      ]);
    });
  });
});
