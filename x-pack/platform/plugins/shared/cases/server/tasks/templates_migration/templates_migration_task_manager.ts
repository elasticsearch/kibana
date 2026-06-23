/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { parse as parseYaml } from 'yaml';
import pMap from 'p-map';
import type { CoreStart, ISavedObjectsRepository, Logger, SavedObject } from '@kbn/core/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { IUsageCounter } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counter';
import {
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
} from '../../../common/constants';
import type { ConfigurationPersistedAttributes } from '../../common/types/configure';
import type { FieldDefinition } from '../../../common/types/domain/field_definition/v1';
import { ParsedTemplateDefinitionSchema } from '../../../common/types/domain/template/v1';
import type { Template } from '../../../common/types/domain/template/v1';
import { toFieldNames, trimFieldDefaults } from '../../services/templates/utils';
import { buildFieldDefinitionYaml } from './build_field_definition_yaml';
import { buildTemplateYaml } from './build_template_yaml';
import {
  CASES_TEMPLATES_MIGRATION_TASK_TYPE,
  CASES_TEMPLATES_MIGRATION_TASK_ID,
} from './constants';

const MAX_CONCURRENT_MIGRATIONS = 3;

type LegacyCustomField = NonNullable<ConfigurationPersistedAttributes['customFields']>[number];
type LegacyTemplate = NonNullable<ConfigurationPersistedAttributes['templates']>[number];

export class TemplatesMigrationTaskManager {
  private readonly logger: Logger;
  private internalRepo?: ISavedObjectsRepository;
  private migrationUsageCounter?: IUsageCounter;

  constructor(
    taskManager: TaskManagerSetupContract,
    logger: Logger,
    usageCollection?: UsageCollectionSetup
  ) {
    this.logger = logger.get('cases_templates_v2_migration');
    this.logger.info('Registering Cases Templates V2 Migration Task');

    if (usageCollection) {
      this.migrationUsageCounter = usageCollection.createUsageCounter('CasesTemplatesV2Migration');
    }

    taskManager.registerTaskDefinitions({
      [CASES_TEMPLATES_MIGRATION_TASK_TYPE]: {
        title: 'Cases Templates V2 Migration',
        description: 'One-shot migration of legacy templates and custom fields to the v2 system',
        timeout: '10m',
        maxAttempts: 3,
        createTaskRunner: () => {
          // Same guard as IncrementalIdTaskManager: if Task Manager fires between setup() and
          // start(), we throw and let TM mark the run as failed — it will retry on next startup.
          if (!this.internalRepo) {
            throw new Error('TemplatesMigrationTaskManager: internal repository not initialized');
          }
          const repo = this.internalRepo;
          const log = this.logger;

          return {
            run: async () => {
              const executionId = uuidv4();
              log.info(`[${executionId}] Starting cases templates v2 migration`);

              const configures = await this.findAllConfigurations(repo, executionId);
              log.info(
                `[${executionId}] Found ${configures.length} cases-configure SOs to inspect`
              );

              await pMap(
                configures,
                async (so) => {
                  if (
                    so.attributes.legacyTemplatesMigrated &&
                    so.attributes.legacyCustomFieldsMigrated
                  ) {
                    log.debug(
                      `[${executionId}] Skipping already-migrated configure SO ${so.id} (owner: ${so.attributes.owner})`
                    );
                    this.migrationUsageCounter?.incrementCounter({
                      counterName: 'configureMigrationSkipped',
                      incrementBy: 1,
                    });
                    return;
                  }

                  try {
                    await this.migrateOneConfigure(repo, so, executionId, log);
                    this.migrationUsageCounter?.incrementCounter({
                      counterName: 'configureMigrationSuccess',
                      incrementBy: 1,
                    });
                  } catch (err) {
                    log.error(
                      `[${executionId}] Migration failed for configure SO ${so.id} (owner: ${
                        so.attributes.owner
                      }): ${err instanceof Error ? err.message : String(err)}`
                    );
                    this.migrationUsageCounter?.incrementCounter({
                      counterName: 'configureMigrationError',
                      incrementBy: 1,
                    });
                  }
                },
                { concurrency: MAX_CONCURRENT_MIGRATIONS }
              );

              log.info(`[${executionId}] Cases templates v2 migration task complete`);
            },

            cancel: async () => {
              log.debug('Cases templates v2 migration task cancelled');
            },
          };
        },
      },
    });
  }

