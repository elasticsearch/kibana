/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useObservedHostFields } from './use_observed_host_fields';
import { mockObservedHostData } from '../../../../../flyout/entity_details/mocks';
import { TestProviders } from '../../../../../common/mock';

describe('useObservedHostFields', () => {
  it('returns managed host items for Entra host', () => {
    const { result } = renderHook(() => useObservedHostFields(mockObservedHostData), {
      wrapper: TestProviders,
    });

    expect(result.current).toMatchInlineSnapshot(`
      Array [
        Object {
          "field": "host.id",
          "getValues": [Function],
          "label": "Host ID",
        },
        Object {
          "label": "First seen",
          "render": [Function],
        },
        Object {
          "label": "Last seen",
          "render": [Function],
        },
        Object {
          "field": "host.ip",
          "getValues": [Function],
          "label": "IP addresses",
          "renderField": [Function],
        },
        Object {
          "field": "host.mac",
          "getValues": [Function],
          "label": "MAC addresses",
        },
        Object {
          "field": "host.os.platform",
          "getValues": [Function],
          "label": "Platform",
        },
        Object {
          "field": "host.os.name",
          "getValues": [Function],
          "label": "Operating system",
        },
        Object {
          "field": "host.os.family",
          "getValues": [Function],
          "label": "Family",
        },
        Object {
          "field": "host.os.version",
          "getValues": [Function],
          "label": "Version",
        },
        Object {
          "field": "host.architecture",
          "getValues": [Function],
          "label": "Architecture",
        },
        Object {
          "isVisible": [Function],
          "label": "Max anomaly score by job",
          "render": [Function],
        },
        Object {
          "field": "cloud.provider",
          "getValues": [Function],
          "label": "Cloud provider",
        },
        Object {
          "field": "cloud.region",
          "getValues": [Function],
          "label": "Region",
        },
        Object {
          "field": "cloud.instance.id",
          "getValues": [Function],
          "label": "Instance ID",
        },
        Object {
          "field": "cloud.machine.type",
          "getValues": [Function],
          "label": "Machine type",
        },
        Object {
          "isVisible": [Function],
          "label": "Endpoint integration policy",
          "render": [Function],
        },
        Object {
          "isVisible": [Function],
          "label": "Policy Status",
          "render": [Function],
        },
        Object {
          "field": "agent.version",
          "getValues": [Function],
          "isVisible": [Function],
          "label": "Endpoint version",
        },
        Object {
          "isVisible": [Function],
          "label": "Agent status",
          "render": [Function],
        },
      ]
    `);

    expect(
      result.current.map(({ getValues }) => getValues && getValues(mockObservedHostData))
    ).toEqual([
      ['host-id'],
      undefined, // First seen doesn't implement getValues
      undefined, // Last seen doesn't implement getValues
      ['host-ip'],
      ['host-mac'],
      ['host-platform'],
      ['os-name'],
      ['host-family'],
      ['host-version'],
      ['host-architecture'],
      undefined, // Max anomaly score by job doesn't implement getValues
      ['cloud-provider'],
      ['cloud-region'],
      ['cloud-instance-id'],
      ['cloud-machine-type'],
      undefined, // Endpoint integration policy doesn't implement getValues
      undefined, // Policy Status doesn't implement getValues
      ['endpoint-agent-version'],
      undefined, // Agent status doesn't implement getValues
    ]);
  });
});
