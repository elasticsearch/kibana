/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { ALL_VALUE } from '@kbn/slo-schema';
import moment from 'moment';
import type { DateRange, SLODefinition } from '../domain/models';
import { oneMinute, oneMonth, sevenDays, thirtyDays } from './fixtures/duration';
import { createSLO } from './fixtures/slo';
import {
  HistoricalSummaryClient,
  getFixedIntervalAndBucketsPerDay,
} from './historical_summary_client';

const commonEsResponse = {
  took: 100,
  timed_out: false,
  _shards: {
    total: 0,
    successful: 0,
    skipped: 0,
    failed: 0,
  },
  hits: {
    hits: [],
  },
};

const MINUTES_IN_DAY = 1440;

const generateEsResponseForRollingSLO = (slo: SLODefinition, overridedRange?: DateRange) => {
  const rollingDurationInDays = slo.timeWindow.duration.asMinutes() / MINUTES_IN_DAY;
  const timesliceInMin = slo.objective.timesliceWindow?.asMinutes();
  const overridedRangeInDays = overridedRange
    ? moment(overridedRange.to).diff(moment(overridedRange.from), 'days')
    : 0;

  const { fixedInterval, bucketsPerDay } = getFixedIntervalAndBucketsPerDay(
    overridedRangeInDays ? overridedRangeInDays : rollingDurationInDays
  );
  const fullDuration = overridedRange
    ? rollingDurationInDays + overridedRangeInDays
    : rollingDurationInDays * 2;
  const numberOfBuckets = fullDuration * bucketsPerDay;
  const startRange = moment().subtract(fullDuration, 'day').startOf('minute');
  const bucketSizeInHour = moment
    .duration(
      fixedInterval.slice(0, -1),
      fixedInterval.slice(-1) as moment.unitOfTime.DurationConstructor
    )
    .asHours();

  const good = timesliceInMin ? Math.floor(((bucketSizeInHour * 60) / timesliceInMin) * 0.97) : 97;
  const total = timesliceInMin ? Math.floor((bucketSizeInHour * 60) / timesliceInMin) : 100;

  return {
    ...commonEsResponse,
    responses: [
      {
        ...commonEsResponse,
        aggregations: {
          daily: {
            buckets: Array(numberOfBuckets)
              .fill(0)
              .map((_, index) => ({
                key_as_string: startRange
                  .clone()
                  .add(index * bucketSizeInHour, 'hours')
                  .toISOString(),
                key: startRange
                  .clone()
                  .add(index * bucketSizeInHour, 'hours')
                  .format('x'),
                doc_count: 1440,
                total: {
                  value: total,
                },
                good: {
                  value: good,
                },
                cumulative_good: {
                  value:
                    index < rollingDurationInDays * bucketsPerDay
                      ? good * (index + 1)
                      : good * rollingDurationInDays * bucketsPerDay,
                },
                cumulative_total: {
                  value:
                    index < rollingDurationInDays * bucketsPerDay
                      ? total * (index + 1)
                      : total * rollingDurationInDays * bucketsPerDay,
                },
              })),
          },
        },
      },
    ],
  };
};

const generateEsResponseForMonthlyCalendarAlignedSLO = (good: number = 97, total: number = 100) => {
  const { fixedInterval, bucketsPerDay } = getFixedIntervalAndBucketsPerDay(30);
  const currentDayInMonth = 18;
  const numberOfBuckets = currentDayInMonth * bucketsPerDay;
  const bucketSize = Number(fixedInterval.slice(0, -1));
  const startDay = moment.utc().startOf('month');

  return {
    ...commonEsResponse,
    responses: [
      {
        ...commonEsResponse,
        aggregations: {
          daily: {
            buckets: Array(numberOfBuckets)
              .fill(0)
              .map((_, index) => ({
                key_as_string: startDay
                  .clone()
                  .add(index * bucketSize, 'hours')
                  .toISOString(),
                key: startDay
                  .clone()
                  .add(index * bucketSize, 'hours')
                  .format('x'),
                doc_count: 1440,
                total: {
                  value: total,
                },
                good: {
                  value: good,
                },
                cumulative_good: {
                  value: good * (index + 1),
                },
                cumulative_total: {
                  value: total * (index + 1),
                },
              })),
          },
        },
      },
    ],
  };
};

