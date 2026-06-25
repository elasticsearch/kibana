/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PluginStart } from '@kbn/core-di';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { inject, injectable } from 'inversify';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import { SavedObjectsUtils } from '@kbn/core/server';
import type { SavedObjectError } from '@kbn/core/types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { RuleSavedObjectAttributes } from '../../../saved_objects';
import type { AlertingServerStartDependencies } from '../../../types';
import { convertEveryToSchedulesPerMinute } from '../../duration';
import { spaceIdToNamespace } from '../../space_id_to_namespace';
import { RuleSavedObjectsClientToken } from './tokens';

/**
 * Upper bound on the number of distinct `schedule.every` values the
 * frequency aggregation will sum. Distinct interval strings are few in
 * practice; this is large enough to avoid undercounting the limit.
 */
const SCHEDULE_INTERVAL_AGG_SIZE = 1000;

interface ScheduleEveryAggregationResult {
  schedule_intervals: {
    sum_other_doc_count: number;
    buckets: Array<{ key: string; doc_count: number }>;
  };
}

export type RulesSavedObjectsBulkGetResultItem =
  | {
      id: string;
      attributes: RuleSavedObjectAttributes;
      version?: string;
    }
  | {
      id: string;
      error: SavedObjectError;
    };

export type BulkDeleteResult = Array<
  { id: string; success: true } | { id: string; success: false; error: SavedObjectError }
>;

export type BulkUpdateResultItem =
  | { id: string; success: true }
  | { id: string; success: false; error: SavedObjectError };

export interface RulesFindAllResultItem {
  id: string;
  attributes: RuleSavedObjectAttributes;
  namespaces?: string[];
}

interface RuleWriteResult {
  id: string;
  version?: string;
}

export interface RulesSavedObjectServiceContract {
  create(params: { attrs: RuleSavedObjectAttributes; id?: string }): Promise<RuleWriteResult>;
  get(
    id: string,
    spaceId?: string
  ): Promise<{ id: string; attributes: RuleSavedObjectAttributes; version?: string }>;
  bulkGetByIds(ids: string[], spaceId?: string): Promise<RulesSavedObjectsBulkGetResultItem[]>;
  findByIds(ruleIds: string[], spaceId?: string): Promise<RulesFindAllResultItem[]>;
  update(params: {
    id: string;
    attrs: RuleSavedObjectAttributes;
    version?: string;
  }): Promise<RuleWriteResult>;
  bulkUpdate(
    items: Array<{ id: string; attrs: RuleSavedObjectAttributes; version?: string }>
  ): Promise<BulkUpdateResultItem[]>;
  delete(params: { id: string }): Promise<void>;
  bulkDelete(ids: string[]): Promise<BulkDeleteResult>;
  find(params: {
    page: number;
    perPage: number;
    filter?: string;
    search?: string;
    searchFields?: string[];
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    saved_objects: Array<{ id: string; attributes: RuleSavedObjectAttributes; version?: string }>;
    total: number;
  }>;
  findTags(params?: { filter?: string }): Promise<string[]>;
  getTotalScheduledPerMinute(): Promise<number>;
}

@injectable()
export class RulesSavedObjectService implements RulesSavedObjectServiceContract {
  constructor(
    @inject(RuleSavedObjectsClientToken)
    private readonly client: SavedObjectsClientContract,
    @inject(PluginStart<AlertingServerStartDependencies['spaces']>('spaces'))
    private readonly spaces: SpacesPluginStart
  ) {}
  public async create({
    attrs,
    id,
  }: {
    attrs: RuleSavedObjectAttributes;
    id?: string;
  }): Promise<RuleWriteResult> {
    const ruleId = id ?? SavedObjectsUtils.generateId();
    const result = await this.client.create<RuleSavedObjectAttributes>(
      RULE_SAVED_OBJECT_TYPE,
      attrs,
      {
        id: ruleId,
        overwrite: false,
      }
    );
    return { id: result.id, version: result.version };
  }
  public async get(
    id: string,
    spaceId?: string
  ): Promise<{ id: string; attributes: RuleSavedObjectAttributes; version?: string }> {
    const namespace = spaceIdToNamespace(this.spaces, spaceId);
    const doc = await this.client.get<RuleSavedObjectAttributes>(
      RULE_SAVED_OBJECT_TYPE,
      id,
      namespace ? { namespace } : undefined
    );
    return { id: doc.id, attributes: doc.attributes, version: doc.version };
  }

  public async bulkGetByIds(
    ids: string[],
    spaceId?: string
  ): Promise<RulesSavedObjectsBulkGetResultItem[]> {
    const namespace = spaceIdToNamespace(this.spaces, spaceId);
    if (ids.length === 0) {
      return [];
    }

    const result = await this.client.bulkGet<RuleSavedObjectAttributes>(
      ids.map((id) => ({ type: RULE_SAVED_OBJECT_TYPE, id })),
      namespace ? { namespace } : undefined
    );

    return result.saved_objects.map((doc) => {
      if ('error' in doc && doc.error) {
        return { id: doc.id, error: doc.error };
      }
      return { id: doc.id, attributes: doc.attributes, version: doc.version };
    });
  }

