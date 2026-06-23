/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useEffect, useState, useRef } from 'react';
import { createEsParams, useFetcher } from '@kbn/observability-shared-plugin/public';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { useTickTick } from './use_tick_tick';
import { isStepEnd } from '../../common/monitor_test_result/browser_steps_list';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';
import type { JourneyStep } from '../../../../../../common/runtime_types';
import { fetchBrowserJourney } from '../../../state';

export interface CheckGroupResult {
  checkGroupId: string;
  journeyStarted: boolean;
  journeyDoc?: JourneyStep;
  summaryDoc?: JourneyStep;
  steps: JourneyStep[];
  stepsLoading: boolean;
  completedSteps: number;
}

export const useBrowserEsResults = ({
  testRunId,
  lastRefresh,
}: {
  testRunId: string;
  lastRefresh: number;
}) => {
  return useSyntheticsEsSearch(
    createEsParams({
      index: SYNTHETICS_INDEX_PATTERN,
      sort: [
        {
          '@timestamp': 'desc',
        },
      ],
      query: {
        bool: {
          filter: [
            {
              terms: {
                'synthetics.type': ['heartbeat/summary', 'journey/start'],
              },
            },

            {
              term: {
                test_run_id: testRunId,
              },
            },
          ],
        },
      },
      size: 1000,
    }),
    [testRunId, lastRefresh],
    { name: 'TestRunData' }
  );
};

const MAX_RETRIES = 25;

