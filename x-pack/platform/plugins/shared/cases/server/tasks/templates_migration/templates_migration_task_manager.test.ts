/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { TaskManagerStartContract, RunContext } from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import {
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
} from '../../../common/constants';
import { CustomFieldTypes } from '../../../common/types/domain/custom_field/v1';
import { TemplatesMigrationTaskManager } from './templates_migration_task_manager';
import {
  CASES_TEMPLATES_MIGRATION_TASK_TYPE,
  CASES_TEMPLATES_MIGRATION_TASK_ID,
} from './constants';

const createSavedObjectsRepositoryMock = () => ({
  find: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  bulkCreate: jest.fn(),
  bulkUpdate: jest.fn(),
});

const createCoreMock = (repo: ReturnType<typeof createSavedObjectsRepositoryMock>) => ({
  savedObjects: {
    createInternalRepository: jest.fn().mockReturnValue(repo),
  },
});

const createUsageCollectionMock = () => {
  const counter = { incrementCounter: jest.fn() };
  const usageCollection = {
    createUsageCounter: jest.fn().mockReturnValue(counter),
  };
  return { usageCollection, counter };
};

const buildConfigureSO = (
  overrides: Partial<{
    id: string;
    owner: string;
    namespaces: string[];
    customFields: unknown[];
    templates: unknown[];
    legacyTemplatesMigrated: boolean;
    legacyCustomFieldsMigrated: boolean;
  }> = {}
) => ({
  id: overrides.id ?? 'config-1',
  namespaces: overrides.namespaces ?? ['default'],
  references: [],
  attributes: {
    owner: overrides.owner ?? 'cases',
    connector: { id: 'none', name: 'none', type: '.none', fields: null },
    closure_type: 'close-by-user',
    created_at: '2024-01-01T00:00:00.000Z',
    created_by: { username: 'elastic', email: null, full_name: null },
    updated_at: null,
    updated_by: null,
    customFields: overrides.customFields ?? [],
    templates: overrides.templates ?? [],
    legacyTemplatesMigrated: overrides.legacyTemplatesMigrated,
    legacyCustomFieldsMigrated: overrides.legacyCustomFieldsMigrated,
  },
});

const buildLegacyCustomField = (key: string, type = CustomFieldTypes.TEXT) => ({
  key,
  label: `Label for ${key}`,
  type,
  required: false,
  defaultValue: null,
});

const buildLegacyTemplate = (name: string, customFieldKeys: string[] = []) => ({
  key: `key-${name}`,
  name,
  caseFields: {
    customFields: customFieldKeys.map((k) => ({
      key: k,
      type: CustomFieldTypes.TEXT,
      value: null,
    })),
  },
});

