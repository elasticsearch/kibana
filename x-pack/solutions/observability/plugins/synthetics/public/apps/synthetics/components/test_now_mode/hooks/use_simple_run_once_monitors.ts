/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createEsParams } from '@kbn/observability-shared-plugin/public';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { FINAL_SUMMARY_FILTER } from '../../../../../../common/constants/client_defaults';
import type { Ping } from '../../../../../../common/runtime_types';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';
import { useTickTick } from './use_tick_tick';

const MAX_RETRIES = 50;

export const useSimpleRunOnceMonitors = ({
  expectSummaryDocs,
  testRunId,
}: {
  expectSummaryDocs: number;
  testRunId: string;
}) => {
  const { refreshTimer, lastRefresh } = useTickTick(2 * 1000);
  const [numberOfRetries, setNumberOfRetries] = useState(0);

  const { data, loading } = useSyntheticsEsSearch(
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
            FINAL_SUMMARY_FILTER,
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

  const lastUpdated = useRef<{ checksum: string; time: number }>({
    checksum: '',
    time: Date.now(),
  });

  useEffect(() => {
    const docs = data?.hits.hits ?? [];

    if (docs.length === 0) {
      setNumberOfRetries((prevState) => prevState + 1);
    }
  }, [data]);

  return useMemo(() => {
    const docs = data?.hits.hits ?? [];

    // Whenever a new found document is fetched, update lastUpdated
    const docsChecksum = docs
      .map(({ _id }: { _id?: string }) => _id!)
      .reduce((acc, cur) => acc + cur, '');
    if (docsChecksum !== lastUpdated.current.checksum) {
      // Mutating lastUpdated
      lastUpdated.current.checksum = docsChecksum;
      lastUpdated.current.time = Date.now();
    }

    if (docs.length > 0) {
      if (docs.length >= expectSummaryDocs) {
        clearInterval(refreshTimer);
      }

      return {
        data,
        loading,
        summaryDocs: docs.map((doc) => ({
          ...(doc._source as Ping),
          timestamp: (doc._source as Record<string, string>)?.['@timestamp'],
          docId: doc._id,
        })),
        lastUpdated: lastUpdated.current.time,
      };
    }

    return {
      retriesExceeded: numberOfRetries > MAX_RETRIES,
      data,
      loading,
      summaryDocs: null,
      lastUpdated: lastUpdated.current.time,
    };
  }, [data, numberOfRetries, loading, expectSummaryDocs, refreshTimer]);
};
