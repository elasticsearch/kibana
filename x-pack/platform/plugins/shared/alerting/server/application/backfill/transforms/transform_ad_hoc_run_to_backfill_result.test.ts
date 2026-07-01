/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AdHocRunSO } from '../../../data/ad_hoc_run/types';
import type { SavedObject } from '@kbn/core/server';
import { adHocRunStatus } from '../../../../common/constants';
import {
  transformAdHocRunToAdHocRunData,
  transformAdHocRunToBackfillResult,
} from './transform_ad_hoc_run_to_backfill_result';
import type { RawRule } from '../../../types';

const isSystemAction = jest.fn().mockReturnValue(false);

function getMockAdHocRunAttributes({
  ruleId,
  omitApiKey = false,
  actions,
}: {
  ruleId?: string;
  omitApiKey?: boolean;
  actions?: RawRule['actions'];
} = {}): AdHocRunSO {
  // @ts-expect-error
  return {
    ...(omitApiKey ? {} : { apiKeyId: '123', apiKeyToUse: 'MTIzOmFiYw==' }),
    createdAt: '2024-01-30T00:00:00.000Z',
    duration: '12h',
    enabled: true,
    rule: {
      ...(ruleId ? { id: ruleId } : {}),
      name: 'my rule name',
      tags: ['foo'],
      alertTypeId: 'myType',
      actions: actions ? actions : [],
      params: {},
      apiKeyOwner: 'user',
      apiKeyCreatedByUser: false,
      consumer: 'myApp',
      enabled: true,
      schedule: {
        interval: '12h',
      },
      createdBy: 'user',
      updatedBy: 'user',
      createdAt: '2019-02-12T21:01:22.479Z',
      updatedAt: '2019-02-12T21:01:22.479Z',
      revision: 0,
    },
    spaceId: 'default',
    start: '2023-10-19T15:07:40.011Z',
    status: adHocRunStatus.PENDING,
    schedule: [
      {
        interval: '12h',
        status: adHocRunStatus.PENDING,
        runAt: '2023-10-20T03:07:40.011Z',
      },
      {
        interval: '12h',
        status: adHocRunStatus.PENDING,
        runAt: '2023-10-20T15:07:40.011Z',
      },
    ],
  };
}

function getBulkCreateResponse(
  id: string,
  ruleId: string,
  attributes: AdHocRunSO,
  additionalReferences?: Array<{ id: string; name: string; type: string }>
): SavedObject<AdHocRunSO> {
  return {
    type: 'ad_hoc_rule_run_params',
    id,
    namespaces: ['default'],
    attributes,
    references: [
      {
        id: ruleId,
        name: 'rule',
        type: 'alert',
      },
      ...(additionalReferences ?? []),
    ],
    managed: false,
    coreMigrationVersion: '8.8.0',
    updated_at: '2024-02-07T16:05:39.296Z',
    created_at: '2024-02-07T16:05:39.296Z',
    version: 'WzcsMV0=',
  };
}

