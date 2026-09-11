/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  CORTEX_AI_INDEX_DEST,
  CORTEX_ENTITY_TYPES,
  CORTEX_PAGE_STATUSES,
  type CortexEntityType,
  type CortexPage,
  type CortexPageStatus,
  type CortexPageSummary,
  type CortexStats,
} from '../../common/cortex';

const MAX_LIST_SIZE = 500;
const CORTEX_TAG = 'cortex';

interface CortexKiSource {
  '@timestamp'?: string;
  type?: string;
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
  attributes?: {
    status?: string;
    corroborations?: number | string;
    slug?: string;
  };
}

export interface CortexPageStore {
  list: (options?: { status?: CortexPageStatus; entityType?: CortexEntityType }) => Promise<{
    pages: CortexPageSummary[];
    stats: CortexStats;
  }>;
  get: (id: string) => Promise<CortexPage | undefined>;
  upsert: (page: {
    entityType: CortexEntityType;
    slug: string;
    title: string;
    description?: string;
    content: string;
    status: CortexPageStatus;
    corroborations?: number;
  }) => Promise<CortexPage>;
  corroborate: (id: string) => Promise<CortexPage | undefined>;
  archive: (id: string) => Promise<CortexPage | undefined>;
  pruneDuplicates: () => Promise<number>;
}

const normalizeSlugText = (slug: string): string =>
  slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Optimizer proposals often copy the document id (`cortex_service_email-service`)
 * or a `cortex-<type>-` prefix into `slug`, which used to create a second page
 * for the same entity.
 */
export const canonicalizeSlug = (entityType: CortexEntityType, slug: string): string => {
  let normalized = normalizeSlugText(slug);
  // Only strip type prefixes when the slug was copied from a document id
  // (`cortex-service-email-service`). A real slug like `service-mesh` must stay.
  if (normalized.startsWith('cortex-')) {
    normalized = normalized.slice('cortex-'.length);
    const typePrefix = `${entityType}-`;
    if (normalized.startsWith(typePrefix)) {
      normalized = normalized.slice(typePrefix.length);
    }
  }
  return normalized.replace(/^-+|-+$/g, '').slice(0, 80);
};

export const toCortexKiId = (entityType: CortexEntityType, slug: string): string => {
  const normalizedSlug = canonicalizeSlug(entityType, slug);
  return `cortex_${entityType}_${normalizedSlug}`.slice(0, 512);
};

export const slugFromCortexId = (id: string, entityType: CortexEntityType): string => {
  const prefix = `cortex_${entityType}_`;
  if (id.startsWith(prefix)) {
    return id.slice(prefix.length);
  }
  return id;
};

export const canonicalCortexId = (entityType: CortexEntityType, idOrSlug: string): string =>
  toCortexKiId(entityType, slugFromCortexId(idOrSlug, entityType));

const isEntityType = (value: string | undefined): value is CortexEntityType =>
  value !== undefined && (CORTEX_ENTITY_TYPES as readonly string[]).includes(value);

const isStatus = (value: string | undefined): value is CortexPageStatus =>
  value !== undefined && (CORTEX_PAGE_STATUSES as readonly string[]).includes(value);

const toCorroborations = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
};
const toSummary = (id: string, source: CortexKiSource): CortexPageSummary | undefined => {
  if (!isEntityType(source.type) || source.title === undefined || source.title.length === 0) {
    return undefined;
  }

  const status = isStatus(source.attributes?.status) ? source.attributes.status : 'tentative';

  return {
    id,
    title: source.title,
    entity_type: source.type,
    status,
    corroborations: toCorroborations(source.attributes?.corroborations),
    updated_at: source['@timestamp'] ?? new Date().toISOString(),
    ...(source.description !== undefined && source.description.length > 0
      ? { description: source.description }
      : {}),
  };
};

const toPage = (id: string, source: CortexKiSource): CortexPage | undefined => {
  const summary = toSummary(id, source);
  if (!summary) {
    return undefined;
  }

  const slug =
    typeof source.attributes?.slug === 'string' && source.attributes.slug.length > 0
      ? canonicalizeSlug(summary.entity_type, source.attributes.slug)
      : canonicalizeSlug(summary.entity_type, slugFromCortexId(id, summary.entity_type));

  return {
    ...summary,
    slug,
    content: source.content ?? '',
  };
};

const buildStats = (pages: CortexPageSummary[]): CortexStats => {
  const established = pages.filter((page) => page.status === 'established').length;
  const totalCorroborations = pages.reduce((sum, page) => sum + page.corroborations, 0);
  const lastUpdated = pages.reduce<string | undefined>((latest, page) => {
    if (latest === undefined || page.updated_at > latest) {
      return page.updated_at;
    }
    return latest;
  }, undefined);

  return {
    total: pages.length,
    established,
    total_corroborations: totalCorroborations,
    ...(lastUpdated !== undefined ? { last_updated: lastUpdated } : {}),
  };
};

const collapseDuplicatePages = (pages: CortexPageSummary[]): CortexPageSummary[] => {
  const groups = new Map<string, CortexPageSummary[]>();
  for (const page of pages) {
    const key = canonicalCortexId(page.entity_type, page.id);
    const group = groups.get(key) ?? [];
    group.push(page);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const canonicalId = canonicalCortexId(group[0].entity_type, group[0].id);
      return (
        group.find((page) => page.id === canonicalId) ??
        group.slice().sort((left, right) => {
          if (right.corroborations !== left.corroborations) {
            return right.corroborations - left.corroborations;
          }
          return left.updated_at < right.updated_at ? 1 : -1;
        })[0]
      );
    })
    .sort((left, right) => (left.updated_at < right.updated_at ? 1 : -1));
};

