/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NodesStatsRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { CategoriesResponse, MainCategories, PipelineStats } from '@kbn/siem-readiness';
import {
  ALL_CATEGORIES,
  getIndexCategoryMap,
  SILENCE_THRESHOLD_MS,
  SILENCE_THRESHOLD_DEFAULT_MS,
} from '@kbn/siem-readiness';
import type { IndexHealthEntry } from './fetch_index_health';
import { fetchIndexHealth } from './fetch_index_health';
import { fetchCategories } from './fetch_categories';
import { toDataStreamName } from './utils';

export const fetchPipelines = async ({
  esClient,
  isServerless,
  logger,
  categoriesData,
}: {
  esClient: ElasticsearchClient;
  isServerless: boolean;
  logger: Logger;
  /**
   * Pre-fetched categories result. When provided, the internal fetchCategories call is skipped.
   * Used to resolve each pipeline's SIEM category so the per-category silence threshold applies.
   */
  categoriesData?: CategoriesResponse;
}): Promise<PipelineStats[]> => {
  const settingsResponse = await esClient.indices.getSettings({
    index: ['logs-*', 'metrics-*', '.ds-logs-*', '.ds-metrics-*'],
    filter_path: ['*.settings.index.default_pipeline', '*.settings.index.final_pipeline'],
    allow_no_indices: true,
    ignore_unavailable: true,
  });

  const pipelineToIndices: Record<string, Set<string>> = {};

  const addPipelineIndex = (pipeline: string | undefined, indexName: string) => {
    if (!pipeline) return;
    if (!pipelineToIndices[pipeline]) {
      pipelineToIndices[pipeline] = new Set();
    }
    pipelineToIndices[pipeline].add(indexName);
  };

  Object.keys(settingsResponse).forEach((indexName) => {
    const indexData = settingsResponse[indexName];
    addPipelineIndex(indexData.settings?.index?.default_pipeline, indexName);
    addPipelineIndex(indexData.settings?.index?.final_pipeline, indexName);
  });

  if (isServerless) {
    const pipelines: PipelineStats[] = Object.keys(pipelineToIndices).map((name) => ({
      name,
      indices: Array.from(pipelineToIndices[name]),
      docsCount: 0,
      failedDocsCount: 0,
      statsAvailable: false,
    }));

    logger.info(`Retrieved ${pipelines.length} ingest pipelines (serverless mode)`);
    return pipelines;
  }

  const nodesStatsRequest: NodesStatsRequest = {
    metric: 'ingest',
    filter_path: ['nodes.*.ingest.pipelines.*.count', 'nodes.*.ingest.pipelines.*.failed'],
    timeout: '30s',
  };

  const nodesStatsResponse = await esClient.nodes.stats(nodesStatsRequest);

  const pipelineStatsMap: Record<string, { count: number; failed: number }> = {};

  const nodes = Object.values(nodesStatsResponse.nodes || {});
  nodes.forEach((node) => {
    const nodePipelines = node.ingest?.pipelines || {};
    Object.keys(nodePipelines).forEach((pipelineName) => {
      const pipelineData = nodePipelines[pipelineName];
      if (!pipelineStatsMap[pipelineName]) {
        pipelineStatsMap[pipelineName] = { count: 0, failed: 0 };
      }
      pipelineStatsMap[pipelineName].count += pipelineData.count || 0;
      pipelineStatsMap[pipelineName].failed += pipelineData.failed || 0;
    });
  });

  const rawPipelines: PipelineStats[] = Object.keys(pipelineStatsMap)
    .filter((name) => pipelineStatsMap[name].count > 0)
    .map((name) => ({
      name,
      indices: Array.from(pipelineToIndices[name] || []),
      docsCount: pipelineStatsMap[name].count,
      failedDocsCount: pipelineStatsMap[name].failed,
      statsAvailable: true,
    }));

  const indexHealth = await fetchIndexHealth({ esClient, logger });

  // Resolve each pipeline's SIEM category so the per-category silence threshold can be applied.
  // Categories live "at the edges" (tool/UI), so when not provided we self-fetch here — this is
  // the layer where isSilent is computed, and it must know the category to pick the right threshold.
  const resolvedCategories = categoriesData ?? (await fetchCategories({ esClient, logger }));
  const indexToCategoryMap = getIndexCategoryMap(resolvedCategories);

  const now = Date.now();

  const pipelines: PipelineStats[] = rawPipelines.map((p) => {
    // Collect ALL health entries for every stream this pipeline touches.
    // A pipeline can fan-out to multiple data streams; .find() would silently
    // drop silence/volume signals from secondary streams and make the result
    // dependent on index iteration order.
    const healthEntries: IndexHealthEntry[] = [];
    for (const idx of p.indices) {
      const entry: IndexHealthEntry | undefined = indexHealth[toDataStreamName(idx)];
      if (entry !== undefined) {
        healthEntries.push(entry);
      }
    }

    // lastEventMs: most recent event from any stream.
    // The pipeline is "live" as long as at least one stream is feeding data.
    let lastEventMs: number | null = null;
    for (const h of healthEntries) {
      if (h.lastEventMs !== null) {
        lastEventMs = lastEventMs === null ? h.lastEventMs : Math.max(lastEventMs, h.lastEventMs);
      }
    }
    const silenceMs: number | null = lastEventMs !== null ? now - lastEventMs : null;

    // Volume: sum across all streams that have a valid baseline (bootstrap streams
    // return null and are excluded), then recompute drop % from the merged totals.
    // Averaging individual drop percentages would be incorrect.
    let lastFullDayDocs: number | null = null;
    let baseline7dAvg: number | null = null;
    let volumeDropPct: number | null = null;
    for (const h of healthEntries) {
      if (h.lastFullDayDocs !== null && h.baseline7dAvg !== null) {
        lastFullDayDocs = (lastFullDayDocs ?? 0) + h.lastFullDayDocs;
        baseline7dAvg = (baseline7dAvg ?? 0) + h.baseline7dAvg;
      }
    }
    if (lastFullDayDocs !== null && baseline7dAvg !== null && baseline7dAvg > 0) {
      volumeDropPct = Math.max(
        0,
        Math.round(((baseline7dAvg - lastFullDayDocs) / baseline7dAvg) * 100)
      );
    }

    // Resolve this pipeline's SIEM categories from the indices it serves.
    const categories = Array.from(
      new Set(
        p.indices
          .map((idx) => indexToCategoryMap.get(idx))
          .filter((c): c is MainCategories => ALL_CATEGORIES.some((mc) => mc === c))
      )
    );

    // Apply the most lenient per-category silence threshold so a pipeline that also serves a
    // slow/batch category (e.g. Application/SaaS 24h) is not falsely flagged. Fall back to the
    // default when no category resolves.
    const thresholds = categories.map((c) => SILENCE_THRESHOLD_MS[c]);
    const threshold =
      thresholds.length > 0 ? Math.max(...thresholds) : SILENCE_THRESHOLD_DEFAULT_MS;
    const isSilent = silenceMs !== null && silenceMs > threshold;

    return {
      ...p,
      categories,
      lastEventMs,
      silenceMs,
      isSilent,
      lastFullDayDocs,
      baseline7dAvg,
      volumeDropPct,
    };
  });

  logger.info(`Retrieved ${pipelines.length} active ingest pipelines`);
  return pipelines;
};
