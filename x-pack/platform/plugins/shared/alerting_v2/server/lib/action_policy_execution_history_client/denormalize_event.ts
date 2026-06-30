/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IValidatedEvent } from '@kbn/event-log-plugin/server';
import type {
  PolicyExecutionHistoryItem,
  PolicyExecutionOutcome,
  SearchMatchCounts,
} from '@kbn/alerting-v2-schemas';
import { ACTION_POLICY_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { ACTION_POLICY_EVENT_ACTIONS } from '../dispatcher/steps/constants';

export type { PolicyExecutionHistoryItem };

export interface NameMaps {
  policyNames: Map<string, string>;
  ruleNames: Map<string, string>;
  workflowNames: Map<string, string>;
}

export interface ResolvedSearchIds {
  policyIds: string[];
  ruleIds: string[];
  hasMatches: boolean;
  matches: SearchMatchCounts | null;
}

export const isString = (v: unknown): v is string => typeof v === 'string';

export const isPolicyOutcome = (action: unknown): action is PolicyExecutionOutcome =>
  action === ACTION_POLICY_EVENT_ACTIONS.DISPATCHED ||
  action === ACTION_POLICY_EVENT_ACTIONS.THROTTLED;

export function collectIdsFromEvents(events: IValidatedEvent[]): {
  policyIds: string[];
  ruleIds: string[];
  workflowIds: string[];
} {
  const policyIds = new Set<string>();
  const ruleIds = new Set<string>();
  const workflowIds = new Set<string>();

  for (const event of events) {
    if (!event) continue;
    const savedObjects = event.kibana?.saved_objects ?? [];
    for (const so of savedObjects) {
      if (!isString(so.id)) continue;
      if (so.type === ACTION_POLICY_SAVED_OBJECT_TYPE) policyIds.add(so.id);
      else if (so.type === RULE_SAVED_OBJECT_TYPE) ruleIds.add(so.id);
    }
    const dispatcher = event.kibana?.alerting_v2?.dispatcher;
    for (const id of dispatcher?.rule_ids ?? []) {
      if (isString(id)) ruleIds.add(id);
    }
    for (const id of dispatcher?.workflow_ids ?? []) {
      if (isString(id)) workflowIds.add(id);
    }
  }

  return {
    policyIds: [...policyIds],
    ruleIds: [...ruleIds],
    workflowIds: [...workflowIds],
  };
}

/**
 * Returns the relevant rule IDs for a given log event, based on the resolved search IDs and the policy ID.
 * If search is not active (i.e., no matchingSearchIds), all rule IDs are relevant.
 * If the policy ID is in the resolved search IDs, all rule IDs are relevant.
 * If there are specific rule IDs in the resolved search IDs, only those are relevant.
 * Otherwise, no rule IDs are relevant.
 * @param policyId the ID of the policy for the current log event
 * @param allRuleIds all rule IDs referenced by the current log event
 * @param matchingSearchIds search IDs resolved from the search query, or undefined if no search is active
 * @returns an array of relevant rule IDs for the current log event
 */
export function getRelevantRuleIdsFromLogEvent(
  policyId: string,
  allRuleIds: string[],
  matchingSearchIds?: ResolvedSearchIds
): string[] {
  if (!matchingSearchIds || matchingSearchIds.policyIds.includes(policyId)) {
    return allRuleIds;
  }

  return allRuleIds.filter((ruleId) => matchingSearchIds.ruleIds.includes(ruleId));
}

export function denormalizeEvent(
  event: IValidatedEvent,
  { policyNames, ruleNames, workflowNames }: NameMaps,
  matchingSearchIds?: ResolvedSearchIds
): PolicyExecutionHistoryItem[] {
  if (!event || (matchingSearchIds && !matchingSearchIds.hasMatches)) {
    return [];
  }

  const timestamp = event['@timestamp'];
  const action = event.event?.action;
  if (!timestamp || !isPolicyOutcome(action)) return [];

  const savedObjects = event.kibana?.saved_objects ?? [];
  const policyId = savedObjects.find((so) => so.type === ACTION_POLICY_SAVED_OBJECT_TYPE)?.id;
  if (!policyId) return [];

  const dispatcher = event.kibana?.alerting_v2?.dispatcher ?? {};

  const referencedRuleIds = savedObjects
    .filter((so) => so.type === RULE_SAVED_OBJECT_TYPE)
    .map((so) => so.id);
  const allRuleIds = [...referencedRuleIds, ...(dispatcher.rule_ids ?? [])].filter(isString);
  const relevantRuleIds = getRelevantRuleIdsFromLogEvent(policyId, allRuleIds, matchingSearchIds);

  const workflows = (dispatcher.workflow_ids ?? [])
    .filter(isString)
    .map((id) => ({ id, name: workflowNames.get(id) ?? null }));

  return relevantRuleIds.map((ruleId) => ({
    '@timestamp': timestamp,
    policy: { id: policyId, name: policyNames.get(policyId) ?? null },
    rule: { id: ruleId, name: ruleNames.get(ruleId) ?? null },
    outcome: action,
    episode_count: Number(dispatcher.episode_count ?? 0),
    action_group_count: Number(dispatcher.action_group_count ?? 0),
    workflows,
  }));
}
