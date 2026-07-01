/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';

export const mockAADEcsDataWithAlert: Ecs = {
  _id: '1',
  timestamp: '2021-01-10T21:12:47.839Z',
  host: {
    name: ['apache'],
    ip: ['192.168.0.1'],
  },
  event: {
    id: ['1'],
    action: ['Action'],
    category: ['Access'],
    module: ['nginx'],
    severity: [3],
  },
  source: {
    ip: ['192.168.0.1'],
    port: [80],
  },
  destination: {
    ip: ['192.168.0.3'],
    port: [6343],
  },
  user: {
    id: ['1'],
    name: ['john.dee'],
  },
  geo: {
    region_name: ['xx'],
    country_iso_code: ['xx'],
  },
  kibana: {
    alert: {
      original_time: ['2021-01-10T21:12:45.839Z'],
      rule: {
        created_at: ['2021-01-10T21:12:47.839Z'],
        updated_at: ['2021-01-10T21:12:47.839Z'],
        created_by: ['elastic'],
        description: ['24/7'],
        enabled: [true],
        false_positives: ['test-1'],
        parameters: {
          filters: [
            {
              meta: {
                key: 'host.name',
                negate: false,
                params: '"{"query":"placeholder"}"',
                type: 'phrase',
              },
              query: { match_phrase: { 'host.name': 'placeholder' } },
            },
            {
              query: { match_all: {} },
            },
          ],
          language: ['kuery'],
          query: ['user.id:1'],
        },
        from: ['now-300s'],
        uuid: ['b5ba41ab-aaf3-4f43-971b-bdf9434ce0ea'],
        immutable: [false],
        index: ['auditbeat-*'],
        interval: ['5m'],
        rule_id: ['rule-id-1'],
        output_index: [''],
        max_signals: [100],
        risk_score: ['21'],
        references: ['www.test.co'],
        saved_id: ["Garrett's IP"],
        timeline_id: ['1234-2136-11ea-9864-ebc8cc1cb8c2'],
        timeline_title: ['Untitled timeline'],
        severity: ['low'],
        updated_by: ['elastic'],
        tags: [],
        to: ['now'],
        type: ['saved_query'],
        threat: [],
        note: ['# this is some markdown documentation'],
        version: ['1'],
      },
    },
  },
};

export const getThresholdDetectionAlertAADMock = (overrides: Partial<Ecs> = {}): Ecs[] => [
  {
    ...mockAADEcsDataWithAlert,
    kibana: {
      alert: {
        ...mockAADEcsDataWithAlert.kibana?.alert,
        rule: {
          ...mockAADEcsDataWithAlert.kibana?.alert?.rule,
          parameters: {
            ...mockAADEcsDataWithAlert.kibana?.alert?.rule?.parameters,
            threshold: {
              field: ['destination.ip'],
              value: 1,
            },
          },
          name: ['mock threshold rule'],
          saved_id: [],
          type: ['threshold'],
          uuid: ['c5ba41ab-aaf3-4f43-971b-bdf9434ce0ea'],
        },
        threshold_result: {
          count: 99,
          from: '2021-01-10T21:11:45.839Z',
          cardinality: [
            {
              field: 'source.ip',
              value: 1,
            },
          ],
          terms: [
            {
              field: 'destination.ip',
              value: 1,
            },
          ],
        },
      },
    },
    ...overrides,
  },
];

export const mockSuppressedAlertExceptionList = {
  id: 'exception-list-id',
  list_id: 'rule-default-list-id',
  type: 'rule_default',
  namespace_type: 'single',
};

export const mockSuppressedAlertTimestamp = '2026-06-29T13:30:00.000Z';

export type SuppressedDetectionAlertFieldsApiMock = Omit<Ecs, 'kibana'> & {
  '@timestamp': string[];
  kibana: {
    alert: {
      rule: {
        consumer: string[];
        from: string[];
        name: string[];
        to: string[];
        uuid: string[];
        rule_id: string[];
        type: string[];
        parameters: string[];
      };
      workflow_status: string[];
      reason: string[];
      severity: string[];
      risk_score: string[];
      suppression: {
        docs_count: string[];
      };
    };
  };
};

export const getSuppressedDetectionAlertAADMock = (
  overrides: Partial<SuppressedDetectionAlertFieldsApiMock> = {}
): SuppressedDetectionAlertFieldsApiMock => ({
  ...overrides,
  _id: overrides._id ?? 'suppressed-alert-id',
  _index: overrides._index ?? 'original-row-index',
  '@timestamp': overrides['@timestamp'] ?? [mockSuppressedAlertTimestamp],
  kibana: overrides.kibana ?? {
    alert: {
      rule: {
        consumer: ['siem'],
        from: ['now-9m'],
        name: ['Mock Database Enumeration'],
        to: ['now'],
        uuid: ['b3da6db9-3793-4f9f-839e-258a56588dc8'],
        rule_id: ['28f82c42-98ac-46d0-a0d6-5933cff79558'],
        type: ['query'],
        parameters: [
          JSON.stringify({
            severity: 'medium',
            rule_id: '28f82c42-98ac-46d0-a0d6-5933cff79558',
            alert_suppression: {
              group_by: ['mock.detection.name', 'source.ip', 'destination.ip'],
              duration: {
                value: 30,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            exceptions_list: mockSuppressedAlertExceptionList,
            risk_score: 47,
            query: 'event.severity >= 4',
            description: 'Suppressed alert with one exception list for Timeline repro',
            index: 'logs-mock-*',
            from: 'now-9m',
            language: 'kuery',
            to: 'now',
            type: 'query',
          }),
        ],
      },
      workflow_status: ['open'],
      reason: [
        'event with source 192.0.2.10 destination 192.0.2.20 created medium alert Mock Database Enumeration.',
      ],
      severity: ['medium'],
      risk_score: ['60'],
      suppression: {
        docs_count: ['1'],
      },
    },
  },
});

export const mockSuppressedDetectionAlertAADSource = {
  '@timestamp': mockSuppressedAlertTimestamp,
  'kibana.alert.rule.type': 'query',
  'kibana.alert.rule.indices': ['logs-mock-*'],
  'kibana.alert.rule.parameters': {
    language: 'kuery',
    query: 'event.severity >= 4',
    exceptions_list: [mockSuppressedAlertExceptionList],
  },
  'kibana.alert.rule.exceptions_list': [mockSuppressedAlertExceptionList],
  'kibana.alert.suppression.terms': [
    {
      field: 'mock.detection.name',
      value: 'Mock Database Enumeration',
    },
  ],
  'kibana.alert.suppression.start': '2026-06-29T13:25:00.000Z',
  'kibana.alert.suppression.end': mockSuppressedAlertTimestamp,
};
