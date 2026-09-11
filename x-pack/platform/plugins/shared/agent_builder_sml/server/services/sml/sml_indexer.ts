/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import type { SmlTypeRegistry } from './sml_type_registry';
import type {
  SmlContext,
  SmlDocument,
  SmlEntry,
  SmlDeleteScope,
  SmlIngestionMethod,
  SmlIndexerParams,
  SmlIndexerDeleteAttachmentParams,
  SmlPermissionsInput,
  SmlTypeDefinition,
} from './types';

import { createSmlStorage, smlIndexName } from './sml_storage';
import { isNotFoundError } from './sml_service';
import { SmlUnregisteredTypeError } from './sml_errors';

interface SmlIndexerDeps {
  registry: SmlTypeRegistry;
  logger: Logger;
  ensureDefaultAiIndex?: (spaceId: string) => Promise<void>;
}

export interface SmlIndexer {
  /**
   * Index, update, or delete SML data for a specific item.
   *
   * The indexer resolves the type's `getSmlEntry` hook and writes the
   * produced entry tagged `ingestion_method: 'crawled'`. If an existing
   * entry for this `origin_id` carries `ingestion_method: 'manual'`, the
   * call is a no-op unless `force: true` is passed.
   *
   * Unregistered types throw {@link SmlUnregisteredTypeError} — there is
   * no `getSmlEntry` to call and no sensible fallback.
   *
   * **`getPermissions` failures fail-closed.** When the registered type's
   * `getPermissions` hook throws, the call is aborted *before* any
   * mutation (the existing entry remains intact) and the throw is propagated
   * to the caller. Stamping an empty action list instead would be fail-open:
   * the read path treats a `count: 0` element as requiring nothing, i.e. public
   * within its spaces. See `resolvePermissionsForOrigin` for the full rationale.
   *
   * For `action: 'delete'`, only an entry with `ingestion_method: 'crawled'` is
   * removed — a manual entry for the same `origin_id` is preserved. This keeps
   * curated content around even when the upstream object goes away (e.g.
   * transient blip, or a curator pinning standalone context to a deleted
   * dashboard). Callers that need to wipe a `'manual'` or `'all'` entry should
   * use {@link SmlIndexer.deleteAttachment} instead. **Delete is intentionally
   * permissive about registration** — cleanup must keep working even when the
   * plugin that originally registered the type is disabled, or a stale entry
   * becomes unreachable from every write path.
   */
  indexAttachment: (params: SmlIndexerParams) => Promise<void>;

  /**
   * Delete the entry for an origin, with explicit control over which ingestion
   * method(s) are removed.
   *
   * The default scope (`'crawled'`) matches `indexAttachment({ action: 'delete' })`
   * for back-compat with the crawler and event-driven CRUD callers; pass
   * `'manual'` to wipe curated entries only, or `'all'` to fully retire the
   * origin (used by workflow steps that "own" their origin).
   */
  deleteAttachment: (params: SmlIndexerDeleteAttachmentParams) => Promise<void>;

  /**
   * Delete the entry for a given `origin_id` from the SML index.
   *
   * When `ingestionMethod` is set, only documents with that method are removed;
   * otherwise all documents for the origin are removed regardless of method.
   *
   * When `spaces` is set, only documents whose `spaces` array contains at least
   * one of the listed space IDs are removed. Omit for global deletes (e.g.
   * crawler origin-mode rewrites where the caller controls all spaces).
   *
   * Exposed on the indexer so internal callers can run a "delete crawled
   * entry, keep manual" cleanup after writing a manual entry without
   * duplicating the index/error-handling boilerplate. The public write
   * paths (HTTP routes, workflow step, event-driven CRUD) should use
   * `indexAttachment` / `deleteAttachment` instead.
   */
  deleteEntry: (params: {
    originUri: string;
    esClient: ElasticsearchClient;
    ingestionMethod?: SmlIngestionMethod;
    spaces?: string[];
  }) => Promise<void>;
}

const withNamespace = (
  client: SavedObjectsClientContract,
  namespace: string
): SavedObjectsClientContract => {
  const wrapped = Object.create(client) as SavedObjectsClientContract;
  wrapped.get = (type, id, opts) => client.get(type, id, { ...opts, namespace });
  wrapped.bulkGet = (objects, opts) =>
    client.bulkGet(
      objects.map(({ namespaces: _namespaces, ...object }) => object),
      { ...opts, namespace }
    );
  wrapped.resolve = (type, id, opts) => client.resolve(type, id, { ...opts, namespace });
  wrapped.bulkResolve = (objects, opts) => client.bulkResolve(objects, { ...opts, namespace });
  return wrapped;
};

