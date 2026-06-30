/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchSearchRequestBody } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import type {
  BudgetingMethod,
  DurationUnit,
  FetchHistoricalSummaryParams,
  FetchHistoricalSummaryResponse,
  HistoricalSummaryResponse,
} from '@kbn/slo-schema';
import {
  ALL_VALUE,
  calendarAlignedTimeWindowSchema,
  occurrencesBudgetingMethodSchema,
  rollingTimeWindowSchema,
  timeslicesBudgetingMethodSchema,
  toMomentUnitOfTime,
} from '@kbn/slo-schema';
import { assertNever } from '@kbn/std';
import moment from 'moment';
import { SLI_DESTINATION_INDEX_PATTERN } from '../../common/constants';
import type { DateRange, GroupBy, Objective, SLOId, TimeWindow } from '../domain/models';
import { toCalendarAlignedTimeWindowMomentUnit } from '../domain/models';
import { computeSLI, computeSummaryStatus, toErrorBudget } from '../domain/services';
import { getSlicesFromDateRange } from './utils/get_slices_from_date_range';

interface DailyAggBucket {
  key_as_string: string;
  key: number;
  doc_count: number;
  total: {
    value: number;
  };
  good: {
    value: number;
  };
  cumulative_good?: {
    value: number;
  };
  cumulative_total?: {
    value: number;
  };
}

export class HistoricalSummaryClient {
  constructor(private esClient: ElasticsearchClient, private spaceId: string) {}

  async fetch(params: FetchHistoricalSummaryParams): Promise<FetchHistoricalSummaryResponse> {
    const dateRangeBySlo = params.list.reduce<
      Record<SLOId, { range: DateRange; queryRange: DateRange }>
    >((acc, { sloId, timeWindow, range }) => {
      acc[sloId] = getDateRange(timeWindow, range);
      return acc;
    }, {});

    const searches = params.list.flatMap(
      ({ sloId, revision, budgetingMethod, instanceId, groupBy, timeWindow, remoteName }) => [
        {
          index: remoteName
            ? `${remoteName}:${SLI_DESTINATION_INDEX_PATTERN}`
            : SLI_DESTINATION_INDEX_PATTERN,
        },
        generateSearchQuery({
          groupBy,
          sloId,
          revision,
          instanceId,
          timeWindow,
          budgetingMethod,
          dateRange: dateRangeBySlo[sloId],
          spaceId: this.spaceId,
        }),
      ]
    );

    const historicalSummary: FetchHistoricalSummaryResponse = [];
    if (searches.length === 0) {
      return historicalSummary;
    }

    const result = await this.esClient.msearch({ searches });

    for (let i = 0; i < result.responses.length; i++) {
      const { sloId, instanceId, timeWindow, budgetingMethod, objective } = params.list[i];
      if ('error' in result.responses[i]) {
        // handle erroneous responses with an empty historical summary data
        historicalSummary.push({ sloId, instanceId, data: [] });
        continue;
      }

      // @ts-ignore typing msearch is hard, we cast the response to what it is supposed to be.
      const buckets = (result.responses[i].aggregations?.daily?.buckets as DailyAggBucket[]) || [];

      if (rollingTimeWindowSchema.is(timeWindow)) {
        if (timeslicesBudgetingMethodSchema.is(budgetingMethod)) {
          historicalSummary.push({
            sloId,
            instanceId,
            data: handleResultForRollingAndTimeslices(
              objective,
              timeWindow,
              buckets,
              dateRangeBySlo[sloId]
            ),
          });

          continue;
        }

        if (occurrencesBudgetingMethodSchema.is(budgetingMethod)) {
          historicalSummary.push({
            sloId,
            instanceId,
            data: handleResultForRollingAndOccurrences(objective, buckets, dateRangeBySlo[sloId]),
          });
          continue;
        }

        assertNever(budgetingMethod);
      }

      if (calendarAlignedTimeWindowSchema.is(timeWindow)) {
        if (timeslicesBudgetingMethodSchema.is(budgetingMethod)) {
          const dateRange = dateRangeBySlo[sloId];
          historicalSummary.push({
            sloId,
            instanceId,
            data: handleResultForCalendarAlignedAndTimeslices(objective, buckets, dateRange),
          });

          continue;
        }

        if (occurrencesBudgetingMethodSchema.is(budgetingMethod)) {
          historicalSummary.push({
            sloId,
            instanceId,
            data: handleResultForCalendarAlignedAndOccurrences(objective, buckets),
          });
          continue;
        }

        assertNever(budgetingMethod);
      }

      assertNever(timeWindow);
    }

    return historicalSummary;
  }
}

