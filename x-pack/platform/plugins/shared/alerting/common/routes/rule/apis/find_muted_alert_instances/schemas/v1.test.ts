/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  findMutedAlertInstancesRequestBodySchema,
  findMutedAlertInstancesResponseSchema,
} from './v1';

describe('findMutedAlertInstancesRequestBodySchema', () => {
  test('applies default page and per_page when omitted', () => {
    expect(findMutedAlertInstancesRequestBodySchema.validate({})).toEqual({
      page: 1,
      per_page: 10,
    });
  });

  test('accepts valid page, per_page, and filter', () => {
    expect(
      findMutedAlertInstancesRequestBodySchema.validate({
        page: 2,
        per_page: 50,
        filter: 'alert.id: alert:rule-1',
      })
    ).toEqual({
      page: 2,
      per_page: 50,
      filter: 'alert.id: alert:rule-1',
    });
  });

  test('allows per_page of 0', () => {
    expect(findMutedAlertInstancesRequestBodySchema.validate({ per_page: 0 })).toEqual({
      page: 1,
      per_page: 0,
    });
  });

  test('throws when page is less than 1', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ page: 0 })
    ).toThrowErrorMatchingInlineSnapshot(`"[page]: Value must be equal to or greater than [1]."`);
  });

  test('throws when per_page is negative', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ per_page: -1 })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[per_page]: Value must be equal to or greater than [0]."`
    );
  });

  test('throws when page is not a number', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ page: 'one' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[page]: expected value of type [number] but got [string]"`
    );
  });

  test('throws when filter is not a string', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ filter: 123 })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[filter]: expected value of type [string] but got [number]"`
    );
  });

  test('throws when per_page exceeds the maximum', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ per_page: 101 })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[per_page]: Value must be equal to or lower than [100]."`
    );
  });

  test('throws when page exceeds the maximum', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ page: 10001, per_page: 1 })
    ).toThrowErrorMatchingInlineSnapshot(`"[page]: Value must be equal to or lower than [10000]."`);
  });

  test('throws when page and per_page would return more than the max result window', () => {
    expect(() =>
      findMutedAlertInstancesRequestBodySchema.validate({ page: 200, per_page: 100 })
    ).toThrowErrorMatchingInlineSnapshot(
      `"The provided page and per_page values cannot return more than 10000 results."`
    );
  });
});

describe('findMutedAlertInstancesResponseSchema', () => {
  test('accepts a well-formed response', () => {
    const response = {
      page: 1,
      per_page: 10,
      total: 1,
      data: [{ id: 'rule-1', muted_alert_instance_ids: ['instance-1', 'instance-2'] }],
    };
    expect(findMutedAlertInstancesResponseSchema.validate(response)).toEqual(response);
  });

  test('accepts an empty data array', () => {
    const response = { page: 1, per_page: 10, total: 0, data: [] };
    expect(findMutedAlertInstancesResponseSchema.validate(response)).toEqual(response);
  });

  test('accepts snoozed_alert_instances', () => {
    const response = {
      page: 1,
      per_page: 10,
      total: 1,
      data: [
        {
          id: 'rule-1',
          muted_alert_instance_ids: ['instance-1'],
          snoozed_alert_instances: [
            {
              instance_id: 'instance-2',
              expires_at: '2099-01-01T00:00:00.000Z',
              conditions: [{ type: 'field_change', field: 'host.name' }],
              condition_operator: 'any',
              snoozed_at: '2026-01-01T00:00:00.000Z',
              snoozed_by: 'elastic',
            },
          ],
        },
      ],
    };
    expect(findMutedAlertInstancesResponseSchema.validate(response)).toEqual(response);
  });

  test('throws when muted_alert_instance_ids is missing', () => {
    expect(() =>
      findMutedAlertInstancesResponseSchema.validate({
        page: 1,
        per_page: 10,
        total: 1,
        data: [{ id: 'rule-1' }],
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[data.0.muted_alert_instance_ids]: expected value of type [array] but got [undefined]"`
    );
  });

  test('throws when muted_alert_instance_ids contains a non-string', () => {
    expect(() =>
      findMutedAlertInstancesResponseSchema.validate({
        page: 1,
        per_page: 10,
        total: 1,
        data: [{ id: 'rule-1', muted_alert_instance_ids: [123] }],
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[data.0.muted_alert_instance_ids.0]: expected value of type [string] but got [number]"`
    );
  });
});