  public async findByIds(ruleIds: string[], spaceId?: string): Promise<RulesFindAllResultItem[]> {
    if (ruleIds.length === 0) {
      return [];
    }

    const namespace = spaceIdToNamespace(this.spaces, spaceId);
    const filter = ruleIds
      .map((id) => `${RULE_SAVED_OBJECT_TYPE}.id: "${RULE_SAVED_OBJECT_TYPE}:${id}"`)
      .join(' OR ');

    const finder = this.client.createPointInTimeFinder<RuleSavedObjectAttributes>({
      type: RULE_SAVED_OBJECT_TYPE,
      perPage: 1000,
      namespaces: namespace ? [namespace] : ['*'],
      filter,
    });

    const results: RulesFindAllResultItem[] = [];
    for await (const response of finder.find()) {
      for (const doc of response.saved_objects) {
        if (!('error' in doc && doc.error)) {
          results.push({ id: doc.id, attributes: doc.attributes, namespaces: doc.namespaces });
        }
      }
    }
    await finder.close();
    return results;
  }

  public async update({
    id,
    attrs,
    version,
  }: {
    id: string;
    attrs: RuleSavedObjectAttributes;
    version?: string;
  }): Promise<RuleWriteResult> {
    const result = await this.client.update<RuleSavedObjectAttributes>(
      RULE_SAVED_OBJECT_TYPE,
      id,
      attrs,
      {
        ...(version ? { version } : {}),
        mergeAttributes: false,
      }
    );
    return { id: result.id, version: result.version };
  }

  public async bulkUpdate(
    items: Array<{ id: string; attrs: RuleSavedObjectAttributes; version?: string }>
  ): Promise<BulkUpdateResultItem[]> {
    if (items.length === 0) {
      return [];
    }

    const result = await this.client.bulkUpdate<RuleSavedObjectAttributes>(
      items.map((item) => ({
        type: RULE_SAVED_OBJECT_TYPE,
        id: item.id,
        attributes: item.attrs,
        ...(item.version ? { version: item.version } : {}),
      }))
    );

    return result.saved_objects.map((doc) => {
      if ('error' in doc && doc.error) {
        return { id: doc.id, success: false as const, error: doc.error };
      }
      return { id: doc.id, success: true as const };
    });
  }

  public async delete({ id }: { id: string }): Promise<void> {
    await this.client.delete(RULE_SAVED_OBJECT_TYPE, id);
  }

  public async bulkDelete(ids: string[]): Promise<BulkDeleteResult> {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.client.bulkDelete(
      ids.map((id) => ({ type: RULE_SAVED_OBJECT_TYPE, id }))
    );

    return result.statuses.map((status) => {
      if (status.success) {
        return { id: status.id, success: true as const };
      }
      return {
        id: status.id,
        success: false as const,
        error: status.error ?? { error: 'Unknown', message: 'Unknown error', statusCode: 500 },
      };
    });
  }

  public async find({
    page,
    perPage,
    filter,
    search,
    searchFields,
    sortField = 'updated_at',
    sortOrder = 'desc',
  }: {
    page: number;
    perPage: number;
    filter?: string;
    search?: string;
    searchFields?: string[];
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    return this.client.find<RuleSavedObjectAttributes>({
      type: RULE_SAVED_OBJECT_TYPE,
      page,
      perPage,
      sortField,
      sortOrder,
      ...(filter ? { filter } : {}),
      ...(search ? { search, searchFields, defaultSearchOperator: 'AND' as const } : {}),
    });
  }

  /**
   * Sums the scheduled rule runs per minute across all enabled rules in every
   * space. Used to enforce the `maxScheduledPerMinute` guardrail. Uses a terms
   * aggregation on the indexed `schedule.every` field, so its cost scales with
   * the number of distinct intervals rather than the number of rules.
   */
  public async getTotalScheduledPerMinute(): Promise<number> {
    const result = await this.client.find<
      RuleSavedObjectAttributes,
      ScheduleEveryAggregationResult
    >({
      type: RULE_SAVED_OBJECT_TYPE,
      perPage: 0,
      namespaces: ['*'],
      filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled: true`,
      aggs: {
        schedule_intervals: {
          terms: {
            field: `${RULE_SAVED_OBJECT_TYPE}.attributes.schedule.every`,
            size: SCHEDULE_INTERVAL_AGG_SIZE,
          },
        },
      },
    });

    const buckets = result.aggregations?.schedule_intervals.buckets ?? [];

    return buckets.reduce(
      (total, { key, doc_count: occurrences }) =>
        total + convertEveryToSchedulesPerMinute(key) * occurrences,
      0
    );
  }

  public async findTags({ filter }: { filter?: string } = {}): Promise<string[]> {
    const result = await this.client.find<RuleSavedObjectAttributes>({
      type: RULE_SAVED_OBJECT_TYPE,
      perPage: 0,
      ...(filter ? { filter } : {}),
      aggs: {
        tags: {
          terms: {
            field: `${RULE_SAVED_OBJECT_TYPE}.attributes.metadata.tags`,
            size: 10000,
            order: { _key: 'asc' },
          },
        },
      },
    });

    const aggs = result.aggregations as { tags?: { buckets: Array<{ key: string }> } } | undefined;

    return aggs?.tags?.buckets.map((bucket) => bucket.key) ?? [];
  }
}