export const createCortexPageStore = ({
  esClient,
  logger,
  destValue = CORTEX_AI_INDEX_DEST,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
  destValue?: string;
}): CortexPageStore => {
  const listAllRaw = async (): Promise<CortexPageSummary[]> => {
    const response = await esClient.search<CortexKiSource>({
      index: destValue,
      ignore_unavailable: true,
      allow_no_indices: true,
      size: MAX_LIST_SIZE,
      track_total_hits: false,
      query: { term: { tags: CORTEX_TAG } },
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    });

    return response.hits.hits.flatMap((hit) => {
      if (hit._id === undefined || hit._source === undefined) {
        return [];
      }
      const summary = toSummary(hit._id, hit._source);
      return summary ? [summary] : [];
    });
  };

  const listAll = async (): Promise<CortexPageSummary[]> =>
    collapseDuplicatePages(await listAllRaw());

  const preferredStatus = (pages: CortexPageSummary[]): CortexPageStatus => {
    if (pages.some((page) => page.status === 'established')) {
      return 'established';
    }
    if (pages.some((page) => page.status === 'tentative')) {
      return 'tentative';
    }
    return 'archived';
  };

  const getSource = async (
    id: string
  ): Promise<{ id: string; source: CortexKiSource } | undefined> => {
    try {
      const response = await esClient.get<CortexKiSource>({
        index: destValue,
        id,
      });
      if (!response.found || response._source === undefined) {
        return undefined;
      }
      return { id: response._id, source: response._source };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;
      if (statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  };

  return {
    async list({ status, entityType } = {}) {
      const allPages = await listAll();
      const pages = allPages.filter((page) => {
        if (status !== undefined && page.status !== status) {
          return false;
        }
        if (entityType !== undefined && page.entity_type !== entityType) {
          return false;
        }
        return true;
      });

      return { pages, stats: buildStats(allPages) };
    },

    async get(id) {
      const found = await getSource(id);
      if (found) {
        return toPage(found.id, found.source);
      }

      for (const entityType of CORTEX_ENTITY_TYPES) {
        if (!id.startsWith(`cortex_${entityType}_`)) {
          continue;
        }
        const canonicalId = canonicalCortexId(entityType, id);
        if (canonicalId === id) {
          return undefined;
        }
        const redirected = await getSource(canonicalId);
        return redirected ? toPage(redirected.id, redirected.source) : undefined;
      }
      return undefined;
    },

    async upsert({ entityType, slug, title, description, content, status, corroborations }) {
      const canonicalSlug = canonicalizeSlug(entityType, slug);
      const id = toCortexKiId(entityType, canonicalSlug);
      const existing = await getSource(id);
      const nextCorroborations =
        corroborations ?? toCorroborations(existing?.source.attributes?.corroborations);
      const now = new Date().toISOString();
      const document: CortexKiSource = {
        '@timestamp': now,
        type: entityType,
        title,
        ...(description !== undefined ? { description } : {}),
        content,
        tags: [CORTEX_TAG, entityType],
        attributes: {
          status,
          corroborations: nextCorroborations,
          slug: canonicalSlug,
        },
      };

      await esClient.index({
        index: destValue,
        id,
        document,
        refresh: 'wait_for',
      });

      logger.debug(`Upserted Cortex page ${id}`);

      const page = toPage(id, document);
      if (!page) {
        throw new Error(`Failed to normalize Cortex page ${id}`);
      }
      return page;
    },

    async corroborate(id) {
      const found = await getSource(id);
      if (!found) {
        return undefined;
      }
      const page = toPage(found.id, found.source);
      if (!page) {
        return undefined;
      }
      return this.upsert({
        entityType: page.entity_type,
        slug: page.slug,
        title: page.title,
        description: page.description,
        content: page.content,
        status: page.status === 'archived' ? 'established' : page.status,
        corroborations: page.corroborations + 1,
      });
    },

    async archive(id) {
      const found = await getSource(id);
      if (!found) {
        return undefined;
      }
      const page = toPage(found.id, found.source);
      if (!page) {
        return undefined;
      }
      return this.upsert({
        entityType: page.entity_type,
        slug: page.slug,
        title: page.title,
        description: page.description,
        content: page.content,
        status: 'archived',
        corroborations: page.corroborations,
      });
    },

    async pruneDuplicates() {
      const rawPages = await listAllRaw();
      const groups = new Map<string, CortexPageSummary[]>();
      for (const page of rawPages) {
        const key = canonicalCortexId(page.entity_type, page.id);
        const group = groups.get(key) ?? [];
        group.push(page);
        groups.set(key, group);
      }

      let removed = 0;
      for (const [canonicalId, group] of groups) {
        const extras = group.filter((page) => page.id !== canonicalId);
        if (extras.length === 0 && group[0].id === canonicalId) {
          continue;
        }

        const newest = group.slice().sort((left, right) => {
          return left.updated_at < right.updated_at ? 1 : -1;
        })[0];
        const newestPage = await this.get(newest.id);
        if (!newestPage) {
          continue;
        }

        const canonicalSlug = canonicalizeSlug(
          newestPage.entity_type,
          slugFromCortexId(canonicalId, newestPage.entity_type)
        );
        await this.upsert({
          entityType: newestPage.entity_type,
          slug: canonicalSlug,
          title: newestPage.title,
          description: newestPage.description,
          content: newestPage.content,
          status: preferredStatus(group),
          corroborations: Math.max(...group.map((page) => page.corroborations)),
        });

        for (const extra of extras) {
          await esClient.delete({
            index: destValue,
            id: extra.id,
            refresh: 'wait_for',
          });
          removed += 1;
        }

        logger.info(`Pruned ${extras.length} duplicate Cortex page(s) into ${canonicalId}`);
      }

      return removed;
    },
  };
};
