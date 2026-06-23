/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { firstValueFrom, of } from 'rxjs';
import { ML_ANOMALY_THRESHOLD, type MlAnomaliesTableRecord } from '@kbn/ml-anomaly-utils';

import { ANOMALIES_TABLE_DEFAULT_QUERY_SIZE } from '../../../../common/constants/search';
import type { CriteriaField } from '@kbn/ml-common-types/results';
import type { MlApi } from '../../services/ml_api_service';
import { fetchAnomaliesTableData$ } from './anomalies_table_data';

/** Rows are mutated in place with UI-only fields (see enrichAnomalies in anomalies_table_data). */
type EnrichedAnomalyTableRow = MlAnomaliesTableRecord & {
  detector?: string;
  rulesLength?: number;
};

function createMlApiStub(getAnomaliesTableData: jest.Mock): MlApi {
  return { results: { getAnomaliesTableData } } as unknown as MlApi;
}

function createTableRow(overrides: Partial<MlAnomaliesTableRecord> = {}): MlAnomaliesTableRecord {
  return {
    time: 1,
    source: { function_description: 'source function' } as MlAnomaliesTableRecord['source'],
    rowId: 'row-1',
    jobId: 'job-1',
    detectorIndex: 0,
    severity: 50,
    ...overrides,
  };
}

describe('fetchAnomaliesTableData$', () => {
  const criteriaFields: CriteriaField[] = [{ fieldName: 'partitionfield', fieldValue: 'a' }];
  const baseParams = {
    jobId: 'job-1',
    criteriaFields,
    tableInterval: 'auto',
    earliestMs: 10,
    latestMs: 20,
    dateFormatTz: 'UTC',
    tableSeverity: undefined as unknown,
    functionDescription: 'max',
  };

  it('calls getAnomaliesTableData with normalized threshold, max records, and maps the response', async () => {
    const anomalies = [createTableRow()];
    const getAnomaliesTableData = jest.fn().mockReturnValue(
      of({
        anomalies,
        interval: '2h',
        examplesByJobId: { 'job-1': { ex: ['e1'] } },
      })
    );

    const result = await firstValueFrom(
      fetchAnomaliesTableData$({
        ...baseParams,
        mlApi: createMlApiStub(getAnomaliesTableData),
        enrichment: {
          source: 'jobService',
          detectorsByJob: {
            'job-1': {
              0: { detector_description: 'detector A', custom_rules: [{}, {}] },
            },
          },
          customUrlsByJob: {},
        },
      })
    );

    expect(getAnomaliesTableData).toHaveBeenCalledWith(
      ['job-1'],
      criteriaFields as unknown as string[],
      [],
      'auto',
      [
        { min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING },
        { min: ML_ANOMALY_THRESHOLD.WARNING, max: ML_ANOMALY_THRESHOLD.MINOR },
        { min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR },
        { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
        { min: ML_ANOMALY_THRESHOLD.CRITICAL },
      ],
      10,
      20,
      'UTC',
      ANOMALIES_TABLE_DEFAULT_QUERY_SIZE,
      undefined,
      undefined,
      'max'
    );

    expect(result.tableData).toEqual({
      anomalies,
      interval: '2h',
      examplesByJobId: { 'job-1': { ex: ['e1'] } },
      showViewSeriesLink: false,
    });
  });

  it('enriches rows for jobService (detector, rulesLength, customUrls)', async () => {
    const row = createTableRow({ jobId: 'job-1', detectorIndex: 0 }) as EnrichedAnomalyTableRow;
    const getAnomaliesTableData = jest.fn().mockReturnValue(
      of({
        anomalies: [row],
        interval: '1h',
        examplesByJobId: {},
      })
    );

    await firstValueFrom(
      fetchAnomaliesTableData$({
        ...baseParams,
        functionDescription: undefined,
        mlApi: createMlApiStub(getAnomaliesTableData),
        enrichment: {
          source: 'jobService',
          detectorsByJob: {
            'job-1': {
              0: { detector_description: 'count', custom_rules: [{}] },
            },
          },
          customUrlsByJob: {
            'job-1': [{ url_name: 'u', url_value: 'http://example' }],
          },
        },
      })
    );

    expect(row.detector).toBe('count');
    expect(row.rulesLength).toBe(1);
    expect(row.customUrls).toEqual([{ url_name: 'u', url_value: 'http://example' }]);
  });

  it('falls back to source.function_description when detector_description is missing', async () => {
    const row = createTableRow() as EnrichedAnomalyTableRow;
    const getAnomaliesTableData = jest
      .fn()
      .mockReturnValue(of({ anomalies: [row], interval: '1h', examplesByJobId: {} }));

    await firstValueFrom(
      fetchAnomaliesTableData$({
        ...baseParams,
        mlApi: createMlApiStub(getAnomaliesTableData),
        enrichment: {
          source: 'jobService',
          detectorsByJob: { 'job-1': { 0: {} } },
          customUrlsByJob: {},
        },
      })
    );

    expect(row.detector).toBe('source function');
    expect(row.rulesLength).toBeUndefined();
  });

  it('enriches rows for singleJob from analysis_config and custom_settings', async () => {
    const row = createTableRow() as EnrichedAnomalyTableRow;
    const getAnomaliesTableData = jest
      .fn()
      .mockReturnValue(of({ anomalies: [row], interval: '1h', examplesByJobId: {} }));

    await firstValueFrom(
      fetchAnomaliesTableData$({
        ...baseParams,
        mlApi: createMlApiStub(getAnomaliesTableData),
        enrichment: {
          source: 'singleJob',
          selectedJob: {
            job_id: 'job-1',
            analysis_config: {
              detectors: [{ detector_description: 'lat', custom_rules: [{}, {}, {}] }],
            },
            custom_settings: {
              custom_urls: [{ url_name: 'dash', url_value: 'http://dash' }],
            },
          },
        },
      })
    );

    expect(row.detector).toBe('lat');
    expect(row.rulesLength).toBe(3);
    expect(row.customUrls).toEqual([{ url_name: 'dash', url_value: 'http://dash' }]);
  });
});
