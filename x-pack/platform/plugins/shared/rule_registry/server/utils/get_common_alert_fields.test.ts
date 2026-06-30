/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_NAME,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_UUID,
  SPACE_IDS,
  ALERT_RULE_TAGS,
  TIMESTAMP,
} from '@kbn/rule-data-utils';
import { asSpaceId } from '@kbn/core-spaces-common';
import { getCommonAlertFields } from './get_common_alert_fields';

describe('getCommonAlertFields', () => {
  test('should correctly return common alert fields', () => {
    expect(
      getCommonAlertFields({
        executionId: '1234',
        params: { foo: 'bar' },
        // @ts-expect-error - incomplete rule definition for testing
        rule: {
          ruleTypeName: 'Test Rule',
          consumer: 'test-consumer',
          name: 'Test Rule Name',
          producer: 'test-producer',
          revision: 1,
          ruleTypeId: 'test.rule-type',
          id: 'rule-id',
          tags: ['test-tag'],
        },
        startedAt: new Date('2023-10-01T00:00:00Z'),
        spaceId: asSpaceId('default'),
      })
    ).toEqual({
      [ALERT_RULE_PARAMETERS]: { foo: 'bar' },
      [ALERT_RULE_CATEGORY]: 'Test Rule',
      [ALERT_RULE_CONSUMER]: 'test-consumer',
      [ALERT_RULE_EXECUTION_UUID]: '1234',
      [ALERT_RULE_NAME]: 'Test Rule Name',
      [ALERT_RULE_PRODUCER]: 'test-producer',
      [ALERT_RULE_REVISION]: 1,
      [ALERT_RULE_TYPE_ID]: 'test.rule-type',
      [ALERT_RULE_UUID]: 'rule-id',
      [SPACE_IDS]: ['default'],
      [ALERT_RULE_TAGS]: ['test-tag'],
      [TIMESTAMP]: '2023-10-01T00:00:00.000Z',
    });
  });

  test(`should set kibana.space_ids to '*' when dangerouslyCreateAlertsInAllSpaces=true`, () => {
    expect(
      getCommonAlertFields(
        {
          executionId: '1234',
          params: { foo: 'bar' },
          // @ts-expect-error - incomplete rule definition for testing
          rule: {
            ruleTypeName: 'Test Rule',
            consumer: 'test-consumer',
            name: 'Test Rule Name',
            producer: 'test-producer',
            revision: 1,
            ruleTypeId: 'test.rule-type',
            id: 'rule-id',
            tags: ['test-tag'],
          },
          startedAt: new Date('2023-10-01T00:00:00Z'),
          spaceId: asSpaceId('default'),
        },
        true
      )
    ).toEqual({
      [ALERT_RULE_PARAMETERS]: { foo: 'bar' },
      [ALERT_RULE_CATEGORY]: 'Test Rule',
      [ALERT_RULE_CONSUMER]: 'test-consumer',
      [ALERT_RULE_EXECUTION_UUID]: '1234',
      [ALERT_RULE_NAME]: 'Test Rule Name',
      [ALERT_RULE_PRODUCER]: 'test-producer',
      [ALERT_RULE_REVISION]: 1,
      [ALERT_RULE_TYPE_ID]: 'test.rule-type',
      [ALERT_RULE_UUID]: 'rule-id',
      [SPACE_IDS]: ['*'],
      [ALERT_RULE_TAGS]: ['test-tag'],
      [TIMESTAMP]: '2023-10-01T00:00:00.000Z',
    });
  });
});
