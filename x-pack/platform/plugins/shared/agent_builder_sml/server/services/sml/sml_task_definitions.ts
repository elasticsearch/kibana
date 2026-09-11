/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { TaskPriority } from '@kbn/task-manager-plugin/server';
import type { ElasticsearchServiceStart } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { Logger } from '@kbn/logging';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import type { SmlService } from './types';

/**
 * Security model:
 *
 * The SML crawler runs as a Task Manager background task with internal
 * credentials (`asInternalUser` / `createInternalRepository`). This is the
 * standard Kibana pattern for background tasks that have no user context.
 *
 * The crawler indexes ALL content across ALL spaces into the SML system index.
 * Access control is enforced at **query time**, not index time:
 *
 *  1. `searchSml` enforces authorization via a `nested` Query DSL filter pushed
 *     into the ES|QL `_query` API's `filter` parameter. `permissions.kibana.privileges`
 *     is a `nested` field holding one element per space (`{ space, name[], count }`),
 *     so a single filter covers both dimensions: the element's `space` term scopes
 *     it, and a `terms_set` against that element's own `count` requires ALL of its
 *     actions. Nesting is what keeps the two bound together — matches cannot
 *     accumulate across spaces.
 *  2. `autocompleteSml` applies the same filter in the Elasticsearch `_search`
 *     query. Both paths read as `asInternalUser` (ES DLS does not apply);
 *     authorization is application-side. ES-side DLS (elasticsearch#156990)
 *     protects direct ES access by third parties using the same semantics.
 *  3. `checkItemsAccess` (used by `sml_attach`) applies the same rule in memory
 *     — existential across a document's space elements, universal within one —
 *     before allowing attachment resolution.
 *
 * When the security plugin is absent (development/testing), privilege enforcement
 * is skipped following the standard Kibana open-access convention. However,
 * search/autocomplete still push the space-scoping half of the filter — Spaces are
 * available without security, so space isolation doesn't have to depend on the plugin.
 *
 * SML type implementers are responsible for returning the correct actions from
 * their `getPermissions` hook (see `SmlTypeDefinition`); the indexer groups them
 * by space into the stored shape.
 */
export const SML_CRAWLER_TASK_TYPE = 'agent_builder_sml:sml_crawler';

interface SmlCrawlerTaskParams {
  attachmentType: string;
}

interface SmlCrawlerDepsProvider {
  smlService: SmlService;
  elasticsearch: ElasticsearchServiceStart;
  savedObjects: SavedObjectsServiceStart;
  uiSettings: UiSettingsServiceStart;
  logger: Logger;
}

/**
 * Register the SML crawler task type with task manager.
 * Must be called during plugin setup.
 */
export const registerSmlCrawlerTaskDefinition = ({
  taskManager,
  getCrawlerDeps,
}: {
  taskManager: TaskManagerSetupContract;
  getCrawlerDeps: () => Promise<SmlCrawlerDepsProvider> | SmlCrawlerDepsProvider;
}) => {
  taskManager.registerTaskDefinitions({
    [SML_CRAWLER_TASK_TYPE]: {
      title: 'Agent Builder SML Crawler',
      timeout: '10m',
      maxAttempts: 3,
      priority: TaskPriority.Maintenance,
      createTaskRunner: (context) => {
        const { taskInstance, signal } = context;
        const { attachmentType } = (taskInstance.params ?? {}) as Partial<SmlCrawlerTaskParams>;

        return {
          run: async () => {
            if (!attachmentType) {
              return { state: {} };
            }

            const { smlService, elasticsearch, savedObjects, uiSettings, logger } =
              await getCrawlerDeps();

            const soClient = savedObjects.createInternalRepository();
            const uiSettingsClient = uiSettings.asScopedToClient(soClient);
            const experimentalFeaturesEnabled = await uiSettingsClient.get<boolean>(
              AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
            );
            if (!experimentalFeaturesEnabled && attachmentType !== 'connector') {
              logger.debug(
                `SML crawler: Agent Builder experimental features disabled — skipping crawl for type '${attachmentType}'`
              );
              return { state: {} };
            }

            logger.debug(`SML crawler task starting for type '${attachmentType}'`);

            const definition = smlService.getTypeDefinition(attachmentType);
            if (!definition) {
              logger.warn(
                `SML crawler task: type definition '${attachmentType}' not found — skipping. Registered types: [${smlService
                  .listTypeDefinitions()
                  .map((t) => t.id)
                  .join(', ')}]`
              );
              return { state: {} };
            }

            const esClient = elasticsearch.client.asInternalUser;

            const soRepository = savedObjects.createInternalRepository([
              ...(definition.requiredHiddenTypes ?? []),
            ]);

            try {
              await smlService.getCrawler().crawl({
                definition,
                esClient,
                savedObjectsClient: soRepository,
                abortSignal: signal,
              });
              logger.debug(`SML crawler task completed for type '${attachmentType}'`);
            } catch (error) {
              logger.error(
                `SML crawler task failed for type '${attachmentType}': ${(error as Error).message}`
              );
            }

            return { state: {} };
          },
        };
      },
    },
  });
};

/**
 * Schedule SML crawler tasks for all registered types that provide a `list` hook.
 * Should be called during plugin start.
 */
export const scheduleSmlCrawlerTasks = async ({
  taskManager,
  smlService,
  logger,
}: {
  taskManager: TaskManagerStartContract;
  smlService: SmlService;
  logger: Logger;
}) => {
  const types = smlService.listTypeDefinitions();

  for (const definition of types) {
    const taskId = `${SML_CRAWLER_TASK_TYPE}:${definition.id}`;
    const interval = definition.fetchFrequency?.() ?? '10m';

    try {
      await taskManager.ensureScheduled({
        id: taskId,
        taskType: SML_CRAWLER_TASK_TYPE,
        params: { attachmentType: definition.id },
        schedule: { interval },
        scope: ['agentBuilderSml'],
        state: {},
      });
      logger.info(
        `SML crawler task scheduled for type '${definition.id}' with interval '${interval}'`
      );
    } catch (error) {
      logger.error(
        `Failed to schedule SML crawler task for type '${definition.id}': ${
          (error as Error).message
        }`
      );
    }
  }
};