describe('FetchHistoricalSummary', () => {
  let esClientMock: ElasticsearchClientMock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2023-01-18T15:00:00.000Z'));
    esClientMock = elasticsearchServiceMock.createElasticsearchClient();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('Rolling and Occurrences SLOs', () => {
    it('returns the summary using the SLO timeWindow date range', async () => {
      const slo = createSLO({
        timeWindow: { type: 'rolling', duration: thirtyDays() },
        objective: { target: 0.95 },
        groupBy: ALL_VALUE,
      });
      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForRollingSLO(slo));
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );
    });

    it('returns the summary using the provided date range', async () => {
      const slo = createSLO({
        timeWindow: { type: 'rolling', duration: sevenDays() },
        objective: { target: 0.9 },
        groupBy: ALL_VALUE,
      });
      const range: DateRange = {
        from: new Date('2023-01-09T15:00:00.000Z'),
        to: new Date('2023-01-13T15:00:00.000Z'),
      };

      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForRollingSLO(slo, range));
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
            range,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );
    });
  });

  describe('Rolling and Timeslices SLOs', () => {
    it('returns the summary using the SLO timeWindow date range', async () => {
      const slo = createSLO({
        timeWindow: { type: 'rolling', duration: thirtyDays() },
        budgetingMethod: 'timeslices',
        objective: { target: 0.95, timesliceTarget: 0.9, timesliceWindow: oneMinute() },
        groupBy: ALL_VALUE,
      });
      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForRollingSLO(slo));
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );
      expect(results[0].data).toHaveLength(180);
    });

    it('returns the summary using the provided date range', async () => {
      const slo = createSLO({
        timeWindow: { type: 'rolling', duration: thirtyDays() },
        budgetingMethod: 'timeslices',
        objective: { target: 0.95, timesliceTarget: 0.9, timesliceWindow: oneMinute() },
        groupBy: ALL_VALUE,
      });
      const range: DateRange = {
        from: new Date('2023-01-09T15:00:00.000Z'),
        to: new Date('2023-01-13T15:00:00.000Z'),
      };
      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForRollingSLO(slo, range));
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
            range,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );
    });
  });

  describe('Calendar Aligned and Timeslices SLOs', () => {
    it('returns the summary', async () => {
      const slo = createSLO({
        timeWindow: {
          duration: oneMonth(),
          type: 'calendarAligned',
        },
        budgetingMethod: 'timeslices',
        objective: { target: 0.95, timesliceTarget: 0.9, timesliceWindow: oneMinute() },
      });
      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForMonthlyCalendarAlignedSLO());
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );
      expect(results[0].data).toHaveLength(108);
    });
  });

  describe('Calendar Aligned and Occurrences SLOs', () => {
    it('returns the summary', async () => {
      const slo = createSLO({
        timeWindow: {
          duration: oneMonth(),
          type: 'calendarAligned',
        },
        budgetingMethod: 'occurrences',
        objective: { target: 0.95 },
      });
      esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForMonthlyCalendarAlignedSLO());
      const client = new HistoricalSummaryClient(esClientMock, 'default');

      const results = await client.fetch({
        list: [
          {
            timeWindow: slo.timeWindow,
            groupBy: slo.groupBy,
            budgetingMethod: slo.budgetingMethod,
            objective: slo.objective,
            revision: slo.revision,
            sloId: slo.id,
            instanceId: ALL_VALUE,
          },
        ],
      });

      results[0].data.forEach((dailyResult) =>
        expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
      );

      expect(results[0].data).toHaveLength(108);
    });
  });

  it("filters with the 'instanceId' when provided", async () => {
    const slo = createSLO({
      timeWindow: { type: 'rolling', duration: thirtyDays() },
      objective: { target: 0.95 },
      groupBy: 'host',
    });
    esClientMock.msearch.mockResolvedValueOnce(generateEsResponseForRollingSLO(slo));
    const client = new HistoricalSummaryClient(esClientMock, 'default');

    const results = await client.fetch({
      list: [
        {
          timeWindow: slo.timeWindow,
          groupBy: slo.groupBy,
          budgetingMethod: slo.budgetingMethod,
          objective: slo.objective,
          revision: slo.revision,
          sloId: slo.id,
          instanceId: 'host-abc',
        },
      ],
    });

    expect(
      // @ts-ignore
      esClientMock.msearch.mock.calls[0][0].searches[1].query.bool.filter[4]
    ).toEqual({ term: { 'slo.instanceId': 'host-abc' } });

    results[0].data.forEach((dailyResult) =>
      expect(dailyResult).toMatchSnapshot({ date: expect.any(String) })
    );
    expect(results[0].data).toHaveLength(180);
  });
});
