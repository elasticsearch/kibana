/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type {
  QueryDslQueryContainer,
  RetrieverContainer,
} from '@elastic/elasticsearch/lib/api/types';
import { badRequest, notFound } from '@hapi/boom';
import { DataStreamClient } from '@kbn/data-streams';
import type { IDataStreamClient } from '@kbn/data-streams';
import { createMemoryHistoryStorage } from './history_storage';
import { memoriesDataStream, type memoriesMappings, type StoredMemoryPage } from './data_stream';
import { MEMORIES_DATA_STREAM } from '../../../common/constants';
import { resolveSearchMode, type SearchMode } from '../../../common/queries';
import { DEFAULT_SIG_EVENTS_TUNING_CONFIG } from '../../../common/sig_events_tuning_config';
import { bulkCreateWithInferenceFallback } from '../streams/ki/knowledge_indicator_client/bulk_with_inference_fallback';
import type {
  MemoryEntry,
  MemoryVersionRecord,
  MemoryChangeType,
  MemoryCategoryNode,
  MemorySearchResult,
  CreateMemoryParams,
  UpdateMemoryParams,
  SearchMemoryParams,
  MemoryService,
} from './types';

const isIndexNotFoundError = (err: unknown): boolean => {
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (statusCode === 404) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('index_not_found_exception');
};

type MemoryCollapseField = 'name' | 'id';

/** Upper bound on distinct pages resolved in a single search (Elasticsearch's default max result window). */
const MAX_PAGES = 10000;

/**
 * MemoryServiceImpl backed by two append-only data streams:
 *   - .significant_events-memories  (pages, latest version resolved via field collapse)
 *   - .significant_events-memory-history  (version history, append-only)
 *
 * Pages are written by indexing a new document with the current @timestamp.
 * Lookups by name collapse on `name`; lookups and listings by logical page collapse on `id`.
 * Tombstones bump `version` and set `is_deleted: true`; reads filter those out after collapse.
 */
export class MemoryServiceImpl implements MemoryService {
  private readonly esClient: ElasticsearchClient;
  private readonly dataStreamClient: IDataStreamClient<typeof memoriesMappings, StoredMemoryPage>;
  private readonly historyStorage: ReturnType<typeof createMemoryHistoryStorage>;
  private readonly logger: Logger;

  constructor({ logger, esClient }: { logger: Logger; esClient: ElasticsearchClient }) {
    this.logger = logger;
    this.esClient = esClient;
    this.dataStreamClient = DataStreamClient.fromDefinition<
      typeof memoriesMappings,
      StoredMemoryPage
    >({
      dataStream: memoriesDataStream,
      elasticsearchClient: esClient,
    });
    this.historyStorage = createMemoryHistoryStorage({ esClient });
  }

  // ── Write helpers ──

  /**
   * Append a page document to the memory data stream.
   *
   * Writes go through the shared {@link DataStreamClient} (space-agnostic — memory is global)
   * with `refresh: 'wait_for'` so the document is searchable as soon as this resolves. This
   * gives read-your-writes consistency for the interactive CRUD flows that read straight back.
   *
   * Used for both live pages and tombstones: the only difference is the `is_deleted` flag on the
   * entry, defaulting to `false` for live writes.
   */
  private async _indexPage(entry: MemoryEntry): Promise<void> {
    await bulkCreateWithInferenceFallback(this.logger, ({ includeEmbedding }) => {
      const document: StoredMemoryPage = {
        '@timestamp': entry.updated_at,
        id: entry.id,
        name: entry.name,
        title: entry.title,
        content: entry.content,
        // Populate search_embedding for live pages so semantic/hybrid search can rank them.
        // Omit it on tombstones (no value in embedding a soft-delete marker) and on the
        // final fallback attempt when the inference endpoint is unavailable.
        ...(includeEmbedding &&
          !entry.is_deleted && {
            search_embedding: `${entry.title}\n\n${entry.content}`,
          }),
        categories: entry.categories,
        tags: entry.tags,
        references: entry.references,
        version: entry.version,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        created_by: entry.created_by,
        updated_by: entry.updated_by,
        is_deleted: entry.is_deleted ?? false,
      };
      return this.dataStreamClient.create({ documents: [document], refresh: 'wait_for' });
    });
  }