describe('TemplatesMigrationTaskManager', () => {
  let taskManagerSetupMock: ReturnType<typeof taskManagerMock.createSetup>;
  let taskManagerStartMock: ReturnType<typeof taskManagerMock.createStart>;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let repo: ReturnType<typeof createSavedObjectsRepositoryMock>;
  let core: ReturnType<typeof createCoreMock>;

  beforeEach(() => {
    taskManagerSetupMock = taskManagerMock.createSetup();
    taskManagerStartMock = taskManagerMock.createStart();
    logger = loggingSystemMock.createLogger();
    repo = createSavedObjectsRepositoryMock();
    core = createCoreMock(repo);

    repo.find.mockResolvedValue({ saved_objects: [], total: 0 });
    repo.create.mockResolvedValue({ id: 'new-id', attributes: {}, references: [], type: 'test' });
    repo.update.mockResolvedValue({ id: 'config-1', attributes: {}, references: [], type: 'test' });
  });

  const getTaskRunner = (manager: TemplatesMigrationTaskManager) => {
    const call = taskManagerSetupMock.registerTaskDefinitions.mock.calls[0];
    const taskDefs = call[0];
    const taskDef = taskDefs[CASES_TEMPLATES_MIGRATION_TASK_TYPE];
    return taskDef.createTaskRunner({} as unknown as RunContext);
  };

  const buildAndSchedule = async (
    usageCollection?: UsageCollectionSetup,
    extraRepoSetup?: () => void
  ) => {
    const manager = new TemplatesMigrationTaskManager(
      taskManagerSetupMock,
      logger,
      usageCollection
    );
    if (extraRepoSetup) extraRepoSetup();
    await manager.scheduleMigrationTask(
      taskManagerStartMock as unknown as TaskManagerStartContract,
      core as unknown as CoreStart
    );
    return manager;
  };

  describe('constructor', () => {
    it('registers the task type', () => {
      new TemplatesMigrationTaskManager(taskManagerSetupMock, logger);
      expect(taskManagerSetupMock.registerTaskDefinitions).toHaveBeenCalledWith(
        expect.objectContaining({ [CASES_TEMPLATES_MIGRATION_TASK_TYPE]: expect.any(Object) })
      );
    });
  });

  describe('scheduleMigrationTask', () => {
    it('creates an internal repository with the three SO types', async () => {
      await buildAndSchedule();
      expect(core.savedObjects.createInternalRepository).toHaveBeenCalledWith([
        CASE_CONFIGURE_SAVED_OBJECT,
        CASE_TEMPLATE_SAVED_OBJECT,
        CASE_FIELD_DEFINITION_SAVED_OBJECT,
      ]);
    });

    it('removes any existing task before rescheduling to ensure a fresh run on startup', async () => {
      await buildAndSchedule();
      expect(taskManagerStartMock.removeIfExists).toHaveBeenCalledWith(
        CASES_TEMPLATES_MIGRATION_TASK_ID
      );
    });

    it('calls ensureScheduled with the migration task id', async () => {
      await buildAndSchedule();
      expect(taskManagerStartMock.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({ id: CASES_TEMPLATES_MIGRATION_TASK_ID })
      );
    });
  });

  describe('task runner run()', () => {
    it('skips a configure SO when both flags are already set', async () => {
      repo.find.mockResolvedValueOnce({
        saved_objects: [
          buildConfigureSO({ legacyTemplatesMigrated: true, legacyCustomFieldsMigrated: true }),
        ],
        total: 1,
      });

      const manager = await buildAndSchedule();
      const runner = getTaskRunner(manager);
      await runner.run();

      // Only the one find for configure SOs — no field-def or template lookups
      expect(repo.find).toHaveBeenCalledTimes(1);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('no-ops when configure list is empty', async () => {
      repo.find.mockResolvedValueOnce({ saved_objects: [], total: 0 });

      const manager = await buildAndSchedule();
      const runner = getTaskRunner(manager);
      await runner.run();

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('creates field definitions and templates for a fresh configure SO', async () => {
      const configSO = buildConfigureSO({
        customFields: [buildLegacyCustomField('cf_text')],
        templates: [buildLegacyTemplate('My Template', ['cf_text'])],
      });

      repo.find
        // First call: find all configure SOs
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        // Second call: find existing field-defs for this owner/namespace
        .mockResolvedValueOnce({ saved_objects: [], total: 0 })
        // Third call: find existing templates for this owner/namespace
        .mockResolvedValueOnce({ saved_objects: [], total: 0 });

      const manager = await buildAndSchedule();
      const runner = getTaskRunner(manager);
      await runner.run();

      expect(repo.create).toHaveBeenCalledTimes(2);

      const [fieldDefCall, templateCall] = repo.create.mock.calls;
      expect(fieldDefCall[0]).toBe(CASE_FIELD_DEFINITION_SAVED_OBJECT);
      expect(fieldDefCall[1]).toMatchObject({ name: 'cf_text', owner: 'cases', isGlobal: true });

      expect(templateCall[0]).toBe(CASE_TEMPLATE_SAVED_OBJECT);
      expect(templateCall[1]).toMatchObject({
        name: 'My Template',
        owner: 'cases',
        isLatest: true,
      });

      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        configSO.id,
        { legacyTemplatesMigrated: true, legacyCustomFieldsMigrated: true },
        expect.anything()
      );
    });

    it('sets isGlobal: true on every migrated field definition', async () => {
      const configSO = buildConfigureSO({
        customFields: [
          buildLegacyCustomField('cf_text', CustomFieldTypes.TEXT),
          buildLegacyCustomField('cf_num', CustomFieldTypes.NUMBER),
        ],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }) // field-defs
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      const fieldDefCreates = repo.create.mock.calls.filter(
        (c) => c[0] === CASE_FIELD_DEFINITION_SAVED_OBJECT
      );
      expect(fieldDefCreates).toHaveLength(2);
      for (const call of fieldDefCreates) {
        expect(call[1]).toMatchObject({ isGlobal: true });
      }
    });

    it('reuses existing field definitions by name and does not duplicate', async () => {
      const configSO = buildConfigureSO({
        customFields: [buildLegacyCustomField('cf_text')],
        templates: [buildLegacyTemplate('My Template', ['cf_text'])],
      });

      const existingFieldDef = {
        id: 'existing-fd',
        type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
        references: [],
        // Matching definition so no warn is emitted
        attributes: {
          name: 'cf_text',
          owner: 'cases',
          definition: 'name: cf_text\ncontrol: INPUT_TEXT\ntype: keyword\n',
          fieldDefinitionId: 'x',
        },
      };

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [existingFieldDef], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 });

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // Only one create — for the template; field-def is reused
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.create.mock.calls[0][0]).toBe(CASE_TEMPLATE_SAVED_OBJECT);
    });

    it('logs a warning when a reused field definition has a mismatched control type', async () => {
      const configSO = buildConfigureSO({
        customFields: [buildLegacyCustomField('cf_text')], // TEXT → expects INPUT_TEXT
      });

      const existingFieldDef = {
        id: 'existing-fd',
        type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
        references: [],
        attributes: {
          name: 'cf_text',
          owner: 'cases',
          // A TEXT legacy field would produce control: INPUT_TEXT — this has INPUT_NUMBER
          definition: 'name: cf_text\ncontrol: INPUT_NUMBER\ntype: integer\n',
          fieldDefinitionId: 'x',
        },
      };

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [existingFieldDef], total: 1 }) // field-defs
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('control="INPUT_NUMBER"'));
      // Field is still reused — no new field-def created
      expect(repo.create).not.toHaveBeenCalledWith(
        CASE_FIELD_DEFINITION_SAVED_OBJECT,
        expect.anything(),
        expect.anything()
      );
    });

    it('reuses existing templates by name and does not duplicate', async () => {
      const configSO = buildConfigureSO({
        // no customFields → skips field-def find; only templates find is made
        templates: [buildLegacyTemplate('Existing Template')],
      });

      const existingTemplate = {
        id: 'existing-tmpl',
        type: CASE_TEMPLATE_SAVED_OBJECT,
        references: [],
        attributes: { name: 'Existing Template', owner: 'cases', isLatest: true },
      };

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        // No field-defs find (empty customFields skips that code path)
        .mockResolvedValueOnce({ saved_objects: [existingTemplate], total: 1 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // No creates — template reused
      expect(repo.create).not.toHaveBeenCalled();
      // Both flags written even though there were no custom fields at migration time
      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        configSO.id,
        { legacyTemplatesMigrated: true, legacyCustomFieldsMigrated: true },
        expect.anything()
      );
    });

    it('still writes flags even when template create fails (best-effort behaviour)', async () => {
      const configSO = buildConfigureSO({
        templates: [buildLegacyTemplate('My Template')],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      repo.create.mockRejectedValueOnce(new Error('ES write failed'));

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // Per-item failures are caught and logged; both flags are still written to avoid
      // re-processing on the next restart (intentional best-effort behaviour).
      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        configSO.id,
        { legacyTemplatesMigrated: true, legacyCustomFieldsMigrated: true },
        expect.anything()
      );
    });

    it('rejects a template with an invalid YAML definition and logs the error', async () => {
      // buildTemplateYaml always emits valid YAML, but ParsedTemplateDefinitionSchema
      // validation can fail if the emitted structure is missing required fields.
      // Simulate this by pointing to a template whose name resolves to an empty string,
      // which would fail the min(1) validation — we test the safeParse error path by
      // monkeypatching after construction. Use the simplest proxy: a template whose
      // name passes buildTemplateYaml but whose YAML would fail schema validation.
      // The easiest approach: mock repo.create to confirm the error was logged.
      const configSO = buildConfigureSO({
        // Empty name would fail ParsedTemplateDefinitionSchema (name must be min length 1)
        templates: [{ key: 'k', name: '', caseFields: {} }],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }) // field-defs
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // The template create is never called because safeParse throws before repo.create
      expect(repo.create).not.toHaveBeenCalledWith(
        CASE_TEMPLATE_SAVED_OBJECT,
        expect.anything(),
        expect.anything()
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('produced an invalid definition')
      );
    });

    it('continues to next configure SO even if one fails entirely', async () => {
      // config-1 has a template that will fail to look up; config-2 has a template that succeeds.
      // Using filter-based discrimination avoids ordering issues from concurrent pMap execution.
      const configSO1 = buildConfigureSO({
        id: 'config-1',
        owner: 'cases',
        templates: [buildLegacyTemplate('T1')],
      });
      const configSO2 = buildConfigureSO({
        id: 'config-2',
        owner: 'securitySolution',
        templates: [buildLegacyTemplate('T2')],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO1, configSO2], total: 2 })
        .mockImplementation((query: { filter?: string }) => {
          if (typeof query.filter === 'string' && query.filter.includes('"cases"')) {
            return Promise.reject(new Error('template lookup failed for config-1'));
          }
          return Promise.resolve({ saved_objects: [], total: 0 });
        });

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // config-2 still gets processed despite config-1 failing
      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        'config-2',
        expect.anything(),
        expect.anything()
      );
    });

    it('handles a configure SO with no customFields and no templates', async () => {
      const configSO = buildConfigureSO({ customFields: [], templates: [] });

      repo.find.mockResolvedValueOnce({ saved_objects: [configSO], total: 1 });

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // No SO creates; no flags written (empty arrays — flags are set only when there is data to
      // migrate, so the next startup can detect newly-added custom fields or templates).
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('runs field-def phase but skips template phase when legacyTemplatesMigrated is already true', async () => {
      const configSO = buildConfigureSO({
        customFields: [buildLegacyCustomField('cf_text')],
        templates: [buildLegacyTemplate('T', ['cf_text'])],
        legacyTemplatesMigrated: true,
        legacyCustomFieldsMigrated: false,
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // field-defs find

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // Field-def phase must run (flag is false), template phase must not (flag already true)
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.create.mock.calls[0][0]).toBe(CASE_FIELD_DEFINITION_SAVED_OBJECT);
      expect(repo.create.mock.calls[0][1]).toMatchObject({ name: 'cf_text', isGlobal: true });

      // Only the custom fields flag is written; templates flag is already true
      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        configSO.id,
        { legacyCustomFieldsMigrated: true },
        expect.anything()
      );
      expect(repo.update.mock.calls[0][2]).not.toHaveProperty('legacyTemplatesMigrated');
    });

    it('does not add flags that are already true', async () => {
      const configSO = buildConfigureSO({
        customFields: [],
        templates: [buildLegacyTemplate('T')],
        legacyCustomFieldsMigrated: true, // already done
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      expect(repo.update).toHaveBeenCalledWith(
        CASE_CONFIGURE_SAVED_OBJECT,
        configSO.id,
        { legacyTemplatesMigrated: true },
        expect.anything()
      );
      expect(repo.update.mock.calls[0][2]).not.toHaveProperty('legacyCustomFieldsMigrated');
    });

    it('uses the configure SO namespace for field-def and template finds', async () => {
      const configSO = buildConfigureSO({
        namespaces: ['my-space'],
        // Need at least one customField to trigger the field-def find
        customFields: [buildLegacyCustomField('cf_text')],
        templates: [buildLegacyTemplate('T', ['cf_text'])],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configSO], total: 1 })
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }) // field-defs
        .mockResolvedValueOnce({ saved_objects: [], total: 0 }); // templates

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      // The second find (field-defs) should have namespaces: ['my-space']
      const fieldDefFindCall = repo.find.mock.calls[1];
      expect(fieldDefFindCall[0].namespaces).toEqual(['my-space']);
    });

    it('migrates configure SOs from different namespaces independently with correct namespace scoping', async () => {
      const configDefault = buildConfigureSO({
        id: 'config-default',
        namespaces: ['default'],
        customFields: [buildLegacyCustomField('cf_default')],
      });
      const configMySpace = buildConfigureSO({
        id: 'config-my-space',
        namespaces: ['my-space'],
        customFields: [buildLegacyCustomField('cf_myspace')],
      });

      repo.find
        .mockResolvedValueOnce({ saved_objects: [configDefault, configMySpace], total: 2 })
        // Remaining finds (2 field-def + 2 template) return empty regardless of order
        .mockResolvedValue({ saved_objects: [], total: 0 });

      const manager = await buildAndSchedule();
      await getTaskRunner(manager).run();

      const fieldDefCreates = repo.create.mock.calls.filter(
        (c) => c[0] === CASE_FIELD_DEFINITION_SAVED_OBJECT
      );
      // One field-def per namespace
      expect(fieldDefCreates).toHaveLength(2);

      // default namespace uses undefined (omitted) option; my-space uses 'my-space'
      const namespaceOptions = fieldDefCreates.map((c) => c[2]?.namespace);
      expect(namespaceOptions).toContain(undefined);
      expect(namespaceOptions).toContain('my-space');
    });
  });

  describe('telemetry counters', () => {
    it('increments configureMigrationSuccess after a successful migration', async () => {
      const { usageCollection, counter } = createUsageCollectionMock();
      repo.find.mockResolvedValueOnce({
        saved_objects: [buildConfigureSO({ customFields: [], templates: [] })],
        total: 1,
      });

      await getTaskRunner(
        await buildAndSchedule(usageCollection as unknown as UsageCollectionSetup)
      ).run();

      expect(counter.incrementCounter).toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'configureMigrationSuccess', incrementBy: 1 })
      );
    });

    it('increments configureMigrationError when migrateOneConfigure throws', async () => {
      const { usageCollection, counter } = createUsageCollectionMock();
      repo.find
        .mockResolvedValueOnce({
          saved_objects: [buildConfigureSO({ customFields: [buildLegacyCustomField('cf')] })],
          total: 1,
        })
        // field-def find throws → migrateOneConfigure propagates the error
        .mockRejectedValueOnce(new Error('network error'));

      await getTaskRunner(
        await buildAndSchedule(usageCollection as unknown as UsageCollectionSetup)
      ).run();

      expect(counter.incrementCounter).toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'configureMigrationError', incrementBy: 1 })
      );
      expect(counter.incrementCounter).not.toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'configureMigrationSuccess' })
      );
    });

    it('increments configureMigrationSkipped when both flags are already set', async () => {
      const { usageCollection, counter } = createUsageCollectionMock();
      repo.find.mockResolvedValueOnce({
        saved_objects: [
          buildConfigureSO({ legacyTemplatesMigrated: true, legacyCustomFieldsMigrated: true }),
        ],
        total: 1,
      });

      await getTaskRunner(
        await buildAndSchedule(usageCollection as unknown as UsageCollectionSetup)
      ).run();

      expect(counter.incrementCounter).toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'configureMigrationSkipped', incrementBy: 1 })
      );
      expect(counter.incrementCounter).not.toHaveBeenCalledWith(
        expect.objectContaining({ counterName: 'configureMigrationSuccess' })
      );
    });
  });
});