  public async scheduleMigrationTask(
    taskManager: TaskManagerStartContract,
    core: CoreStart
  ): Promise<void> {
    this.internalRepo = core.savedObjects.createInternalRepository([
      CASE_CONFIGURE_SAVED_OBJECT,
      CASE_TEMPLATE_SAVED_OBJECT,
      CASE_FIELD_DEFINITION_SAVED_OBJECT,
    ]);

    // Remove any lingering task record so the migration re-runs on every Kibana startup.
    // Each configure SO's own legacyCustomFieldsMigrated / legacyTemplatesMigrated flags
    // make individual phases idempotent — already-migrated SOs are cheap no-ops.
    //
    // Multi-node note: in a rolling restart, a second node may call removeIfExists while
    // the task is still executing on another node. TaskStore.remove on a locked task is a
    // best-effort delete; if interrupted mid-run the next startup will re-process the
    // partially-migrated SO (the per-SO flags prevent double-creation of already-written SOs).
    await taskManager.removeIfExists(CASES_TEMPLATES_MIGRATION_TASK_ID);

    try {
      await taskManager.ensureScheduled({
        id: CASES_TEMPLATES_MIGRATION_TASK_ID,
        taskType: CASES_TEMPLATES_MIGRATION_TASK_TYPE,
        params: {},
        state: {},
        scope: ['cases'],
      });
      this.logger.info(`${CASES_TEMPLATES_MIGRATION_TASK_ID} scheduled`);
    } catch (err) {
      this.logger.error(
        `Failed to schedule ${CASES_TEMPLATES_MIGRATION_TASK_ID}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  private async findAllConfigurations(
    repo: ISavedObjectsRepository,
    executionId: string
  ): Promise<Array<SavedObject<ConfigurationPersistedAttributes>>> {
    const all: Array<SavedObject<ConfigurationPersistedAttributes>> = [];

    let page = 1;
    const perPage = 1000;

    while (true) {
      const result = await repo.find<ConfigurationPersistedAttributes>({
        type: CASE_CONFIGURE_SAVED_OBJECT,
        namespaces: ['*'],
        page,
        perPage,
        sortField: 'created_at',
        sortOrder: 'asc',
      });

      all.push(...result.saved_objects);

      if (result.saved_objects.length < perPage) {
        break;
      }
      page++;
    }

    this.logger.debug(
      `[${executionId}] findAllConfigurations: fetched ${all.length} configure SOs`
    );

    return all;
  }

  private async migrateFieldDefinitions(
    repo: ISavedObjectsRepository,
    owner: string,
    namespace: string,
    nsOption: string | undefined,
    legacyCustomFields: LegacyCustomField[],
    executionId: string,
    log: Logger
  ): Promise<{ refNamesByKey: Map<string, string>; created: number; reused: number }> {
    const refNamesByKey = new Map<string, string>();
    let created = 0;
    let reused = 0;

    // perPage: 10000 is intentionally unbounded for this one-shot migration scan.
    // The number of field-definitions per owner is expected to be O(10s) in practice.
    const existingFieldDefs = await repo.find<FieldDefinition>({
      type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
      namespaces: nsOption ? [nsOption] : ['default'],
      perPage: 10000,
      page: 1,
      // owner is one of cases/securitySolution/observability — a controlled enum, not user input
      filter: `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "${owner}"`,
    });
    const existingByName = new Map(
      existingFieldDefs.saved_objects.map((fd) => [fd.attributes.name, fd])
    );

    for (const cf of legacyCustomFields) {
      const existingDef = existingByName.get(cf.key);
      if (existingDef) {
        const existingParsed = parseYaml(existingDef.attributes.definition ?? '') as Record<
          string,
          unknown
        >;
        const { yaml: expectedYaml } = buildFieldDefinitionYaml(cf);
        const expectedParsed = parseYaml(expectedYaml) as Record<string, unknown>;
        if (
          existingParsed?.control !== expectedParsed?.control ||
          existingParsed?.type !== expectedParsed?.type
        ) {
          log.warn(
            `[${executionId}] Field definition "${cf.key}" (owner: "${owner}", namespace: "${namespace}") already exists ` +
              `but has control="${existingParsed?.control}" / type="${existingParsed?.type}", ` +
              `expected control="${expectedParsed?.control}" / type="${expectedParsed?.type}" from legacy data — ` +
              `reusing existing; templates referencing this field may reference a type-mismatched definition`
          );
        } else {
          log.debug(
            `[${executionId}] Field definition "${cf.key}" already exists for owner "${owner}" in namespace "${namespace}" — reusing`
          );
        }
        refNamesByKey.set(cf.key, cf.key);
        reused++;
      } else {
        try {
          const { yaml } = buildFieldDefinitionYaml(cf);
          const fdId = uuidv4();
          await repo.create<FieldDefinition>(
            CASE_FIELD_DEFINITION_SAVED_OBJECT,
            {
              fieldDefinitionId: fdId,
              name: cf.key,
              owner,
              definition: yaml,
              description: cf.label,
              isGlobal: true,
            },
            { id: fdId, ...(nsOption ? { namespace: nsOption } : {}), refresh: false }
          );
          refNamesByKey.set(cf.key, cf.key);
          created++;
        } catch (err) {
          log.error(
            `[${executionId}] Failed to create field definition for key "${
              cf.key
            }" (owner: ${owner}): ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return { refNamesByKey, created, reused };
  }

  private async migrateTemplates(
    repo: ISavedObjectsRepository,
    owner: string,
    namespace: string,
    nsOption: string | undefined,
    legacyTemplates: LegacyTemplate[],
    refNamesByKey: Map<string, string>,
    executionId: string,
    log: Logger
  ): Promise<{ created: number; reused: number }> {
    let created = 0;
    let reused = 0;

    // perPage: 10000 is intentionally unbounded for this one-shot migration scan.
    // The number of templates per owner is expected to be O(10s) in practice.
    const existingTemplates = await repo.find<Template>({
      type: CASE_TEMPLATE_SAVED_OBJECT,
      namespaces: nsOption ? [nsOption] : ['default'],
      perPage: 10000,
      page: 1,
      // owner is one of cases/securitySolution/observability — a controlled enum, not user input
      filter:
        `${CASE_TEMPLATE_SAVED_OBJECT}.attributes.owner: "${owner}" AND ` +
        `${CASE_TEMPLATE_SAVED_OBJECT}.attributes.isLatest: true`,
    });
    const existingNameSet = new Set(existingTemplates.saved_objects.map((t) => t.attributes.name));

    for (const legacyTemplate of legacyTemplates) {
      if (existingNameSet.has(legacyTemplate.name)) {
        log.debug(
          `[${executionId}] Template "${legacyTemplate.name}" already exists for owner "${owner}" in namespace "${namespace}" — reusing`
        );
        reused++;
      } else {
        try {
          const definition = trimFieldDefaults(
            buildTemplateYaml(legacyTemplate, refNamesByKey, log)
          );
          const parseResult = ParsedTemplateDefinitionSchema.safeParse(parseYaml(definition));
          if (!parseResult.success) {
            throw new Error(
              `Template "${legacyTemplate.name}" produced an invalid definition: ${parseResult.error.message}`
            );
          }
          const parsedDefinition = parseResult.data;
          const templateId = uuidv4();
          const id = uuidv4();

          await repo.create<Template>(
            CASE_TEMPLATE_SAVED_OBJECT,
            {
              templateVersion: 1,
              isLatest: true,
              deletedAt: null,
              definition,
              name: parsedDefinition.name,
              owner,
              templateId,
              description: parsedDefinition.description ?? legacyTemplate.description,
              tags: parsedDefinition.tags ?? legacyTemplate.tags,
              author: 'system',
              fieldCount: parsedDefinition.fields.length,
              fieldNames: toFieldNames(parsedDefinition.fields),
              isEnabled: true,
            } as Template,
            { id, ...(nsOption ? { namespace: nsOption } : {}), refresh: false }
          );
          created++;
        } catch (err) {
          log.error(
            `[${executionId}] Failed to create template "${
              legacyTemplate.name
            }" (owner: ${owner}): ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return { created, reused };
  }

  private async migrateOneConfigure(
    repo: ISavedObjectsRepository,
    so: SavedObject<ConfigurationPersistedAttributes>,
    executionId: string,
    log: Logger
  ): Promise<void> {
    const { id: configureId, attributes, namespaces } = so;
    const {
      owner,
      customFields: legacyCustomFields = [],
      templates: legacyTemplates = [],
    } = attributes;
    const namespace = namespaces?.[0] ?? 'default';
    const nsOption = namespace === 'default' ? undefined : namespace;

    log.debug(
      `[${executionId}] Migrating configure SO ${configureId} (owner: ${owner}, namespace: ${namespace}, ` +
        `customFields: ${legacyCustomFields.length}, templates: ${legacyTemplates.length})`
    );

    // ── Field definitions phase ──────────────────────────────────────────────
    let fieldDefsCreated = 0;
    let fieldDefsReused = 0;
    let refNamesByKey = new Map<string, string>();

    if (!attributes.legacyCustomFieldsMigrated && legacyCustomFields.length > 0) {
      const result = await this.migrateFieldDefinitions(
        repo,
        owner,
        namespace,
        nsOption,
        legacyCustomFields,
        executionId,
        log
      );
      refNamesByKey = result.refNamesByKey;
      fieldDefsCreated = result.created;
      fieldDefsReused = result.reused;
    } else {
      // Already migrated or no custom fields — build refMap from legacy keys for template phase
      for (const cf of legacyCustomFields) {
        refNamesByKey.set(cf.key, cf.key);
      }
    }

    // ── Templates phase ──────────────────────────────────────────────────────
    let templatesCreated = 0;
    let templatesReused = 0;

    if (!attributes.legacyTemplatesMigrated && legacyTemplates.length > 0) {
      const result = await this.migrateTemplates(
        repo,
        owner,
        namespace,
        nsOption,
        legacyTemplates,
        refNamesByKey,
        executionId,
        log
      );
      templatesCreated = result.created;
      templatesReused = result.reused;
    }

    // ── Write migration flags ────────────────────────────────────────────────
    // Both flags are written together whenever the configure SO has any legacy data (custom fields
    // or templates). Setting legacyTemplatesMigrated even when there are no templates at migration
    // time prevents spurious re-runs on subsequent startups. Configure SOs with no legacy data at
    // all (empty arrays) receive no flags — they are re-evaluated cheaply on each restart.
    const flagsToWrite: Partial<ConfigurationPersistedAttributes> = {};
    if (legacyCustomFields.length > 0 || legacyTemplates.length > 0) {
      if (!attributes.legacyCustomFieldsMigrated) {
        flagsToWrite.legacyCustomFieldsMigrated = true;
      }
      if (!attributes.legacyTemplatesMigrated) {
        flagsToWrite.legacyTemplatesMigrated = true;
      }
    }

    if (Object.keys(flagsToWrite).length > 0) {
      await repo.update<ConfigurationPersistedAttributes>(
        CASE_CONFIGURE_SAVED_OBJECT,
        configureId,
        flagsToWrite,
        { ...(nsOption ? { namespace: nsOption } : {}), refresh: false }
      );
    }

    log.info(
      `[${executionId}] Migrated configure SO ${configureId} (owner: ${owner}, namespace: ${namespace}): ` +
        `fieldDefsCreated=${fieldDefsCreated}, fieldDefsReused=${fieldDefsReused}, ` +
        `templatesCreated=${templatesCreated}, templatesReused=${templatesReused}`
    );
  }
}