const namespaceForSpaces = (spaces: string[]): string | undefined => {
  const [firstSpace] = spaces;
  return !firstSpace || firstSpace === 'default' || firstSpace === '*' ? undefined : firstSpace;
};

export const createSmlIndexer = ({
  registry,
  logger,
  ensureDefaultAiIndex,
}: SmlIndexerDeps): SmlIndexer => {
  return new SmlIndexerImpl({ registry, logger, ensureDefaultAiIndex });
};

class SmlIndexerImpl implements SmlIndexer {
  private readonly registry: SmlTypeRegistry;
  private readonly logger: Logger;
  private readonly ensureDefaultAiIndex?: (spaceId: string) => Promise<void>;
  private readonly ensuredSpaces = new Set<string>();

  constructor({ registry, logger, ensureDefaultAiIndex }: SmlIndexerDeps) {
    this.registry = registry;
    this.logger = logger;
    this.ensureDefaultAiIndex = ensureDefaultAiIndex;
  }

  async indexAttachment(params: SmlIndexerParams): Promise<void> {
    const {
      originId,
      attachmentType,
      action,
      spaces,
      esClient,
      savedObjectsClient,
      logger: contextLogger,
      clientHasSpacesExtension = false,
    } = params;
    const originUri = `${attachmentType}://${originId}`;

    this.logger.info(
      `SML indexer: indexAttachment called — originId='${originId}', type='${attachmentType}', action='${action}', spaces=[${spaces.join(
        ', '
      )}]`
    );

    if (action === 'delete') {
      this.logger.info(
        `SML indexer: deleting crawled entry for origin '${originId}' (manual entries preserved)`
      );
      await this.deleteEntry({ originUri, esClient, ingestionMethod: 'crawled' });
      return;
    }

    const definition = this.registry.get(attachmentType);
    if (!definition) {
      // Unregistered types throw (fail-closed). Delete still proceeds —
      // see the early `action === 'delete'` branch above.
      throw new SmlUnregisteredTypeError(
        `SML indexer: type definition '${attachmentType}' is not registered — cannot index origin '${originId}'. Registered types: [${this.registry
          .list()
          .map((t) => t.id)
          .join(', ')}]`
      );
    }

    const force = params.force === true;
    if (!force) {
      const hasManual = await this.hasManualEntry({ originUri, esClient });
      if (hasManual) {
        this.logger.debug(
          `SML indexer: skipping origin-mode index for '${originId}' (type='${attachmentType}') — manual entry exists. Pass force=true to override.`
        );
        return;
      }
    }

    // Internal repos need an explicit namespace to access non-default spaces
    const internalNamespace = clientHasSpacesExtension ? undefined : namespaceForSpaces(spaces);
    const wrappedClient = internalNamespace
      ? withNamespace(savedObjectsClient as SavedObjectsClientContract, internalNamespace)
      : (savedObjectsClient as SavedObjectsClientContract);

    const context: SmlContext = {
      esClient,
      savedObjectsClient: wrappedClient,
      logger: contextLogger,
    };

    this.logger.info(
      `SML indexer: calling getSmlEntry for origin '${originId}' of type '${attachmentType}'`
    );
    const smlEntry = await definition.getSmlEntry(originId, context);
    if (!smlEntry) {
      this.logger.info(
        `SML indexer: no SML data returned for origin '${originId}' of type '${attachmentType}' — deleting existing crawled entry (manual entries preserved)`
      );
      await this.deleteEntry({ originUri, esClient, ingestionMethod: 'crawled' });
      return;
    }

    this.logger.debug(
      `SML indexer: getSmlEntry returned entry for origin '${originId}'. Title: '${
        smlEntry.title
      }', content length: ${smlEntry.content?.length ?? 0}`
    );

    // Resolve permissions BEFORE `deleteEntry` so a hook throw doesn't
    // leave the origin in a wiped state. `getPermissions(originId, ctx)`
    // is a per-origin computation (it doesn't take an entry), so one call
    // is correct.
    let resolvedPermissions: SmlPermissionsInput;
    try {
      resolvedPermissions = await this.resolvePermissionsForOrigin({
        definition,
        originId,
        context,
      });
    } catch (error) {
      // Fail-closed: log with origin/type framing and propagate. The
      // existing entry for the origin remains intact (we haven't called
      // `deleteEntry` yet). See `resolvePermissionsForOrigin` JSDoc.
      this.logger.warn(
        `SML indexer: type '${
          definition.id
        }' getPermissions threw for origin '${originId}' — aborting origin-mode write to avoid producing un-gated entry: ${
          (error as Error).message
        }`
      );
      throw error;
    }

    // An entry with no spaces produces zero nested privilege elements, which the read path
    // treats as public — so it must not be indexed. Bail out *before* the delete below, so a
    // producer that reports zero spaces skips the origin instead of wiping its existing entry.
    if (spaces.length === 0) {
      this.logger.warn(
        `SML indexer: origin '${originId}' (type='${attachmentType}') has no spaces — skipping (fail closed), existing entry left intact`
      );
      return;
    }

    if (this.ensureDefaultAiIndex) {
      const spacesToEnsure = spaces.filter(
        (space) => space !== '*' && space !== '' && !this.ensuredSpaces.has(space)
      );
      await Promise.all(
        spacesToEnsure.map(async (space) => {
          try {
            await this.ensureDefaultAiIndex!(space);
            this.ensuredSpaces.add(space);
          } catch (err) {
            this.logger.warn(
              `SML indexer: failed to ensure the default AI index in space '${space}': ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        })
      );
    }

    await this.deleteEntry({ originUri, esClient });

    const indexOp = this.buildIndexOp({
      entryId: uuidv4(),
      entry: smlEntry,
      originId,
      spaces,
      ingestionMethod: 'crawled',
      resolvedPermissions,
    });

    if (!indexOp) {
      return;
    }

    await this.executeIndexOp({ indexOp, esClient, originId });
  }

  async deleteAttachment(params: SmlIndexerDeleteAttachmentParams): Promise<void> {
    const { originId, attachmentType, esClient, spaces } = params;
    const scope: SmlDeleteScope = params.ingestionMethod ?? 'crawled';

    this.logger.info(
      `SML indexer: deleteAttachment called — originId='${originId}', type='${attachmentType}', scope='${scope}'`
    );

    await this.deleteEntry({
      originUri: `${attachmentType}://${originId}`,
      esClient,
      ...(spaces && spaces.length > 0 ? { spaces } : {}),
      ...(scope !== 'all' ? { ingestionMethod: scope } : {}),
    });
  }

  /**
   * Resolve the {@link SmlPermissions} to stamp on the entry for an
   * origin. Called **once per origin** before any ES mutation.
   *
   * - If the type's `getPermissions` hook is present, its result is used.
   * - Otherwise the action list is empty, which `buildIndexOp` stamps as a
   *   `count: 0` element per space — the type opts out of privilege gating and
   *   its entries are public within those spaces.
   */
  private async resolvePermissionsForOrigin({
    definition,
    originId,
    context,
  }: {
    definition: SmlTypeDefinition;
    originId: string;
    context: SmlContext;
  }): Promise<SmlPermissionsInput> {
    if (definition.getPermissions) {
      // Intentionally NOT wrapped in try/catch — see fail-closed note in
      // the JSDoc. Logging here is the caller's job.
      const result = await definition.getPermissions(originId, context);
      return {
        kibana: { privileges: { name: result.kibana?.privileges?.name ?? [] } },
      };
    }

    return { kibana: { privileges: { name: [] } } };
  }

  private buildIndexOp({
    entryId,
    entry,
    originId,
    spaces,
    ingestionMethod,
    resolvedPermissions,
    createdAt,
  }: {
    entryId: string;
    entry: SmlEntry;
    originId: string;
    spaces: string[];
    ingestionMethod: SmlIngestionMethod;
    resolvedPermissions: SmlPermissionsInput;
    createdAt?: string;
  }) {
    const actions = [...new Set(resolvedPermissions.kibana?.privileges?.name ?? [])].sort();

    const normalizedSpaces = spaces.includes('*') ? ['*'] : [...new Set(spaces)];
    if (normalizedSpaces.length === 0) {
      this.logger.warn(`SML indexer: entry '${entryId}' has no spaces — skipping (fail closed)`);
      return undefined;
    }

    // One nested element per space. `count` is per-space: "how many actions THIS space requires".
    // The ES-side DLS query evaluates each element independently, so a caller must satisfy a whole
    // element to see the document — matches cannot accumulate across spaces. `count: 0` (a type
    // with no `getPermissions` hook) means "requires nothing here" and the read filter admits it
    // on space scoping alone.
    const privileges = normalizedSpaces
      .slice()
      .sort()
      .map((space) => ({ space, name: actions, count: actions.length }));

    const now = new Date().toISOString();
    const document: SmlDocument = {
      id: entryId,
      type: entry.type,
      title: entry.title,
      origin: { uri: `${entry.type}://${originId}` },
      content: entry.content,
      created_at: createdAt || now,
      updated_at: now,
      permissions: { kibana: { privileges } },
      ingestion_method: ingestionMethod,
    };
    if (entry.description !== undefined) {
      document.description = entry.description;
    }
    if (entry.tags !== undefined) {
      document.tags = entry.tags;
    }
    if (entry.extended_attrs !== undefined) {
      document.extended_attrs = entry.extended_attrs;
    }
    if (entry.user_id !== undefined) {
      document.user_id = entry.user_id;
    }
    if (entry.references !== undefined) {
      document.references = entry.references;
    }
    return {
      index: {
        _id: entryId,
        document,
      },
    };
  }

  private async executeIndexOp({
    indexOp,
    esClient,
    originId,
  }: {
    indexOp: NonNullable<ReturnType<SmlIndexerImpl['buildIndexOp']>>;
    esClient: ElasticsearchClient;
    originId: string;
  }): Promise<void> {
    const storage = createSmlStorage({ logger: this.logger, esClient });
    const smlClient = storage.getClient();

    this.logger.debug(
      `SML indexer: writing entry to index '${smlIndexName}' for origin '${originId}'`
    );
    try {
      const response = await smlClient.bulk({
        refresh: 'wait_for',
        operations: [indexOp],
      });

      if (response.errors) {
        const errorItems = response.items.filter((item) => item.index?.error);
        this.logger.error(
          `SML indexer: bulk index errors for '${originId}': ${JSON.stringify(
            errorItems.slice(0, 3)
          )}`
        );
      } else {
        this.logger.debug(`SML indexer: successfully indexed entry for origin '${originId}'`);
      }
    } catch (error) {
      this.logger.error(
        `SML indexer: failed to index SML data for origin '${originId}': ${
          (error as Error).message
        }`
      );
      throw error;
    }
  }

  /**
   * Return true when the entry for this `origin_id` carries `ingestion_method: 'manual'`.
   */
  private async hasManualEntry({
    originUri,
    esClient,
  }: {
    originUri: string;
    esClient: ElasticsearchClient;
  }): Promise<boolean> {
    try {
      const response = await esClient.count({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        terminate_after: 1,
        query: {
          bool: {
            filter: [
              { term: { 'origin.uri': originUri } },
              { term: { ingestion_method: 'manual' } },
            ],
          },
        },
      });
      return (response.count ?? 0) > 0;
    } catch (error) {
      if (isNotFoundError(error)) {
        // index_not_found: no index yet, no manual entry.
        return false;
      }
      // Unexpected ES error: fail-closed — skip this crawl tick rather than risk destroying a manual entry.
      this.logger.warn(
        `SML indexer: hasManualEntry check failed for origin '${originUri}' (fail-closed): ${
          (error as Error).message
        }`
      );
      return true;
    }
  }

  /**
   * Delete SML entry for a given `origin_id`.
   *
   * When `ingestionMethod` is set, only documents with that method are removed
   * (e.g. `'crawled'` to wipe stale crawler output while preserving manual entries).
   * When omitted, all documents for the origin are removed regardless of method.
   *
   * Uses `ignore_unavailable` / `allow_no_indices` so this is safe even before
   * the index has been created.
   */
  async deleteEntry({
    originUri,
    esClient,
    ingestionMethod,
    spaces,
  }: {
    originUri: string;
    esClient: ElasticsearchClient;
    ingestionMethod?: SmlIngestionMethod;
    spaces?: string[];
  }): Promise<void> {
    const filter: Array<Record<string, unknown>> = [{ term: { 'origin.uri': originUri } }];
    if (ingestionMethod) {
      filter.push({ term: { ingestion_method: ingestionMethod } });
    }
    if (spaces && spaces.length > 0) {
      // Space scoping is a direct term match on the nested `.space` field
      filter.push({
        nested: {
          path: 'permissions.kibana.privileges',
          query: {
            terms: { 'permissions.kibana.privileges.space': [...spaces, '*'] },
          },
        },
      });
    }
    const label = ingestionMethod ? `${ingestionMethod} entry` : 'entry';

    try {
      this.logger.debug(
        `SML indexer: deleting existing ${label} for origin '${originUri}' from index '${smlIndexName}'`
      );
      const result = await esClient.deleteByQuery({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        query: { bool: { filter } },
        refresh: false,
      });
      if (result.deleted && result.deleted > 0) {
        this.logger.info(
          `SML indexer: deleted ${result.deleted} existing ${label} for origin '${originUri}'`
        );
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        this.logger.debug(
          `SML indexer: index '${smlIndexName}' not found — nothing to delete for '${originUri}'`
        );
        return;
      }
      this.logger.warn(
        `SML indexer: failed to delete ${label} for origin '${originUri}': ${
          (error as Error).message
        }`
      );
    }
  }
}
