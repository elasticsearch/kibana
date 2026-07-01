/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type {
  RuleIndexEntry,
  RequiredField,
  IndexToRulesMap,
  PipelineToIndicesMap,
  CategoryToIndicesMap,
  TacticTotals,
  MachineLearningRuleIndex,
  ReverseMapResult,
  ReverseMapErrors,
  CategoriesResponse,
} from '@kbn/siem-readiness';

import { findRules } from '../../detection_engine/rule_management/logic/search/find_rules';
import type { RuleParams } from '../../detection_engine/rule_schema';
import { fetchCategories } from './fetch_categories';

export interface FetchRulesReverseMapDeps {
  rulesClient: RulesClient;
  esClient: ElasticsearchClient;
  dataViewsService: DataViewsService;
  logger: Logger;
  /**
   * Pre-fetched categories result. When provided, the internal fetchCategories call is skipped,
   * eliminating the duplicate ES aggregation that occurs when callers already hold this data.
   */
  categoriesData?: CategoriesResponse;
}

interface ThreatTactic {
  id?: string;
  name?: string;
  reference?: string;
}

const extractTactics = (params: RuleParams): Array<{ id: string; name: string }> => {
  const threat = params.threat;
  if (!threat || !Array.isArray(threat)) {
    return [];
  }

  const tactics: Array<{ id: string; name: string }> = [];
  for (const item of threat) {
    const tactic = item.tactic as ThreatTactic | undefined;
    if (tactic?.id && tactic?.name) {
      tactics.push({ id: tactic.id, name: tactic.name });
    }
  }
  return tactics;
};

interface AlertingRule {
  id: string;
  name: string;
  tags: string[];
  enabled: boolean;
  params: RuleParams;
}

const buildRuleEntry = (rule: AlertingRule): RuleIndexEntry => ({
  id: rule.id,
  name: rule.name,
  tactics: extractTactics(rule.params),
  enabled: rule.enabled,
});

interface ResolveResult {
  indices: string[];
  failed: boolean;
}