function handleResultForCalendarAlignedAndOccurrences(
  objective: Objective,
  buckets: DailyAggBucket[]
): HistoricalSummaryResponse[] {
  const initialErrorBudget = 1 - objective.target;

  return buckets.map((bucket: DailyAggBucket) => {
    const good = bucket.cumulative_good?.value ?? 0;
    const total = bucket.cumulative_total?.value ?? 0;
    const sliValue = computeSLI(good, total);
    const consumedErrorBudget = sliValue < 0 ? 0 : (1 - sliValue) / initialErrorBudget;
    const errorBudget = toErrorBudget(initialErrorBudget, consumedErrorBudget, true);

    return {
      date: bucket.key_as_string,
      errorBudget,
      sliValue,
      status: computeSummaryStatus(objective, sliValue, errorBudget),
    };
  });
}

function handleResultForCalendarAlignedAndTimeslices(
  objective: Objective,
  buckets: DailyAggBucket[],
  dateRange: { range: DateRange; queryRange: DateRange }
): HistoricalSummaryResponse[] {
  const initialErrorBudget = 1 - objective.target;
  const totalSlices = getSlicesFromDateRange(dateRange.range, objective.timesliceWindow!);

  return buckets.map((bucket: DailyAggBucket) => {
    const good = bucket.cumulative_good?.value ?? 0;
    const total = bucket.cumulative_total?.value ?? 0;
    const sliValue = computeSLI(good, total, totalSlices);
    const consumedErrorBudget = sliValue < 0 ? 0 : (1 - sliValue) / initialErrorBudget;
    const errorBudget = toErrorBudget(initialErrorBudget, consumedErrorBudget);

    return {
      date: bucket.key_as_string,
      errorBudget,
      sliValue,
      status: computeSummaryStatus(objective, sliValue, errorBudget),
    };
  });
}

function handleResultForRollingAndOccurrences(
  objective: Objective,
  buckets: DailyAggBucket[],
  dateRange: { range: DateRange; queryRange: DateRange }
): HistoricalSummaryResponse[] {
  const initialErrorBudget = 1 - objective.target;

  return buckets
    .filter(
      (bucket) =>
        moment(bucket.key_as_string).isSameOrAfter(dateRange.range.from) &&
        moment(bucket.key_as_string).isSameOrBefore(dateRange.range.to)
    )
    .map((bucket: DailyAggBucket) => {
      const good = bucket.cumulative_good?.value ?? 0;
      const total = bucket.cumulative_total?.value ?? 0;

      const sliValue = computeSLI(good, total);
      const consumedErrorBudget = sliValue < 0 ? 0 : (1 - sliValue) / initialErrorBudget;
      const errorBudget = toErrorBudget(initialErrorBudget, consumedErrorBudget);

      return {
        date: bucket.key_as_string,
        errorBudget,
        sliValue,
        status: computeSummaryStatus(objective, sliValue, errorBudget),
      };
    });
}

function handleResultForRollingAndTimeslices(
  objective: Objective,
  timeWindow: TimeWindow,
  buckets: DailyAggBucket[],
  dateRange: { range: DateRange; queryRange: DateRange }
): HistoricalSummaryResponse[] {
  const initialErrorBudget = 1 - objective.target;

  const totalSlices = Math.ceil(
    timeWindow.duration.asSeconds() / objective.timesliceWindow!.asSeconds()
  );

  return buckets
    .filter(
      (bucket) =>
        moment(bucket.key_as_string).isSameOrAfter(dateRange.range.from) &&
        moment(bucket.key_as_string).isSameOrBefore(dateRange.range.to)
    )
    .map((bucket: DailyAggBucket) => {
      const good = bucket.cumulative_good?.value ?? 0;
      const total = bucket.cumulative_total?.value ?? 0;
      const sliValue = computeSLI(good, total, totalSlices);
      const consumedErrorBudget = sliValue < 0 ? 0 : (1 - sliValue) / initialErrorBudget;
      const errorBudget = toErrorBudget(initialErrorBudget, consumedErrorBudget);

      return {
        date: bucket.key_as_string,
        errorBudget,
        sliValue,
        status: computeSummaryStatus(objective, sliValue, errorBudget),
      };
    });
}