  // ── Reads: field collapse to resolve latest version ──

  /**
   * Resolve the latest document per `collapseField` group for the docs matching `query`.
   *
   * IMPORTANT: field collapse is applied AFTER the query, so this only returns the latest version
   * *among the documents that match the filter*. It is therefore only safe to filter on INVARIANT
   * fields (`id`, `name`). Filtering on a mutable field (e.g. `categories`, `references`) can return
   * a stale older version whose current latest no longer matches — callers that need to filter on
   * mutable fields must resolve the true latest separately (see {@link _resolveLatestByIds}).
   */
  private async _searchLatest({
    query,
    collapseField,
    size = 1,
  }: {
    query: QueryDslQueryContainer;
    collapseField: MemoryCollapseField;
    size?: number;
  }): Promise<Array<{ _id: string; _source: MemoryEntry }>> {
    try {
      const response = await this.esClient.search<MemoryEntry>({
        index: MEMORIES_DATA_STREAM,
        track_total_hits: false,
        size,
        query,
        collapse: { field: collapseField },
        sort: [{ version: { order: 'desc' } }, { updated_at: { order: 'desc' } }],
      });
      return response.hits.hits.flatMap((hit) =>
        typeof hit._id === 'string' && hit._source ? [{ _id: hit._id, _source: hit._source }] : []
      );
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
  }

  /**
   * Append a soft-delete tombstone for an entry: a copy with `is_deleted: true` and a bumped
   * version so field collapse resolves it as the latest document over the live one. Returns the
   * tombstone that was written.
   */
  private async _indexTombstone(
    entry: MemoryEntry,
    { user, now }: { user: string; now: string }
  ): Promise<MemoryEntry> {
    const tombstone: MemoryEntry = {
      ...entry,
      version: entry.version + 1,
      updated_at: now,
      updated_by: user,
      is_deleted: true,
    };
    await this._indexPage(tombstone);
    return tombstone;
  }

  private async _getCollapsedByName(name: string): Promise<MemoryEntry | undefined> {
    const hits = await this._searchLatest({
      query: { bool: { filter: [{ term: { name } }] } },
      collapseField: 'name',
    });
    return hits[0]?._source;
  }

  private async _getByName(name: string): Promise<MemoryEntry | undefined> {
    const entry = await this._getCollapsedByName(name);
    return entry?.is_deleted !== true ? entry : undefined;
  }

  private async _getById(id: string): Promise<MemoryEntry | undefined> {
    const hits = await this._searchLatest({
      query: { bool: { filter: [{ term: { id } }] } },
      collapseField: 'id',
    });
    const entry = hits[0]?._source;
    return entry?.is_deleted !== true ? entry : undefined;
  }

  /**
   * Phase one of a mutable-field read: collect the distinct page ids of documents matching `query`,
   * without fetching `_source` (only the `id` field). The matched versions may be stale, so callers
   * must re-resolve the current latest via {@link _resolveLatestByIds}.
   */
  private async _collectCandidateIds(query: QueryDslQueryContainer): Promise<string[]> {
    try {
      const response = await this.esClient.search({
        index: MEMORIES_DATA_STREAM,
        track_total_hits: false,
        size: MAX_PAGES,
        query,
        collapse: { field: 'id' },
        _source: false,
        fields: ['id'],
      });
      return response.hits.hits
        .map((hit) => hit.fields?.id?.[0])
        .filter((id): id is string => typeof id === 'string');
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
  }

  /**
   * Resolve the current latest version of each given page id (filtering on `id` is safe — it is
   * invariant), dropping any that are tombstoned. Used as phase two of reads that match on mutable
   * fields, so callers see each page's true latest state rather than the version that matched.
   */
  private async _resolveLatestByIds(
    ids: string[]
  ): Promise<Array<{ _id: string; _source: MemoryEntry }>> {
    if (ids.length === 0) return [];
    const hits = await this._searchLatest({
      query: { bool: { filter: [{ terms: { id: ids } }] } },
      collapseField: 'id',
      size: ids.length,
    });
    return hits.filter((hit) => hit._source.is_deleted !== true);
  }

  // ── Public API ──

  async create(params: CreateMemoryParams): Promise<MemoryEntry> {
    const { name, title, content, categories = [], references = [], tags = [], user } = params;

    const existing = await this._getByName(name);
    if (existing) {
      throw badRequest(`Memory entry with name '${name}' already exists`);
    }

    const now = new Date().toISOString();
    const tombstone = await this._getCollapsedByName(name);
    if (tombstone?.is_deleted === true) {
      const restored: MemoryEntry = {
        id: tombstone.id,
        name,
        title,
        content,
        categories,
        references,
        tags,
        version: tombstone.version + 1,
        created_at: tombstone.created_at,
        updated_at: now,
        created_by: tombstone.created_by,
        updated_by: user,
      };
      await this._indexPage(restored);
      await this._writeHistory(restored, 'create', `Restored entry "${name}"`, user);
      return restored;
    }

    const entry: MemoryEntry = {
      id: uuidV4(),
      name,
      title,
      content,
      categories,
      references,
      version: 1,
      tags,
      created_at: now,
      updated_at: now,
      created_by: user,
      updated_by: user,
    };

    await this._indexPage(entry);
    await this._writeHistory(entry, 'create', `Created entry "${name}"`, user);
    return entry;
  }

  async get({ id }: { id: string }): Promise<MemoryEntry> {
    const entry = await this._getById(id);
    if (!entry) throw notFound(`Memory entry with id '${id}' not found`);
    return entry;
  }

  async getByName({ name }: { name: string }): Promise<MemoryEntry | undefined> {
    return this._getByName(name);
  }

  async update(params: UpdateMemoryParams): Promise<MemoryEntry> {
    const { id, user, changeSummary } = params;
    const current = await this._getById(id);
    if (!current) throw notFound(`Memory entry with id '${id}' not found`);

    const newName = params.name;
    const isRename = newName !== undefined && newName !== current.name;
    if (isRename) {
      const existingWithName = await this._getByName(newName);
      if (existingWithName) {
        throw badRequest(`Memory entry with name '${newName}' already exists`);
      }
    }

    const now = new Date().toISOString();
    let nextVersion = current.version + 1;

    if (isRename) {
      // Tombstone the old name (sharing `now` with the new version below — one rename operation).
      await this._indexTombstone(current, { user, now });
      nextVersion = current.version + 2;
    }

    const updated: MemoryEntry = {
      ...current,
      ...(params.content !== undefined && { content: params.content }),
      ...(params.title !== undefined && { title: params.title }),
      ...(params.name !== undefined && { name: params.name }),
      ...(params.categories !== undefined && { categories: params.categories }),
      ...(params.references !== undefined && { references: params.references }),
      ...(params.tags !== undefined && { tags: params.tags }),
      version: nextVersion,
      updated_at: now,
      updated_by: user,
    };

    await this._indexPage(updated);

    const changeType: MemoryChangeType = isRename ? 'rename' : 'update';
    await this._writeHistory(
      updated,
      changeType,
      changeSummary ?? `Updated entry "${updated.name}"`,
      user
    );
    return updated;
  }

  async delete({ id, user }: { id: string; user: string }): Promise<void> {
    const current = await this._getById(id);
    if (!current) throw notFound(`Memory entry with id '${id}' not found`);

    const now = new Date().toISOString();
    const tombstone = await this._indexTombstone(current, { user, now });
    await this._writeHistory(tombstone, 'delete', `Deleted entry "${current.name}"`, user);
  }

  async rename({
    id,
    newName,
    user,
  }: {
    id: string;
    newName: string;
    user: string;
  }): Promise<MemoryEntry> {
    const current = await this._getById(id);
    if (!current) throw notFound(`Memory entry with id '${id}' not found`);
    const existing = await this._getByName(newName);
    if (existing && existing.id !== id) {
      throw badRequest(`Memory entry with name '${newName}' already exists`);
    }
    const oldName = current.name;
    return this.update({
      id,
      name: newName,
      user,
      changeSummary: `Renamed from "${oldName}" to "${newName}"`,
    });
  }

  // ── Categories ──

  async addCategory({
    id,
    category,
    user,
  }: {
    id: string;
    category: string;
    user: string;
  }): Promise<MemoryEntry> {
    return this._updateCategories({
      id,
      user,
      transform: (cats) => (cats.includes(category) ? null : [...cats, category]),
      changeSummary: `Added category "${category}"`,
    });
  }

  async removeCategory({
    id,
    category,
    user,
  }: {
    id: string;
    category: string;
    user: string;
  }): Promise<MemoryEntry> {
    return this._updateCategories({
      id,
      user,
      transform: (cats) => (cats.includes(category) ? cats.filter((c) => c !== category) : null),
      changeSummary: `Removed category "${category}"`,
    });
  }

  private async _updateCategories({
    id,
    user,
    transform,
    changeSummary,
  }: {
    id: string;
    user: string;
    transform: (categories: string[]) => string[] | null;
    changeSummary: string;
  }): Promise<MemoryEntry> {
    const current = await this._getById(id);
    if (!current) throw notFound(`Memory entry with id '${id}' not found`);

    const newCategories = transform(current.categories);
    if (newCategories === null) return current;

    const now = new Date().toISOString();
    const updated: MemoryEntry = {
      ...current,
      categories: newCategories,
      version: current.version + 1,
      updated_at: now,
      updated_by: user,
    };
    await this._indexPage(updated);
    await this._writeHistory(updated, 'update', changeSummary, user);
    return updated;
  }

  async listCategories(): Promise<string[]> {
    const entries = await this.listAll();
    const categorySet = new Set<string>();
    for (const entry of entries) {
      for (const cat of entry.categories) categorySet.add(cat);
    }
    return Array.from(categorySet).sort();
  }

  async getCategoryTree(): Promise<MemoryCategoryNode[]> {
    return buildCategoryTree(await this.listAll());
  }

  // ── References ──

  async getBacklinks({ id }: { id: string }): Promise<MemoryEntry[]> {
    // `references` is mutable, so a one-shot collapsed search can surface a stale version that
    // referenced `id`. Phase 1: gather candidate page ids. Phase 2: resolve their current latest
    // versions and keep only those that STILL reference `id`.
    const candidateIds = await this._collectCandidateIds({
      bool: { filter: [{ term: { references: id } }] },
    });
    const latest = await this._resolveLatestByIds(candidateIds);
    return latest.map((hit) => hit._source).filter((entry) => entry.references.includes(id));
  }

  // ── Search & browse ──

  async search(params: SearchMemoryParams): Promise<MemorySearchResult[]> {
    const { query, tags, categories, references, size = 10 } = params;
    const mode = resolveSearchMode(params.mode);
    const escapedQuery = query.toLowerCase().replace(/[\\*?]/g, '\\$&');

    const structuredFilters: QueryDslQueryContainer[] = [];
    if (tags?.length) structuredFilters.push({ terms: { tags } });
    if (categories?.length) structuredFilters.push({ terms: { categories } });
    if (references?.length) structuredFilters.push({ terms: { references } });

    const fuzzyMatch: QueryDslQueryContainer = {
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: ['title^3', 'content'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          { wildcard: { name: { value: `*${escapedQuery}*`, boost: 2 } } },
          { wildcard: { categories: { value: `*${escapedQuery}*`, boost: 2 } } },
          { wildcard: { tags: { value: `*${escapedQuery}*`, boost: 2 } } },
        ],
        minimum_should_match: 1,
      },
    };

    // Phase 1: collect the id of every page that might be relevant (ids only, cheap).
    // For keyword mode: narrow by the text query so the candidate set stays small.
    // For semantic/hybrid: use only structural filters (or match_all) so Phase 3's
    // retriever handles text relevance — a keyword-only Phase 1 would silently drop
    // pages that are semantically relevant but don't keyword-match any version.
    const phase1Query: QueryDslQueryContainer =
      mode === 'keyword'
        ? { bool: { filter: structuredFilters, must: [fuzzyMatch] } }
        : {
            bool: structuredFilters.length
              ? { filter: structuredFilters }
              : { must: [{ match_all: {} }] },
          };

    let candidateIds: string[];
    try {
      const candidateResponse = await this.esClient.search({
        index: MEMORIES_DATA_STREAM,
        track_total_hits: false,
        collapse: { field: 'id' },
        query: phase1Query,
        size: MAX_PAGES,
        _source: false,
        fields: ['id'],
      });
      candidateIds = candidateResponse.hits.hits
        .map((hit) => hit.fields?.id?.[0])
        .filter((id): id is string => typeof id === 'string');
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
    if (candidateIds.length === 0) return [];

    // Phase 2: resolve each candidate page's current latest version (filtering on `id` is
    // invariant-safe) and keep the Elasticsearch `_id` of those that are still live.
    const latestLiveIds = (await this._resolveLatestByIds(candidateIds)).map((hit) => hit._id);
    if (latestLiveIds.length === 0) return [];

    // Phase 3: re-run against ONLY the latest live documents so a result can only come from
    // a page whose current version satisfies both the structural filters and the text query.
    // Semantic and hybrid modes use a retriever instead of a plain query so ES can apply
    // vector scoring; keyword mode keeps the original bool query path.
    const response = await this._executePhase3(
      mode,
      params.mode,
      query,
      latestLiveIds,
      structuredFilters,
      fuzzyMatch,
      size
    );
    if (!response) return [];

    return response.hits.hits.flatMap((hit) => {
      const source = hit._source;
      if (!source) return [];
      return [
        {
          id: source.id,
          name: source.name,
          title: source.title,
          snippet: hit.highlight?.content?.[0] ?? source.content.substring(0, 200),
          score: hit._score ?? 0,
          updated_at: source.updated_at,
          updated_by: source.updated_by,
          tags: source.tags ?? [],
          categories: source.categories ?? [],
        },
      ];
    });
  }

  private async _executePhase3(
    mode: SearchMode,
    requestedMode: SearchMode | undefined,
    query: string,
    latestLiveIds: string[],
    structuredFilters: QueryDslQueryContainer[],
    fuzzyMatch: QueryDslQueryContainer,
    size: number
  ) {
    const { semantic_min_score: minScore, rrf_rank_constant: rankConstant } =
      DEFAULT_SIG_EVENTS_TUNING_CONFIG;
    const idsFilter: QueryDslQueryContainer = { ids: { values: latestLiveIds } };
    const allFilters = [idsFilter, ...structuredFilters];

    let retriever: RetrieverContainer | undefined;

    if (mode === 'semantic') {
      retriever = {
        linear: {
          retrievers: [
            {
              retriever: {
                standard: {
                  query: { match: { search_embedding: query } },
                  filter: { bool: { filter: allFilters } },
                },
              },
              weight: 1,
              normalizer: 'minmax',
            },
          ],
          rank_window_size: size,
          min_score: minScore,
        },
      };
    } else if (mode === 'hybrid') {
      retriever = {
        rrf: {
          retrievers: [
            {
              standard: {
                query: { bool: { must: [fuzzyMatch] } },
              },
            },
            {
              linear: {
                retrievers: [
                  {
                    retriever: {
                      standard: {
                        query: { match: { search_embedding: query } },
                      },
                    },
                    weight: 1,
                    normalizer: 'minmax',
                  },
                ],
                rank_window_size: size,
                min_score: minScore,
              },
            },
          ],
          filter: { bool: { filter: allFilters } },
          rank_window_size: size,
          rank_constant: rankConstant,
        },
      };
    }

    try {
      if (retriever) {
        return await this.esClient.search<MemoryEntry>({
          index: MEMORIES_DATA_STREAM,
          track_total_hits: false,
          retriever,
          size,
          highlight: {
            fields: { content: { fragment_size: 200, number_of_fragments: 1 }, title: {} },
          },
        });
      }

      // keyword mode: plain bool query, no retriever
      return await this.esClient.search<MemoryEntry>({
        index: MEMORIES_DATA_STREAM,
        track_total_hits: false,
        query: { bool: { filter: allFilters, must: [fuzzyMatch] } },
        sort: [{ _score: { order: 'desc' } }],
        size,
        highlight: {
          fields: { content: { fragment_size: 200, number_of_fragments: 1 }, title: {} },
        },
      });
    } catch (err) {
      if (mode !== 'keyword' && !requestedMode) {
        // Auto-resolved mode failed (inference endpoint unavailable) — fall back to keyword.
        this.logger.warn(
          `Memory search mode "${mode}" failed, falling back to keyword: ${(err as Error).message}`
        );
        return this.esClient.search<MemoryEntry>({
          index: MEMORIES_DATA_STREAM,
          track_total_hits: false,
          query: { bool: { filter: allFilters, must: [fuzzyMatch] } },
          sort: [{ _score: { order: 'desc' } }],
          size,
          highlight: {
            fields: { content: { fragment_size: 200, number_of_fragments: 1 }, title: {} },
          },
        });
      }
      if (isIndexNotFoundError(err)) return null;
      throw err;
    }
  }

  async listAll(): Promise<MemoryEntry[]> {
    try {
      // `hits.total` counts pre-collapse documents (every version of every page), so it can't tell
      // us how many distinct pages exist. Instead, detect truncation from the number of collapsed
      // hits returned: hitting `MAX_PAGES` distinct pages means there may be more we didn't fetch.
      const response = await this.esClient.search<MemoryEntry>({
        index: MEMORIES_DATA_STREAM,
        track_total_hits: false,
        query: { match_all: {} },
        collapse: { field: 'id' },
        sort: [{ version: { order: 'desc' } }, { updated_at: { order: 'desc' } }],
        size: MAX_PAGES,
      });

      const hits = response.hits.hits;
      const entries = hits
        .map((hit) => hit._source)
        .filter(
          (source): source is MemoryEntry => source !== undefined && source.is_deleted !== true
        );

      // We only hit a wall if the search filled the entire window — then distinct pages beyond
      // `MAX_PAGES` were silently dropped. Tombstoned pages count toward the window too, so report
      // both the fetched and live counts to make the truncation actionable.
      if (hits.length === MAX_PAGES) {
        this.logger.warn(
          `Memory listAll: hit the ${MAX_PAGES}-page fetch limit (${entries.length} live); pages beyond the limit are not returned`
        );
      }

      return entries;
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
  }

  async listByCategory({ category }: { category: string }): Promise<MemoryEntry[]> {
    // `categories` is mutable, so a one-shot collapsed search can surface a stale version that had
    // the category. Phase 1: gather candidate page ids. Phase 2: resolve their current latest
    // versions and keep only those that STILL belong to `category`.
    const candidateIds = await this._collectCandidateIds({
      bool: { filter: [{ term: { categories: category } }] },
    });
    const latest = await this._resolveLatestByIds(candidateIds);
    return latest.map((hit) => hit._source).filter((entry) => entry.categories.includes(category));
  }

  // ── History ──

  async getHistory({
    entryId,
    size = 50,
  }: {
    entryId: string;
    size?: number;
  }): Promise<MemoryVersionRecord[]> {
    try {
      const response = await this.historyStorage.getClient().search({
        track_total_hits: false,
        query: { bool: { filter: [{ term: { entry_id: entryId } }] } },
        size,
        sort: [{ version: { order: 'desc' } }],
      });
      return response.hits.hits.map((h) => h._source);
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
  }

  async getVersion({
    entryId,
    version,
  }: {
    entryId: string;
    version: number;
  }): Promise<MemoryVersionRecord> {
    try {
      const response = await this.historyStorage.getClient().search({
        track_total_hits: false,
        query: { bool: { filter: [{ term: { entry_id: entryId } }, { term: { version } }] } },
        size: 1,
        terminate_after: 1,
      });
      if (response.hits.hits.length === 0) {
        throw notFound(`Version ${version} not found for entry '${entryId}'`);
      }
      return response.hits.hits[0]._source;
    } catch (err) {
      if (isIndexNotFoundError(err)) {
        throw notFound(`Version ${version} not found for entry '${entryId}'`);
      }
      throw err;
    }
  }

  async getRecentChanges({ size = 20 }: { size?: number } = {}): Promise<MemoryVersionRecord[]> {
    try {
      const response = await this.historyStorage.getClient().search({
        track_total_hits: false,
        query: { match_all: {} },
        size,
        sort: [{ created_at: { order: 'desc' } }],
      });
      return response.hits.hits.map((h) => h._source);
    } catch (err) {
      if (isIndexNotFoundError(err)) return [];
      throw err;
    }
  }

  // ── Private helpers ──

  private async _writeHistory(
    entry: MemoryEntry,
    changeType: MemoryChangeType,
    changeSummary: string,
    user: string
  ): Promise<void> {
    const record: MemoryVersionRecord = {
      id: uuidV4(),
      entry_id: entry.id,
      version: entry.version,
      name: entry.name,
      title: entry.title,
      content: entry.content,
      change_type: changeType,
      change_summary: changeSummary,
      created_at: entry.updated_at,
      created_by: user,
    };
    await this.historyStorage.getClient().index({ document: record });
  }
}

/**
 * Build a category tree from all memory entries.
 * Categories use "/" as separator for hierarchy (e.g. "streams/logs-otel").
 */
const buildCategoryTree = (entries: MemoryEntry[]): MemoryCategoryNode[] => {
  const nodeMap = new Map<string, MemoryCategoryNode>();

  const getOrCreateNode = (category: string): MemoryCategoryNode => {
    const existing = nodeMap.get(category);
    if (existing) return existing;

    const parts = category.split('/');
    const node: MemoryCategoryNode = {
      name: parts[parts.length - 1],
      category,
      pages: [],
      children: [],
    };
    nodeMap.set(category, node);

    if (parts.length > 1) {
      const parentCategory = parts.slice(0, -1).join('/');
      const parent = getOrCreateNode(parentCategory);
      if (!parent.children.some((c) => c.category === category)) {
        parent.children.push(node);
      }
    }
    return node;
  };

  for (const entry of entries) {
    for (const category of entry.categories) {
      const node = getOrCreateNode(category);
      node.pages.push({ id: entry.id, name: entry.name, title: entry.title });
    }
  }

  const roots: MemoryCategoryNode[] = [];
  for (const [category, node] of nodeMap) {
    if (!category.includes('/')) roots.push(node);
  }

  const sortNodes = (nodes: MemoryCategoryNode[]) => {
    nodes.sort((a, b) => a.category.localeCompare(b.category));
    for (const node of nodes) {
      node.pages.sort((a, b) => a.name.localeCompare(b.name));
      sortNodes(node.children);
    }
  };
  sortNodes(roots);
  return roots;
};