describe('transformAdHocRunToBackfillResult', () => {
  test('should transform bulk create response', () => {
    expect(
      transformAdHocRunToBackfillResult({
        adHocRunSO: getBulkCreateResponse('abc', '1', getMockAdHocRunAttributes()),
        isSystemAction,
      })
    ).toEqual({
      id: 'abc',
      createdAt: '2024-01-30T00:00:00.000Z',
      duration: '12h',
      enabled: true,
      rule: {
        id: '1',
        name: 'my rule name',
        tags: ['foo'],
        actions: [],
        alertTypeId: 'myType',
        params: {},
        apiKeyOwner: 'user',
        apiKeyCreatedByUser: false,
        consumer: 'myApp',
        enabled: true,
        schedule: {
          interval: '12h',
        },
        createdBy: 'user',
        updatedBy: 'user',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        revision: 0,
      },
      spaceId: 'default',
      start: '2023-10-19T15:07:40.011Z',
      status: adHocRunStatus.PENDING,
      schedule: [
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T03:07:40.011Z',
        },
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T15:07:40.011Z',
        },
      ],
    });
  });

  test('should transform bulk create response with actions', () => {
    expect(
      transformAdHocRunToBackfillResult({
        adHocRunSO: getBulkCreateResponse(
          'abc',
          '1',
          getMockAdHocRunAttributes({
            actions: [
              {
                uuid: '123abc',
                group: 'default',
                actionRef: 'action_0',
                actionTypeId: 'test',
                params: {},
              },
            ],
          }),
          [{ id: '4', name: 'action_0', type: 'action' }]
        ),
        isSystemAction,
      })
    ).toEqual({
      id: 'abc',
      createdAt: '2024-01-30T00:00:00.000Z',
      duration: '12h',
      enabled: true,
      rule: {
        id: '1',
        name: 'my rule name',
        tags: ['foo'],
        actions: [{ actionTypeId: 'test', group: 'default', id: '4', params: {}, uuid: '123abc' }],
        alertTypeId: 'myType',
        params: {},
        apiKeyOwner: 'user',
        apiKeyCreatedByUser: false,
        consumer: 'myApp',
        enabled: true,
        schedule: {
          interval: '12h',
        },
        createdBy: 'user',
        updatedBy: 'user',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        revision: 0,
      },
      spaceId: 'default',
      start: '2023-10-19T15:07:40.011Z',
      status: adHocRunStatus.PENDING,
      schedule: [
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T03:07:40.011Z',
        },
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T15:07:40.011Z',
        },
      ],
    });
  });

  test('should return error for malformed responses when original create request is not provided', () => {
    expect(
      transformAdHocRunToBackfillResult({
        // missing id
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          namespaces: ['default'],
          attributes: getMockAdHocRunAttributes(),
          references: [{ id: '1', name: 'rule', type: 'alert' }],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "id".',
        rule: { id: '1', name: 'my rule name' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // missing attributes
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'abc',
          namespaces: ['default'],
          references: [{ id: '1', name: 'rule', type: 'alert' }],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "attributes".',
        rule: { id: '1' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // missing references
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'def',
          namespaces: ['default'],
          attributes: getMockAdHocRunAttributes(),
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "references".',
        rule: { id: 'unknown', name: 'my rule name' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // empty references
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'ghi',
          namespaces: ['default'],
          attributes: getMockAdHocRunAttributes(),
          references: [],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "references".',
        rule: { id: 'unknown', name: 'my rule name' },
      },
    });
  });

  test('should return error for malformed responses when original create request is provided', () => {
    const attributes = getMockAdHocRunAttributes();
    expect(
      transformAdHocRunToBackfillResult({
        // missing id
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          namespaces: ['default'],
          attributes,
          references: [{ id: '1', name: 'rule', type: 'alert' }],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        originalSO: {
          type: 'ad_hoc_rule_run_params',
          attributes,
          references: [{ id: '1', name: 'rule', type: 'alert' }],
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "id".',
        rule: { id: '1', name: 'my rule name' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // missing attributes
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'abc',
          namespaces: ['default'],
          references: [{ id: '1', name: 'rule', type: 'alert' }],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        originalSO: {
          type: 'ad_hoc_rule_run_params',
          attributes,
          references: [{ id: '1', name: 'rule', type: 'alert' }],
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "attributes".',
        rule: { id: '1', name: 'my rule name' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // missing references
        // @ts-expect-error
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'def',
          namespaces: ['default'],
          attributes,
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        originalSO: {
          type: 'ad_hoc_rule_run_params',
          attributes,
          references: [{ id: '1', name: 'rule', type: 'alert' }],
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "references".',
        rule: { id: '1', name: 'my rule name' },
      },
    });
    expect(
      transformAdHocRunToBackfillResult({
        // empty references
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: 'ghi',
          namespaces: ['default'],
          attributes,
          references: [],
          managed: false,
          coreMigrationVersion: '8.8.0',
          updated_at: '2024-02-07T16:05:39.296Z',
          created_at: '2024-02-07T16:05:39.296Z',
          version: 'WzcsMV0=',
        },
        originalSO: {
          type: 'ad_hoc_rule_run_params',
          attributes,
          references: [{ id: '1', name: 'rule', type: 'alert' }],
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Malformed saved object in bulkCreate response - Missing "references".',
        rule: { id: '1', name: 'my rule name' },
      },
    });
  });

  test('should pass through error if saved object error when original create request is not provided', () => {
    expect(
      transformAdHocRunToBackfillResult({
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: '788a2784-c021-484f-a53e-0c1c63c7567c',
          error: {
            error: 'my error',
            message: 'Unable to create',
            statusCode: 404,
          },
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Unable to create',
        rule: { id: 'unknown' },
      },
    });
  });

  test('should pass through error if saved object error when original create request is provided', () => {
    expect(
      transformAdHocRunToBackfillResult({
        adHocRunSO: {
          type: 'ad_hoc_rule_run_params',
          id: '788a2784-c021-484f-a53e-0c1c63c7567c',
          error: {
            error: 'my error',
            message: 'Unable to create',
            statusCode: 404,
          },
        },
        originalSO: {
          type: 'ad_hoc_rule_run_params',
          attributes: getMockAdHocRunAttributes(),
          references: [{ id: '1', name: 'rule', type: 'alert' }],
        },
        isSystemAction,
      })
    ).toEqual({
      error: {
        message: 'Unable to create',
        rule: { id: '1', name: 'my rule name' },
      },
    });
  });
});

describe('transformAdHocRunToAdHocRunData', () => {
  test('should transform bulk create response and include api key', () => {
    expect(
      transformAdHocRunToAdHocRunData({
        adHocRunSO: getBulkCreateResponse('abc', '1', getMockAdHocRunAttributes()),
        isSystemAction,
      })
    ).toEqual({
      id: 'abc',
      apiKeyId: '123',
      apiKeyToUse: 'MTIzOmFiYw==',
      createdAt: '2024-01-30T00:00:00.000Z',
      duration: '12h',
      enabled: true,
      rule: {
        id: '1',
        name: 'my rule name',
        tags: ['foo'],
        actions: [],
        alertTypeId: 'myType',
        params: {},
        apiKeyOwner: 'user',
        apiKeyCreatedByUser: false,
        consumer: 'myApp',
        enabled: true,
        schedule: {
          interval: '12h',
        },
        createdBy: 'user',
        updatedBy: 'user',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        revision: 0,
      },
      spaceId: 'default',
      start: '2023-10-19T15:07:40.011Z',
      status: adHocRunStatus.PENDING,
      schedule: [
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T03:07:40.011Z',
        },
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T15:07:40.011Z',
        },
      ],
    });
  });

  test('should transform bulk create response with actions and include api key', () => {
    expect(
      transformAdHocRunToAdHocRunData({
        adHocRunSO: getBulkCreateResponse(
          'abc',
          '1',
          getMockAdHocRunAttributes({
            actions: [
              {
                uuid: '123abc',
                group: 'default',
                actionRef: 'action_0',
                actionTypeId: 'test',
                params: {},
              },
            ],
          }),
          [{ id: '4', name: 'action_0', type: 'action' }]
        ),
        isSystemAction,
      })
    ).toEqual({
      id: 'abc',
      apiKeyId: '123',
      apiKeyToUse: 'MTIzOmFiYw==',
      createdAt: '2024-01-30T00:00:00.000Z',
      duration: '12h',
      enabled: true,
      rule: {
        id: '1',
        name: 'my rule name',
        tags: ['foo'],
        actions: [{ actionTypeId: 'test', group: 'default', id: '4', params: {}, uuid: '123abc' }],
        alertTypeId: 'myType',
        params: {},
        apiKeyOwner: 'user',
        apiKeyCreatedByUser: false,
        consumer: 'myApp',
        enabled: true,
        schedule: {
          interval: '12h',
        },
        createdBy: 'user',
        updatedBy: 'user',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        revision: 0,
      },
      spaceId: 'default',
      start: '2023-10-19T15:07:40.011Z',
      status: adHocRunStatus.PENDING,
      schedule: [
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T03:07:40.011Z',
        },
        {
          interval: '12h',
          status: adHocRunStatus.PENDING,
          runAt: '2023-10-20T15:07:40.011Z',
        },
      ],
    });
  });
});