function generateSearchQuery({
  sloId,
  groupBy,
  revision,
  instanceId,
  dateRange,
  timeWindow,
  budgetingMethod,
  spaceId,
}: {
  instanceId: string;
  sloId: string;
  groupBy: GroupBy;
  revision: number;
  dateRange: { range: DateRange; queryRange: DateRange };
  timeWindow: TimeWindow;
  budgetingMethod: BudgetingMethod;
  spaceId: string;
}): SearchSearchRequestBody {
  const unit = toMomentUnitOfTime(timeWindow.duration.unit);
  const timeWindowDurationInDays = moment.duration(timeWindow.duration.value, unit).asDays();

  const queryRangeDurationInDays = Math.ceil(
    moment(dateRange.range.to).diff(dateRange.range.from, 'days')
  );

  const { fixedInterval, bucketsPerDay } =
    getFixedIntervalAndBucketsPerDay(queryRangeDurationInDays);

  const extraFilterByInstanceId =
    !!groupBy && ![groupBy].flat().includes(ALL_VALUE) && instanceId !== ALL_VALUE
      ? [{ term: { 'slo.instanceId': instanceId } }]
      : [];

  return {
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { spaceId } },
          { term: { 'slo.id': sloId } },
          { term: { 'slo.revision': revision } },
          {
            range: {
              '@timestamp': {
                gte: dateRange.queryRange.from.toISOString(),
                lte: dateRange.queryRange.to.toISOString(),
              },
            },
          },
          ...extraFilterByInstanceId,
        ],
      },
    },
    aggs: {
      daily: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: fixedInterval,
          extended_bounds: {
            min: dateRange.queryRange.from.toISOString(),
            max: dateRange.queryRange.to.toISOString(),
          },
        },
        aggs: {
          ...(occurrencesBudgetingMethodSchema.is(budgetingMethod) && {
            good: {
              sum: {
                field: 'slo.numerator',
              },
            },
            total: {
              sum: {
                field: 'slo.denominator',
              },
            },
          }),
          ...(timeslicesBudgetingMethodSchema.is(budgetingMethod) && {
            good: {
              sum: {
                field: 'slo.isGoodSlice',
              },
            },
            total: {
              value_count: {
                field: 'slo.isGoodSlice',
              },
            },
          }),
          cumulative_good: {
            moving_fn: {
              buckets_path: 'good',
              window: timeWindowDurationInDays * bucketsPerDay,
              shift: 1,
              script: 'MovingFunctions.sum(values)',
              gap_policy: 'insert_zeros',
            },
          },
          cumulative_total: {
            moving_fn: {
              buckets_path: 'total',
              window: timeWindowDurationInDays * bucketsPerDay,
              shift: 1,
              script: 'MovingFunctions.sum(values)',
              gap_policy: 'insert_zeros',
            },
          },
        },
      },
    },
  };
}

/**
 * queryRange is used for the filter range on the query,
 * while range is used for storing the actual range requested
 * For rolling SLO, the query range starts 1 timeWindow duration before the actual range from.
 * For calendar aligned SLO, the query range is the same as the range.
 *
 * @param timeWindow
 * @param range
 * @returns the request {range} and the query range {queryRange}
 *
 */
function getDateRange(
  timeWindow: TimeWindow,
  range?: DateRange
): { range: DateRange; queryRange: DateRange } {
  if (rollingTimeWindowSchema.is(timeWindow)) {
    const unit = toMomentUnitOfTime(timeWindow.duration.unit as DurationUnit);

    if (range) {
      return {
        range,
        queryRange: {
          from: moment(range.from)
            .subtract(timeWindow.duration.value, unit)
            .startOf('minute')
            .toDate(),
          to: moment(range.to).startOf('minute').toDate(),
        },
      };
    }

    const now = moment();
    return {
      range: {
        from: now.clone().subtract(timeWindow.duration.value, unit).startOf('minute').toDate(),
        to: now.clone().startOf('minute').toDate(),
      },
      queryRange: {
        from: now
          .clone()
          .subtract(timeWindow.duration.value * 2, unit)
          .startOf('minute')
          .toDate(),
        to: now.clone().startOf('minute').toDate(),
      },
    };
  }

  if (calendarAlignedTimeWindowSchema.is(timeWindow)) {
    // If range is provided, we use the lower bound to calculate the calendar aligned range.
    const now = moment(range?.from ?? new Date());
    const unit = toCalendarAlignedTimeWindowMomentUnit(timeWindow);

    const from = moment.utc(now).startOf(unit);
    const to = moment.utc(now).endOf(unit);

    const calendarRange = { from: from.toDate(), to: to.toDate() };
    return { range: calendarRange, queryRange: calendarRange };
  }

  assertNever(timeWindow);
}

export function getFixedIntervalAndBucketsPerDay(durationInDays: number): {
  fixedInterval: string;
  bucketsPerDay: number;
} {
  if (durationInDays <= 3) {
    return { fixedInterval: '30m', bucketsPerDay: 48 };
  }
  if (durationInDays <= 7) {
    return { fixedInterval: '1h', bucketsPerDay: 24 };
  }
  if (durationInDays <= 30) {
    return { fixedInterval: '4h', bucketsPerDay: 6 };
  }
  if (durationInDays <= 90) {
    return { fixedInterval: '12h', bucketsPerDay: 2 };
  }
  return { fixedInterval: '1d', bucketsPerDay: 1 };
}
