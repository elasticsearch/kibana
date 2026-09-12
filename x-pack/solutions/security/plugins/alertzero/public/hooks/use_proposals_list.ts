/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { API_VERSIONS, ALERTZERO_PROPOSALS_URL } from '@kbn/alertzero-common';
import type { GetProposalsListResponse } from '../../common/proposals/list';
import { queryKeys } from '../query_keys';
import { retryOnTransientError } from './use_watches_api';

/** Exported so callers that need a specific window read the constant from one place. */
export const DEFAULT_PROPOSALS_WINDOW_HOURS = 24;

/**
 * Proposals grouped by action category for the AlertZero landing page.
 *
 * Two things that are invisible to the type checker:
 *
 * 1. This is the **AlertZero** route — it carries `API_VERSIONS.internal.v1`, not the
 *    `AGENTIC_INVESTIGATIONS_API_VERSION` used by `use_proposals_api.ts` next door.
 *    Passing the wrong version is a runtime 400.
 *
 * 2. `ALERTZERO_PROPOSALS_URL` and `API_VERSIONS` come from `@kbn/alertzero-common`
 *    directly (matching `use_watches_api.ts`), not via `common/constants.ts`, which
 *    is the server's re-export site.
 */
export const useProposalsList = (windowHours = DEFAULT_PROPOSALS_WINDOW_HOURS) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.proposals.groupedList(windowHours),
    queryFn: (): Promise<GetProposalsListResponse> =>
      services.http!.get<GetProposalsListResponse>(ALERTZERO_PROPOSALS_URL, {
        version: API_VERSIONS.internal.v1,
        query: { windowHours },
      }),
    keepPreviousData: true,
    retry: retryOnTransientError,
  });
};