export const useBrowserRunOnceMonitors = ({
  testRunId,
  skipDetails = false,
  expectSummaryDocs,
}: {
  testRunId: string;
  skipDetails?: boolean;
  expectSummaryDocs: number;
}) => {
  const { refreshTimer, lastRefresh, clearTicks } = useTickTick(5 * 1000);

  const [numberOfRetries, setNumberOfRetries] = useState(0);

  const [checkGroupResults, setCheckGroupResults] = useState<CheckGroupResult[]>(() => {
    return new Array(expectSummaryDocs)
      .fill({
        checkGroupId: '',
        journeyStarted: false,
        steps: [],
        stepsLoading: false,
        completedSteps: 0,
      } as CheckGroupResult)
      .map((emptyCheckGroup, index) => ({
        ...emptyCheckGroup,
        checkGroupId: `placeholder-check-group-${index}`,
      }));
  });

  const lastUpdated = useRef<{ checksum: string; time: number }>({
    checksum: '',
    time: Date.now(),
  });

  const { data, loading: summariesLoading } = useBrowserEsResults({
    testRunId,
    lastRefresh,
  });

  useEffect(() => {
    const hits = data?.hits.hits;

    if (hits && hits.length > 0) {
      const allDocs = (hits ?? []).map(({ _source }) => _source as JourneyStep);
      const checkGroupsById = allDocs
        .filter(
          (doc) =>
            doc.synthetics?.type === 'journey/start' || doc.synthetics?.type === 'heartbeat/summary'
        )
        .reduce(
          (acc, cur) => ({
            ...acc,
            [cur.monitor.check_group]: {
              checkGroupId: cur.monitor.check_group,
              journeyStarted: true,
              journeyDoc: cur,
              summaryDoc: null,
              steps: [],
              stepsLoading: false,
              completedSteps: 0,
            },
          }),
          {}
        ) as Record<string, CheckGroupResult>;

      allDocs.forEach((step) => {
        if (step.synthetics?.type === 'heartbeat/summary') {
          checkGroupsById[step.monitor.check_group].summaryDoc = step;
        }
      });

      const checkGroups = Object.values(checkGroupsById);
      const finishedCheckGroups = checkGroups.filter((group) => !!group.summaryDoc);

      if (finishedCheckGroups.length >= expectSummaryDocs) {
        clearInterval(refreshTimer);
      }

      replaceCheckGroupResults(checkGroups);
    } else {
      setNumberOfRetries((prevState) => {
        const attempts = prevState + 1;
        if (attempts > MAX_RETRIES) {
          clearTicks();
        }
        return attempts;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectSummaryDocs, data, refreshTimer]);

  // Loading steps for browser runs
  const checkGroupIds = checkGroupResults.map(({ checkGroupId }) => checkGroupId);
  const checkGroupCheckSum = checkGroupIds.reduce((acc, cur) => acc + cur, '');
  const { loading: stepLoadingInProgress } = useFetcher(() => {
    if (checkGroupIds.length && !skipDetails) {
      setCheckGroupResults((prevState) => {
        return prevState.map((result) => ({ ...result, stepsLoading: true }));
      });

      return Promise.all(
        checkGroupIds.map((id) => {
          return fetchBrowserJourney({
            checkGroup: id,
          })
            .then((stepsData) => {
              updateCheckGroupResult(stepsData.checkGroup, {
                steps: stepsData.steps,
                completedSteps: stepsData.steps.filter(isStepEnd).length,
              });

              return stepsData;
            })
            .finally(() => {
              updateCheckGroupResult(id, {
                stepsLoading: false,
              });
            });
        })
      );
    }

    return Promise.resolve(null);
    // FIXME: Dario thinks there is a better way to do this but
    // he's getting tired and maybe the Synthetics folks can fix it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkGroupCheckSum, setCheckGroupResults, lastRefresh]);

  // Whenever a new found document is fetched, update lastUpdated
  useEffect(() => {
    const currentChecksum = getCheckGroupChecksum(checkGroupResults);
    if (checkGroupCheckSum !== lastUpdated.current.checksum) {
      // Mutating lastUpdated
      lastUpdated.current.checksum = currentChecksum;
      lastUpdated.current.time = Date.now();
    }
  }, [checkGroupResults, checkGroupCheckSum]);

  const updateCheckGroupResult = (id: string, result: Partial<CheckGroupResult>) => {
    setCheckGroupResults((prevState) => {
      return prevState.map((r) => {
        if (id !== r.checkGroupId) {
          return r;
        }

        return mergeCheckGroups(r, result);
      }) as CheckGroupResult[];
    });
  };

  const replaceCheckGroupResults = (curCheckGroups: CheckGroupResult[]) => {
    const emptyCheckGroups = checkGroupResults.filter((group) =>
      group.checkGroupId.startsWith('placeholder-check-group')
    );

    // Padding the collection with placeholders so that rows could be shown on UI with loading state
    const paddedCheckGroups =
      curCheckGroups.length < expectSummaryDocs
        ? [
            ...curCheckGroups,
            ...emptyCheckGroups.slice(-1 * (expectSummaryDocs - curCheckGroups.length)),
          ]
        : curCheckGroups;

    setCheckGroupResults((prevCheckGroups) => {
      const newIds = paddedCheckGroups.map(({ checkGroupId }) => checkGroupId);
      const newById: Record<string, CheckGroupResult> = paddedCheckGroups.reduce(
        (acc, cur) => ({ ...acc, [cur.checkGroupId]: cur }),
        {}
      );
      const oldById: Record<string, CheckGroupResult> = prevCheckGroups.reduce(
        (acc, cur) => ({ ...acc, [cur.checkGroupId]: cur }),
        {}
      );

      return newIds.map((id) => mergeCheckGroups(oldById[id], newById[id]));
    });
  };

  return {
    data,
    retriesExceeded: numberOfRetries > MAX_RETRIES,
    summariesLoading,
    stepLoadingInProgress,
    expectedSummariesLoaded:
      checkGroupResults.filter(({ summaryDoc }) => !!summaryDoc).length >= expectSummaryDocs,
    checkGroupResults,
    lastUpdated: lastUpdated.current.time,
  };
};

function mergeCheckGroups(prev: CheckGroupResult, curr: Partial<CheckGroupResult>) {
  // Once completed steps has been determined and shown, don't lower the number on UI due to re-fetch
  const completedSteps = curr.completedSteps
    ? Math.max(prev?.completedSteps ?? 0, curr.completedSteps ?? 0)
    : prev?.completedSteps ?? 0;

  let steps = curr.steps ?? [];
  if (steps.length === 0 && (prev?.steps ?? []).length > 0) {
    steps = prev.steps;
  }

  return {
    ...(prev ?? {}),
    ...curr,
    steps,
    completedSteps,
  };
}

function getCheckGroupChecksum(checkGroupResults: CheckGroupResult[]) {
  return checkGroupResults.reduce((acc, cur) => {
    return (
      acc +
      (cur?.journeyDoc?._id ?? '') +
      (cur?.summaryDoc?._id ?? '') +
      (cur?.steps ?? []).reduce((stepAcc, { _id }) => stepAcc + _id, '')
    );
  }, '');
}
