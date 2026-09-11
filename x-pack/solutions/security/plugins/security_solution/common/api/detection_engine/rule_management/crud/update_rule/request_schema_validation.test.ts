/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleUpdateProps } from '../../../model/rule_schema';
import {
  getUpdateRulesSchemaMock,
  getUpdateThreatMatchRuleSchemaMock,
} from '../../../model/rule_schema/mocks';
import { validateUpdateRuleProps } from './request_schema_validation';

describe('Update rule request schema, additional validation', () => {
  test('You cannot omit timeline_title when timeline_id is present', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      timeline_id: '123',
    };
    delete schema.timeline_title;
    const errors = validateUpdateRuleProps(schema);
    expect(errors).toEqual(['when "timeline_id" exists, "timeline_title" must also exist']);
  });

  test('You cannot have empty string for timeline_title when timeline_id is present', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      timeline_id: '123',
      timeline_title: '',
    };
    const errors = validateUpdateRuleProps(schema);
    expect(errors).toEqual(['"timeline_title" cannot be an empty string']);
  });

  test('You cannot have timeline_title with an empty timeline_id', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      timeline_id: '',
      timeline_title: 'some-title',
    };
    const errors = validateUpdateRuleProps(schema);
    expect(errors).toEqual(['"timeline_id" cannot be an empty string']);
  });

  test('You cannot have timeline_title without timeline_id', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      timeline_title: 'some-title',
    };
    delete schema.timeline_id;
    const errors = validateUpdateRuleProps(schema);
    expect(errors).toEqual(['when "timeline_title" exists, "timeline_id" must also exist']);
  });

  test('You cannot have both an id and a rule_id', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      id: 'some-id',
      rule_id: 'some-rule-id',
    };
    const errors = validateUpdateRuleProps(schema);
    expect(errors).toEqual(['both "id" and "rule_id" cannot exist, choose one or the other']);
  });

  test('You must set either an id or a rule_id', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
    };
    delete schema.id;
    delete schema.rule_id;
    const errors = validateUpdateRuleProps(schema);
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
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      interval: '5m',
      from,
      to,
    };

    expect(validateUpdateRuleProps(schema)).toEqual(expectedErrors);
  });

  test('validates the effective default time range when schedule fields are omitted', () => {
    const schema: RuleUpdateProps = {
      ...getUpdateRulesSchemaMock(),
      interval: '10m',
    };
    delete schema.from;
    delete schema.to;

    expect(validateUpdateRuleProps(schema)).toEqual([
      'the time range defined by "from" and "to" must be greater than or equal to "interval"',
    ]);
  });

  describe('threat mapping validation', () => {
    test('validates threat mapping fields', () => {
      const payload: RuleUpdateProps = {
        ...getUpdateThreatMatchRuleSchemaMock(),
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
      const errors = validateUpdateRuleProps(payload);
      expect(errors).toEqual([]);
    });

    test('does not validate single negate entry', () => {
      const payload: RuleUpdateProps = {
        ...getUpdateThreatMatchRuleSchemaMock(),
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
      const errors = validateUpdateRuleProps(payload);
      expect(errors).toEqual([
        'Negate mappings cannot be used as a single entry in the AND condition. Please use at least one matching mapping entry.',
      ]);
    });

    test('does not validate entries with identical fields and values and negate=true', () => {
      const payload: RuleUpdateProps = {
        ...getUpdateThreatMatchRuleSchemaMock(),
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
      const errors = validateUpdateRuleProps(payload);
      expect(errors).toEqual([
        'Negate and matching mappings cannot have identical fields and values in the same AND condition.',
      ]);
    });
  });
});
