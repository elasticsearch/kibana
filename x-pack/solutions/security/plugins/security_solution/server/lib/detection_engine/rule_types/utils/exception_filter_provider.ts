/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { buildExceptionFilter } from '@kbn/lists-plugin/server/services/exception_lists/build_exception_filter';
import type { ListPluginSetup } from '@kbn/lists-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { ExceptionListReference } from '@kbn/alerting-v2-schemas';

/**
 * TODO(alerting-v2 migration): main's redesigned alerting_v2 plugin removed the
 * `PreQueryFilterProvider` extension point. This local type mirrors the previous
 * provider contract so the implementation is preserved and ready to be re-wired
 * once the platform plugin exposes an equivalent extension API.
 */
type PreQueryFilterProvider = (args: {
  rule: { id: string; exceptions?: ExceptionListReference[] };
  request: KibanaRequest;
}) => Promise<unknown | null>;

interface CreateExceptionFilterProviderDeps {
  lists: ListPluginSetup;
  core: CoreSetup;
  getSpaces: () => Promise<SpacesPluginStart | undefined>;
  logger: Logger;
}

/**
 * Creates a PreQueryFilterProvider that builds an Elasticsearch DSL exclusion
 * filter from a v2 rule's exception list references.
 *
 * This function is called once at plugin setup; the returned callback is
 * invoked on every v2 rule execution by ApplyPreQueryFiltersStep.
 *
 * All Lists-plugin dependencies stay within Security Solution's boundary.
 */
export const createExceptionFilterProvider = ({
  lists,
  core,
  getSpaces,
  logger,
}: CreateExceptionFilterProviderDeps): PreQueryFilterProvider => {
  return async ({ rule, request }) => {
    const exceptionRefs = rule.exceptions;

    if (!exceptionRefs?.length) {
      return null;
    }

    const [coreStart] = await core.getStartServices();
    const savedObjectsClient: SavedObjectsClientContract =
      coreStart.savedObjects.getScopedClient(request);
    const esClient: ElasticsearchClient =
      coreStart.elasticsearch.client.asScoped(request).asCurrentUser;

    const spaces = await getSpaces();
    const spaceId = spaces?.spacesService.getSpaceId(request) ?? 'default';

    const exceptionListClient = lists.getExceptionListClient(savedObjectsClient, 'alerting_v2');
    const listClient = lists.getListClient(esClient, spaceId, 'alerting_v2');

    const listIds = exceptionRefs.map((ref) => ref.list_id);
    const namespaceTypes = exceptionRefs.map((ref) => ref.namespace_type);

    let items: ExceptionListItemSchema[] = [];

    try {
      await exceptionListClient.findExceptionListsItemPointInTimeFinder({
        executeFunctionOnStream: (response: { data: ExceptionListItemSchema[] }) => {
          items = [...items, ...response.data];
        },
        listId: listIds,
        namespaceType: namespaceTypes,
        perPage: 1_000,
        filter: [],
        maxSize: undefined,
        sortOrder: undefined,
        sortField: undefined,
      });
    } catch (e) {
      logger.warn(
        `[exception_filter_provider] Failed to fetch exception items for rule ${rule.id}: ${e.message}`
      );
      return null;
    }

    if (items.length === 0) {
      return null;
    }

    logger.debug(
      `[exception_filter_provider] Building exception filter from ${items.length} item(s) for rule ${rule.id}`
    );

    const { filter: exceptionFilter, unprocessedExceptions } = await buildExceptionFilter({
      lists: items,
      excludeExceptions: true,
      chunkSize: 1024,
      alias: null,
      listClient,
      startedAt: new Date(),
    });

    if (unprocessedExceptions.length > 0) {
      logger.warn(
        `[exception_filter_provider] ${unprocessedExceptions.length} value-list exception(s) skipped for rule ${rule.id} (not yet supported in v2)`
      );
    }

    if (!exceptionFilter?.query) {
      return null;
    }

    // buildExceptionFilter returns a bool.should that matches exception items,
    // with meta.negate=true indicating exclusion. Since we pass raw DSL (no
    // meta), we must apply the negation ourselves: wrap in must_not so
    // matching documents are excluded from query results.
    if (exceptionFilter.meta.negate) {
      return { bool: { must_not: [exceptionFilter.query] } };
    }

    return exceptionFilter.query;
  };
};
