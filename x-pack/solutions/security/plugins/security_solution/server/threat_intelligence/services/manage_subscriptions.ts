/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  GLOBAL_SPACE_ID,
  SUBSCRIPTION_TEMPLATE_IDS,
  THREAT_INTEL_SUBSCRIPTIONS_INDEX,
  getSubscriptionTemplate,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';

/**
 * Domain capability module for the `manage_subscriptions` action
 * (create / list / delete + the resolve helper used by the interactive
 * confirmation card).
 *
 * Same module is consumed by:
 *   - `routes/subscriptions.ts` (the canonical execution surface)
 *   - The Agent Builder `manage_subscriptions` tool wrapper (delegates to
 *     these helpers — only kept for 3rd party agent portability per the
 *     architecture guidance).
 *   - Internally, the legacy `SUBMIT_SUBSCRIPTION_API_PATH` route used by
 *     the editable confirmation attachment.
 */

export interface SubscriptionDelivery {
  type: 'email' | 'slack';
  target: string;
  connector_id?: string;
}

export interface PersistSubscriptionInput {
  tags: string[];
  severity_threshold: SeverityLevel;
  schedule_rrule: string;
  delivery: SubscriptionDelivery;
  template_id?: string;
  owner?: string;
  /**
   * Logical per-space isolation tag. Routes resolve `request.getSpaceId()`
   * and pass it; agent-builder tool invocations leave it undefined and
   * the row defaults to `'default'`.
   */
  space_id?: string;
}

export interface PersistSubscriptionResult {
  subscription_id: string;
  human_summary: string;
}

const humanizeSchedule = (
  rrule: string,
  tags: string[],
  severity: string,
  target: string
): string => {
  const tagList = tags.map((t) => `\`${t}\``).join(', ');
  const friendly = /WEEKLY/.test(rrule) ? 'Weekly' : /DAILY/.test(rrule) ? 'Daily' : rrule;
  return `${friendly} digest of ${severity}+ severity reports tagged ${tagList} delivered to \`${target}\`.`;
};

export const persistSubscription = async (
  esClient: ElasticsearchClient,
  input: PersistSubscriptionInput
): Promise<PersistSubscriptionResult> => {
  const humanSummary = humanizeSchedule(
    input.schedule_rrule,
    input.tags,
    input.severity_threshold,
    input.delivery.target
  );
  const now = new Date().toISOString();
  const indexResponse = await esClient.index({
    index: THREAT_INTEL_SUBSCRIPTIONS_INDEX,
    document: {
      owner: input.owner ?? 'self',
      tags: input.tags,
      severity_threshold: input.severity_threshold,
      schedule_rrule: input.schedule_rrule,
      delivery: input.delivery,
      human_summary: humanSummary,
      template_id: input.template_id,
      space_id: input.space_id ?? 'default',
      created_at: now,
      updated_at: now,
    },
  });
  return { subscription_id: indexResponse._id, human_summary: humanSummary };
};

/**
 * Resolves a partially-specified `create` request (using a template when
 * provided) into the fully-formed `PersistSubscriptionInput` the index
 * write expects. Pure (no I/O); used by both the route and the tool.
 */
export interface ResolveSubscriptionInput {
  tags?: string[];
  severity_threshold?: SeverityLevel;
  schedule_rrule?: string;
  delivery_type?: 'email' | 'slack';
  delivery_target?: string;
  delivery_connector_id?: string;
  template_id?: string;
}

export interface ResolvedSubscription {
  tags: string[];
  severity_threshold: SeverityLevel;
  schedule_rrule: string;
  delivery: SubscriptionDelivery;
  template_id?: string;
  human_summary: string;
}

export type ResolveSubscriptionOutcome =
  | { ok: true; resolved: ResolvedSubscription }
  | { ok: false; reason: string };

export const resolveSubscriptionParams = (
  input: ResolveSubscriptionInput
): ResolveSubscriptionOutcome => {
  if (!input.delivery_target) {
    return { ok: false, reason: '`delivery_target` is required for `action="create"`.' };
  }
  const template = input.template_id ? getSubscriptionTemplate(input.template_id) : undefined;

  const tags = input.tags ?? template?.tags;
  if (!tags || tags.length === 0) {
    return {
      ok: false,
      reason:
        'No `tags` were provided and no `template_id` was set. Either pass tags directly or ' +
        `pick a template from: ${SUBSCRIPTION_TEMPLATE_IDS.join(', ')}.`,
    };
  }

  const deliveryType = input.delivery_type ?? template?.delivery_type_default ?? 'email';
  const severity = input.severity_threshold ?? template?.severity_threshold ?? 'medium';
  const scheduleRrule =
    input.schedule_rrule ?? template?.schedule_rrule ?? 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9';

  const delivery: SubscriptionDelivery = {
    type: deliveryType,
    target: input.delivery_target,
    ...(input.delivery_connector_id
      ? { connector_id: input.delivery_connector_id }
      : template?.delivery_connector_id_default
      ? { connector_id: template.delivery_connector_id_default }
      : {}),
  };

  return {
    ok: true,
    resolved: {
      tags,
      severity_threshold: severity,
      schedule_rrule: scheduleRrule,
      delivery,
      template_id: template?.id,
      human_summary: humanizeSchedule(scheduleRrule, tags, severity, delivery.target),
    },
  };
};

export interface ListSubscriptionsResult {
  total: number;
  subscriptions: Array<Record<string, unknown> & { subscription_id?: string }>;
}

export const listSubscriptions = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  size: number = 20
): Promise<ListSubscriptionsResult> => {
  try {
    const response = await esClient.search({
      index: THREAT_INTEL_SUBSCRIPTIONS_INDEX,
      size,
      sort: [{ created_at: { order: 'desc' } }],
      query: {
        bool: {
          filter: [{ terms: { space_id: [spaceId, GLOBAL_SPACE_ID] } }],
        },
      },
    });
    const subscriptions = (response.hits.hits ?? []).map((hit) => ({
      subscription_id: hit._id,
      ...(hit._source as Record<string, unknown>),
    }));
    return {
      total:
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value ?? subscriptions.length,
      subscriptions,
    };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      return { total: 0, subscriptions: [] };
    }
    logger.warn(`list_subscriptions failed: ${(err as Error).message}`);
    throw err;
  }
};

export type DeleteSubscriptionResult =
  | { status: 'deleted'; subscription_id: string }
  | { status: 'not_found'; subscription_id: string };

export const deleteSubscription = async (
  esClient: ElasticsearchClient,
  subscriptionId: string,
  spaceId: string
): Promise<DeleteSubscriptionResult> => {
  // Read-before-delete: verify the subscription belongs to the caller's space
  // before allowing deletion, preventing cross-space deletes.
  const getResult = await esClient.get<{ space_id?: string }>(
    { index: THREAT_INTEL_SUBSCRIPTIONS_INDEX, id: subscriptionId },
    { ignore: [404] }
  );
  if (!getResult.found) {
    return { status: 'not_found', subscription_id: subscriptionId };
  }
  const docSpaceId = getResult._source?.space_id;
  if (docSpaceId !== spaceId && docSpaceId !== GLOBAL_SPACE_ID) {
    return { status: 'not_found', subscription_id: subscriptionId };
  }

  try {
    await esClient.delete({
      index: THREAT_INTEL_SUBSCRIPTIONS_INDEX,
      id: subscriptionId,
    });
    return { status: 'deleted', subscription_id: subscriptionId };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      return { status: 'not_found', subscription_id: subscriptionId };
    }
    throw err;
  }
};
