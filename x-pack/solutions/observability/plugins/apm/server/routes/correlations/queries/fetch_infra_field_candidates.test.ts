/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  HOST_NAME,
  CONTAINER_ID,
  KUBERNETES_POD_NAME,
  CLOUD_REGION,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
} from '@kbn/apm-types';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { fetchInfraFieldCandidates } from './fetch_infra_field_candidates';

const makeFieldEntry = () => ({
  keyword: { type: 'keyword', metadata_field: false, searchable: true, aggregatable: true },
});

const mockFieldCaps = jest.fn();
const mockApmEventClient = {
  fieldCaps: mockFieldCaps,
} as unknown as APMEventClient;

const defaultParams = {
  apmEventClient: mockApmEventClient,
  eventType: ProcessorEvent.transaction,
  start: 0,
  end: 1_000_000,
  environment: 'ENVIRONMENT_ALL',
  query: { match_all: {} } as any,
  kuery: '',
};

describe('fetchInfraFieldCandidates', () => {
  beforeEach(() => {
    mockFieldCaps.mockReset();
  });

  it('returns only infra fields present in the field caps response', async () => {
    mockFieldCaps.mockResolvedValue({
      fields: {
        [HOST_NAME]: makeFieldEntry(),
        [CONTAINER_ID]: makeFieldEntry(),
        [CLOUD_REGION]: makeFieldEntry(),
        // non-infra fields should be filtered out
        [SERVICE_NAME]: makeFieldEntry(),
        'some.other.field': makeFieldEntry(),
      },
    });

    const result = await fetchInfraFieldCandidates(defaultParams);

    expect(result.fieldCandidates).toEqual(
      expect.arrayContaining([HOST_NAME, CONTAINER_ID, CLOUD_REGION])
    );
    expect(result.fieldCandidates).not.toContain(SERVICE_NAME);
    expect(result.fieldCandidates).not.toContain('some.other.field');
  });

  it('returns empty array when no infra fields are present', async () => {
    mockFieldCaps.mockResolvedValue({
      fields: {
        [SERVICE_NAME]: makeFieldEntry(),
        'transaction.duration.us': makeFieldEntry(),
      },
    });

    const result = await fetchInfraFieldCandidates(defaultParams);

    expect(result.fieldCandidates).toEqual([]);
  });

  it('returns all matching infra fields when response includes them all', async () => {
    mockFieldCaps.mockResolvedValue({
      fields: {
        [HOST_NAME]: makeFieldEntry(),
        [CONTAINER_ID]: makeFieldEntry(),
        [KUBERNETES_POD_NAME]: makeFieldEntry(),
      },
    });

    const result = await fetchInfraFieldCandidates(defaultParams);

    expect(result.fieldCandidates).toHaveLength(3);
  });

  it('passes getCommonCorrelationsQuery as index_filter (includes environment and kuery)', async () => {
    mockFieldCaps.mockResolvedValue({ fields: {} });

    await fetchInfraFieldCandidates({
      ...defaultParams,
      environment: 'production',
      kuery: 'service.name: "my-service"',
    });

    const callArgs = mockFieldCaps.mock.calls[0][1];
    const filter: unknown[] = callArgs.index_filter.bool.filter;

    expect(callArgs.index_filter).toHaveProperty('bool');
    expect(filter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ range: expect.anything() }),
        expect.objectContaining({ term: { [SERVICE_ENVIRONMENT]: 'production' } }),
      ])
    );
    // kuery clause expands filter beyond query + range + environment (≥ 4 clauses)
    expect(filter.length).toBeGreaterThanOrEqual(4);
  });
});
