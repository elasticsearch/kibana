/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { encode as encodeRison } from '@kbn/rison';

export const ALERTING_V2_SECTION_ID = 'alertingV2';
export const ALERTING_V2_RULES_APP_ID = 'rules';
export const ALERTING_V2_ACTION_POLICIES_APP_ID = 'action_policies';
export const ALERTING_V2_EPISODES_APP_ID = 'episodes';
export const ALERTING_V2_EXECUTION_HISTORY_APP_ID = 'execution_history';

export const ALERTING_V2_RULES_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_RULES_APP_ID}`;
export const ALERTING_V2_ACTION_POLICIES_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_ACTION_POLICIES_APP_ID}`;
export const ALERTING_V2_EPISODES_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_EPISODES_APP_ID}`;
export const ALERTING_V2_EXECUTION_HISTORY_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_EXECUTION_HISTORY_APP_ID}`;

export const ALERTING_V2_RULES_MANAGEMENT_PATH = `${ALERTING_V2_SECTION_ID}/${ALERTING_V2_RULES_APP_ID}`;
export const ALERTING_V2_ACTION_POLICIES_MANAGEMENT_PATH = `${ALERTING_V2_SECTION_ID}/${ALERTING_V2_ACTION_POLICIES_APP_ID}`;
export const ALERTING_V2_EPISODES_MANAGEMENT_PATH = `${ALERTING_V2_SECTION_ID}/${ALERTING_V2_EPISODES_APP_ID}`;
export const ALERTING_V2_EXECUTION_HISTORY_MANAGEMENT_PATH = `${ALERTING_V2_SECTION_ID}/${ALERTING_V2_EXECUTION_HISTORY_APP_ID}`;

export const MANAGEMENT_APP_ID = 'management';
export {
  ALERTING_V2_RULE_API_PATH,
  ALERTING_V2_ACTION_POLICY_API_PATH,
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH,
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH,
  ALERTING_V2_EXECUTION_HISTORY_RULES_API_PATH,
} from '@kbn/alerting-v2-constants';

export interface AlertEpisodesListLinkOptions {
  /** Pre-applied filters carried via the rison-encoded `_a` query param. */
  filters?: {
    ruleId?: string;
    groupHash?: string;
    status?: string;
    /**
     * Display-only companion to `groupHash`. When the source surface (e.g.
     * the rule details heatmap) has already resolved grouping field values,
     * passing them through avoids a second lookup at the destination.
     */
    groupingValues?: Record<string, string | null>;
  };
  /** Time range embedded in `_a.episodesList.{timeFrom,timeTo}`. */
  timeRange?: { from: string; to: string };
}

export const CREATE_WITH_AGENT_INITIAL_PROMPT =
  'Load the rule-management skill and help me create a new alerting v2 rule. Ask me what I want to monitor and guide me through the setup.';

export const AGENT_BUILDER_NEW_CONVERSATION_PATH = '/agents/elastic-ai-agent/conversations/new';

export const paths = {
  ruleDetails: (id: string) => `${ALERTING_V2_RULES_BASE_PATH}/${encodeURIComponent(id)}`,
  ruleList: ALERTING_V2_RULES_BASE_PATH,
  actionPolicyCreate: `${ALERTING_V2_ACTION_POLICIES_BASE_PATH}/create`,
  actionPolicyEdit: (id: string) =>
    `${ALERTING_V2_ACTION_POLICIES_BASE_PATH}/edit/${encodeURIComponent(id)}`,
  actionPolicyList: ALERTING_V2_ACTION_POLICIES_BASE_PATH,
  /** Plain base path — safe for `<Route path={...}>` definitions. */
  alertEpisodesList: ALERTING_V2_EPISODES_BASE_PATH,
  /**
   * Builds a deep-link URL to the episodes list, optionally pre-seeding
   * filters and time range via `_a.episodesList.*`.
   *
   * Shape MUST match what `readEpisodesListAppStateFromUrlStorage` reads:
   * flat fields inside `_a.episodesList` (`ruleId`, `groupHash`,
   * `groupingValues`, `timeFrom`, `timeTo`). Time is NOT put in `_g` —
   * the episodes list reads time from `_a.episodesList.{timeFrom,timeTo}`
   * so that no Kibana global-time sync fires on mount and pushes a spurious
   * history entry.
   */
  alertEpisodesListHref: (opts?: AlertEpisodesListLinkOptions): string => {
    if (!opts) return ALERTING_V2_EPISODES_BASE_PATH;

    const { filters, timeRange } = opts;
    const episodesList = Object.fromEntries(
      Object.entries({
        ruleId: filters?.ruleId,
        groupHash: filters?.groupHash,
        status: filters?.status,
        groupingValues:
          filters?.groupingValues && Object.keys(filters.groupingValues).length > 0
            ? filters.groupingValues
            : undefined,
        timeFrom: timeRange?.from,
        timeTo: timeRange?.to,
      }).filter(([_key, value]) => value != null)
    );

    if (Object.keys(episodesList).length === 0) return ALERTING_V2_EPISODES_BASE_PATH;

    const search = new URLSearchParams();
    search.set('_a', encodeRison({ episodesList }));
    return `${ALERTING_V2_EPISODES_BASE_PATH}?${search.toString()}`;
  },
  alertEpisodeDetails: (episodeId: string) =>
    `${ALERTING_V2_EPISODES_BASE_PATH}/${encodeURIComponent(episodeId)}`,
  executionHistoryList: ALERTING_V2_EXECUTION_HISTORY_BASE_PATH,
};
