/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit, pick } from 'lodash';
import type {
  ElasticsearchClient,
  SavedObjectsClient,
  SavedObjectsUpdateOptions,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { decodeRequestVersion } from '@kbn/core-saved-objects-base-server-internal';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { RawRule } from '../types';

import type { RuleAttributesNotPartiallyUpdatable } from '.';
import { RuleAttributesToEncrypt, RuleAttributesIncludedInAAD, RULE_SAVED_OBJECT_TYPE } from '.';

export type PartiallyUpdateableRuleAttributes = Partial<
  Omit<RawRule, RuleAttributesNotPartiallyUpdatable>
>;

interface PartiallyUpdateRuleSavedObjectOptions {
  refresh?: SavedObjectsUpdateOptions['refresh'];
  version?: string;
  ignore404?: boolean;
  namespace?: string; // only should be used  with ISavedObjectsRepository
}

// typed this way so we can send a SavedObjectClient or SavedObjectRepository
type SavedObjectClientForUpdate = Pick<SavedObjectsClient, 'update'>;

// direct, partial update to a rule saved object via scoped SavedObjectsClient
// using namespace set in the client
export async function partiallyUpdateRule(
  savedObjectsClient: SavedObjectClientForUpdate,
  id: string,
  attributes: PartiallyUpdateableRuleAttributes,
  options: PartiallyUpdateRuleSavedObjectOptions = {}
): Promise<void> {
  // ensure we only have the valid attributes that are not encrypted and are excluded from AAD
  const attributeUpdates = omit(attributes, [
    ...RuleAttributesToEncrypt,
    ...RuleAttributesIncludedInAAD,
  ]);
  const updateOptions: SavedObjectsUpdateOptions<RawRule> = pick(
    options,
    'namespace',
    'version',
    'refresh'
  );

  try {
    await savedObjectsClient.update(RULE_SAVED_OBJECT_TYPE, id, attributeUpdates, updateOptions);
  } catch (err) {
    if (options?.ignore404 && SavedObjectsErrorHelpers.isNotFoundError(err)) {
      return;
    }
    throw err;
  }
}

// Explicit list of attributes that we allow to be partially updated
// There should be no overlap between this list and RuleAttributesIncludedInAAD or RuleAttributesToEncrypt
const RuleAttributesAllowedForPartialUpdate = [
  'executionStatus',
  'lastRun',
  'monitoring',
  'nextRun',
  'running',
  'snoozeSchedule',
  'snoozedInstances',
];

export interface ExpiredSnoozedInstance {
  instanceId: string;
  snoozedAt: string;
}

// Painless script that atomically removes snoozed instance entries matching
// both instanceId AND snoozedAt. Matching on snoozedAt prevents a race where
// the user re-snoozes an alert between the SO read and this post-run write —
// the new entry has a different snoozedAt and survives the removeIf.
const REMOVE_SNOOZED_INSTANCES_SCRIPT = `
  if (ctx._source.alert.snoozedInstances != null) {
    ctx._source.alert.snoozedInstances.removeIf(instance ->
      params.expired.stream().anyMatch(e ->
        e.instanceId == instance.instanceId && e.snoozedAt == instance.snoozedAt
      )
    );
  }
`;

// Atomically removes per-alert snooze entries matching the given (instanceId, snoozedAt) pairs.
// Matching on both fields prevents a concurrent re-snooze from being silently deleted:
// a freshly created entry has a different snoozedAt and will not be removed.
export async function atomicRemoveSnoozedInstancesWithEs(
  esClient: ElasticsearchClient,
  id: string,
  expiredInstances: ExpiredSnoozedInstance[],
  options: Pick<PartiallyUpdateRuleSavedObjectOptions, 'ignore404' | 'refresh'> = {}
): Promise<void> {
  const updateParams = {
    id: `alert:${id}`,
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    retry_on_conflict: 3,
    script: {
      lang: 'painless' as const,
      source: REMOVE_SNOOZED_INSTANCES_SCRIPT,
      params: { expired: expiredInstances },
    },
    ...(options.refresh ? { refresh: options.refresh } : {}),
  };

  if (options.ignore404) {
    await esClient.update(updateParams, { ignore: [404] });
  } else {
    await esClient.update(updateParams);
  }
}

// direct, partial update to a rule saved object via ElasticsearchClient

// we do this direct partial update to avoid the overhead of the SavedObjectsClient for
// only these allow-listed fields which don't impact encryption. in addition, because these
// fields are only updated by the system user at the end of a rule run, they should not
// need to be included in any (user-centric) audit logs.
export async function partiallyUpdateRuleWithEs(
  esClient: ElasticsearchClient,
  id: string,
  attributes: PartiallyUpdateableRuleAttributes,
  options: PartiallyUpdateRuleSavedObjectOptions = {}
): Promise<void> {
  // ensure we only have the valid attributes that are not encrypted and are excluded from AAD
  const attributeUpdates = omit(attributes, [
    ...RuleAttributesToEncrypt,
    ...RuleAttributesIncludedInAAD,
  ]);
  // ensure we only have attributes that we explicitly allow to be updated
  const attributesAllowedForUpdate = pick(attributeUpdates, RuleAttributesAllowedForPartialUpdate);

  const updateParams = {
    id: `alert:${id}`,
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    ...(options.version ? decodeRequestVersion(options.version) : {}),
    doc: {
      alert: attributesAllowedForUpdate,
    },
    ...(options.refresh ? { refresh: options.refresh } : {}),
  };

  if (options.ignore404) {
    await esClient.update(updateParams, { ignore: [404] });
  } else {
    await esClient.update(updateParams);
  }
}
