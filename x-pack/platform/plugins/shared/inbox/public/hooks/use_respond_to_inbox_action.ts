/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  API_VERSIONS,
  buildRespondToActionUrl,
  type RespondToInboxActionResponse,
} from '@kbn/inbox-common';
import { queryKeys } from '../query_keys';

export interface RespondToInboxActionArgs {
  sourceApp: string;
  sourceId: string;
  input: Record<string, unknown>;
}

/**
 * React Query mutation that POSTs to the inbox respond route.
 *
 * Server-driven move (no client-side optimistic shuffling):
 *   - The respond route synchronously stamps `respondedBy/At/channel` on
 *     the workflow step doc *before* scheduling the resume (see
 *     {@link https://github.com/elastic/security-team/issues/16706 HITL GA epic}).
 *   - The pending listing filters out any step that has `respondedAt`
 *     set, so the row drops the moment the next refetch runs.
 *   - The history listing surfaces the same step immediately with
 *     `response_mode: 'responded'` and the responder's identity from
 *     `respondedBy`. No invented "optimistic" rows — every client
 *     (Kibana, Slack, agent builder) sees the same audit trail.
 *
 * On settle we invalidate both lists so the next render reflects the
 * authoritative server state. `useInboxActions` carries a short
 * `refetchInterval` to bound the latency between the audit-stamp write
 * (`refresh: 'wait_for'`) and the eventual `finishedAt` write from
 * Task Manager — a single round trip after settle is enough.
 */
export const useRespondToInboxAction = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  return useMutation<RespondToInboxActionResponse, unknown, RespondToInboxActionArgs>({
    mutationFn: async ({ sourceApp, sourceId, input }) =>
      services.http!.post<RespondToInboxActionResponse>(
        buildRespondToActionUrl(sourceApp, sourceId),
        {
          body: JSON.stringify({ input }),
          version: API_VERSIONS.internal.v1,
        }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
  });
};
