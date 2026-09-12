/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  AGENTIC_INVESTIGATIONS_API_VERSION,
  PROPOSAL_CHARTS_SUMMARY_URL,
} from '@kbn/agentic-investigations-plugin/common';
import type { ProposalChartsSummaryResponse } from '@kbn/agentic-investigations-plugin/common';
import { queryKeys } from '../query_keys';
import { retryOnTransientError } from './use_watches_api';

/**
 * Exported so callers that render the window (axis labels, tooltip ranges) read
 * the same values the data was fetched with, rather than restating them.
 */
export const DEFAULT_WINDOW_HOURS = 24;
export const DEFAULT_BUCKET_MINUTES = 30;

export const useProposalChartsSummary = ({
  windowHours = DEFAULT_WINDOW_HOURS,
  bucketMinutes = DEFAULT_BUCKET_MINUTES,
}: { windowHours?: number; bucketMinutes?: number } = {}) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.proposals.chartsSummary(windowHours, bucketMinutes),
    queryFn: (): Promise<ProposalChartsSummaryResponse> =>
      services.http!.get<ProposalChartsSummaryResponse>(PROPOSAL_CHARTS_SUMMARY_URL, {
        version: AGENTIC_INVESTIGATIONS_API_VERSION,
        query: { windowHours, bucketMinutes },
      }),
    keepPreviousData: true,
    retry: retryOnTransientError,
  });
};