const resolvePatterns = async (
  patterns: string[],
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<ResolveResult> => {
  if (patterns.length === 0) {
    return { indices: [], failed: false };
  }

  try {
    const result = await esClient.indices.resolveIndex({
      name: patterns.join(','),
      expand_wildcards: 'open',
    });

    return {
      indices: [
        ...result.indices.map((i) => i.name),
        ...(result.data_streams?.flatMap((ds) => [ds.name, ...ds.backing_indices]) ?? []),
      ],
      failed: false,
    };
  } catch (err: unknown) {
    logger.warn(
      `siem_readiness: resolveIndex failed for patterns [${patterns.join(',')}] — ${
        (err as { message?: string }).message ?? 'unknown error'
      }`
    );
    return { indices: [], failed: true };
  }
};

const resolveRuleIndices = async (
  params: RuleParams,
  esClient: ElasticsearchClient,
  dataViewsService: DataViewsService,
  logger: Logger
): Promise<ResolveResult> => {
  const dataViewId = (params as { dataViewId?: string }).dataViewId;
  if (dataViewId) {
    try {
      const dataView = await dataViewsService.get(dataViewId);
      const patterns = dataView.getIndexPattern().split(',').filter(Boolean);
      return resolvePatterns(patterns, esClient, logger);
    } catch (err: unknown) {
      logger.warn(
        `siem_readiness: data view resolution failed for id "${dataViewId}" — ${
          (err as { message?: string }).message ?? 'unknown error'
        }, falling through to index patterns`
      );
      // Fall through to index patterns below
    }
  }

  const index = (params as { index?: string[] }).index;
  if (index && index.length > 0) {
    return resolvePatterns(index, esClient, logger);
  }

  return { indices: [], failed: false };
};

interface ProcessRuleContext {
  indexToRules: IndexToRulesMap;
  tacticTotals: TacticTotals;
  mlRules: MachineLearningRuleIndex;
  esClient: ElasticsearchClient;
  dataViewsService: DataViewsService;
  logger: Logger;
}

/**
 * Processes a single enabled rule: updates tacticTotals, mlRules, and indexToRules.
 * Returns whether any index resolution for this rule failed (sets rulesPartial upstream).
 */
const processRule = async (ruleData: unknown, ctx: ProcessRuleContext): Promise<boolean> => {
  const rule = ruleData as unknown as AlertingRule;
  const entry = buildRuleEntry(rule);
  let anyFailed = false;

  for (const tactic of entry.tactics) {
    const existing = ctx.tacticTotals.get(tactic.id);
    ctx.tacticTotals.set(tactic.id, {
      id: tactic.id,
      name: tactic.name,
      totalRules: (existing?.totalRules ?? 0) + 1,
    });
  }

  const ruleType = rule.params.type;

  if (ruleType === 'machine_learning') {
    ctx.mlRules.push(entry);
  } else {
    const { indices, failed } = await resolveRuleIndices(
      rule.params,
      ctx.esClient,
      ctx.dataViewsService,
      ctx.logger
    );
    if (failed) anyFailed = true;

    for (const index of indices) {
      const existing = ctx.indexToRules.get(index) ?? [];
      existing.push(entry);
      ctx.indexToRules.set(index, existing);
    }

    if (ruleType === 'threat_match') {
      const threatIndex = (rule.params as { threatIndex?: string[] }).threatIndex;
      if (threatIndex && threatIndex.length > 0) {
        const { indices: threatIndices, failed: threatFailed } = await resolvePatterns(
          threatIndex,
          ctx.esClient,
          ctx.logger
        );
        if (threatFailed) anyFailed = true;
        for (const index of threatIndices) {
          const existing = ctx.indexToRules.get(index) ?? [];
          existing.push(entry);
          ctx.indexToRules.set(index, existing);
        }
      }
    }
  }

  return anyFailed;
};

export const fetchRulesReverseMap = async ({
  rulesClient,
  esClient,
  dataViewsService,
  logger,
  categoriesData,
}: FetchRulesReverseMapDeps): Promise<ReverseMapResult> => {
  const indexToRules: IndexToRulesMap = new Map();
  const pipelineToIndices: PipelineToIndicesMap = new Map();
  const categoryToIndices: CategoryToIndicesMap = new Map();
  const tacticTotals: TacticTotals = new Map();
  const mlRules: MachineLearningRuleIndex = [];
  const ruleRequiredFields: Map<string, RequiredField[]> = new Map();
  const errors: ReverseMapErrors = { pipelineMap: false, categoryMap: false, rulesPartial: false };

  // 1. Build pipeline -> indices map from index settings
  try {
    const allIndicesSettings = await esClient.indices.getSettings({
      index: '*',
      flat_settings: true,
    });

    for (const [indexName, settings] of Object.entries(allIndicesSettings)) {
      const flatSettings = settings.settings as Record<string, string> | undefined;
      const pipeline = flatSettings?.['index.default_pipeline'];
      if (pipeline) {
        const indices = pipelineToIndices.get(pipeline) ?? [];
        indices.push(indexName);
        pipelineToIndices.set(pipeline, indices);
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `siem_readiness: failed to build pipeline->indices map — ${
        (err as { message?: string }).message ?? 'unknown error'
      }`
    );
    errors.pipelineMap = true;
  }

  // 2. Build category -> indices map. Use pre-fetched categoriesData if provided
  //    to avoid a duplicate ES aggregation call when the caller already holds it.
  try {
    const resolvedCategories = categoriesData ?? (await fetchCategories({ esClient, logger }));
    for (const categoryGroup of resolvedCategories.mainCategoriesMap) {
      const indices = categoryGroup.indices.map((idx) => idx.indexName);
      categoryToIndices.set(categoryGroup.category, indices);
    }
  } catch (err: unknown) {
    logger.warn(
      `siem_readiness: failed to build category->indices map — ${
        (err as { message?: string }).message ?? 'unknown error'
      }`
    );
    errors.categoryMap = true;
  }

  // 3. Build index -> rules map by paginating through all enabled rules.
  //    findRules failures are fatal — hasDetectionRules cannot be trusted if rules cannot be listed.
  let searchAfter: SortResults | undefined;
  let pageCount = 0;
  const maxPages = 100;
  const ruleCtx: ProcessRuleContext = {
    indexToRules,
    tacticTotals,
    mlRules,
    esClient,
    dataViewsService,
    logger,
  };

  try {
    do {
      pageCount++;
      if (pageCount > maxPages) {
        break;
      }

      const result = await findRules({
        rulesClient,
        filter: 'alert.attributes.enabled:true',
        perPage: 1000,
        page: undefined,
        sortField: 'createdAt',
        sortOrder: 'asc',
        searchAfter,
      });

      for (const ruleData of result.data) {
        // Capture required_fields so fetch_rule_field_caps can check mapping coverage.
        // The alerting framework stores this as camelCase requiredFields inside params
        // (convert_rule_response_to_alerting_rule maps required_fields → requiredFields).
        const rule = ruleData as unknown as AlertingRule;
        const requiredFields =
          (rule.params as { requiredFields?: RequiredField[] }).requiredFields ?? [];
        ruleRequiredFields.set(rule.id, requiredFields);

        const anyFailed = await processRule(ruleData, ruleCtx);
        if (anyFailed) {
          errors.rulesPartial = true;
        }
      }

      searchAfter =
        result.data.length > 0
          ? (result.data[result.data.length - 1] as unknown as { sort?: SortResults }).sort
          : undefined;
    } while (searchAfter);
  } catch (err: unknown) {
    logger.warn(
      `siem_readiness: rule pagination failed — ${
        (err as { message?: string }).message ?? 'unknown error'
      }`
    );
    throw err;
  }

  return {
    indexToRules,
    pipelineToIndices,
    categoryToIndices,
    tacticTotals,
    mlRules,
    ruleRequiredFields,
    errors,
  };
};
