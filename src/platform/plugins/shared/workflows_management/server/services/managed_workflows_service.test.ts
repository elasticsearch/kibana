/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHash } from 'node:crypto';
import type { KibanaRequest } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { isOccConflictError, OccWriter } from '@kbn/occ';
import type { WorkflowExecutionEngineModel, WorkflowYaml } from '@kbn/workflows';
import type {
  ManagedWorkflowDefinition,
  ManagedWorkflowId,
  ManagedWorkflowManagement,
  ManagedWorkflowTemplateValues,
} from '@kbn/workflows/managed';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { WorkflowConflictError } from '@kbn/workflows-yaml';
import { ManagedWorkflowsService } from './managed_workflows_service';
import type { VersionedWorkflowDocument, WorkflowCrudService } from './workflow_crud_service';
import type {
  ReadModifyWriteWorkflowDocumentParams,
  WriteWorkflowDocumentWithOccParams,
} from './workflow_occ_types';
import { WorkflowChangeHistoryAction } from '../../common/lib/workflow_change_history/constants';
import { INITIAL_WORKFLOW_VERSION } from '../lib/workflow_version';
import type { WorkflowProperties } from '../storage/workflow_storage';

let mockManagedWorkflowDefinitions: ManagedWorkflowDefinition[] = [];

jest.mock('@kbn/workflows/managed', () => ({
  getManagedWorkflowDefinition: (id: string) =>
    mockManagedWorkflowDefinitions.find((definition) => definition.id === id),
  getManagedWorkflowDefinitions: () => [...mockManagedWorkflowDefinitions],
}));

const PLUGIN_ID = 'testPlugin';
const WORKFLOW_ID = 'system-test-workflow' as ManagedWorkflowId;
const SPACE_ID = 'default';

const defaultManagement: ManagedWorkflowManagement = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'restorable',
};

interface TemplateValues extends ManagedWorkflowTemplateValues {
  recipient: string;
  enabled: boolean;
}

type YamlManagedWorkflowDefinition = ManagedWorkflowDefinition & { yaml: string };
type TemplateManagedWorkflowDefinition = ManagedWorkflowDefinition<TemplateValues> & {
  yamlTemplate: (values: TemplateValues) => string;
};

const workflowYaml = ({
  name = 'Managed Workflow',
  enabled = true,
}: {
  name?: string;
  enabled?: boolean;
} = {}) => `name: ${name}
enabled: ${enabled}
triggers: []
steps: []
`;

const definitionHash = (yaml: string): string => {
  return createHash('sha256').update(yaml.trim()).digest('hex');
};

const createDefinition = (
  overrides: {
    id?: string;
    pluginId?: string;
    version?: number;
    yaml?: string;
    management?: Partial<ManagedWorkflowManagement>;
  } = {}
): YamlManagedWorkflowDefinition => ({
  id: overrides.id ?? WORKFLOW_ID,
  pluginId: overrides.pluginId ?? PLUGIN_ID,
  version: overrides.version ?? 1,
  yaml: overrides.yaml ?? workflowYaml(),
  management: {
    ...defaultManagement,
    ...overrides.management,
  },
});

const createTemplateDefinition = (
  overrides: {
    id?: string;
    pluginId?: string;
    management?: Partial<ManagedWorkflowManagement>;
  } = {}
): TemplateManagedWorkflowDefinition => ({
  id: overrides.id ?? WORKFLOW_ID,
  pluginId: overrides.pluginId ?? PLUGIN_ID,
  version: 1,
  yamlTemplate: ({ recipient, enabled }) =>
    workflowYaml({ name: `Managed Workflow - ${recipient}`, enabled }),
  management: {
    ...defaultManagement,
    ...overrides.management,
  },
});

const createWorkflowSource = (overrides: Partial<WorkflowProperties> = {}): WorkflowProperties => ({
  name: 'Managed Workflow',
  description: undefined,
  enabled: true,
  tags: [],
  triggerTypes: [],
  yaml: workflowYaml(),
  definition: { name: 'Managed Workflow', enabled: true } as WorkflowYaml,
  createdBy: 'elastic/kibana',
  lastUpdatedBy: 'elastic/kibana',
  spaceId: SPACE_ID,
  managed: true,
  managedBy: PLUGIN_ID,
  managedVersion: 1,
  definitionHash: 'old-hash',
  managedTemplateValues: null,
  originManagedWorkflowId: WORKFLOW_ID,
  lifecycle: 'static',
  deleted_at: null,
  valid: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const createVersionedDocument = (
  source: WorkflowProperties,
  overrides: Partial<VersionedWorkflowDocument> = {}
): VersionedWorkflowDocument => ({
  source,
  seqNo: 7,
  primaryTerm: 13,
  ...overrides,
});

const getYamlEnabled = (yaml: string): boolean => !yaml.includes('enabled: false');

const mockPrepareReturnsInitialVersion = (
  crudService: ReturnType<typeof createCrudServiceMock>
) => {
  crudService.prepareWorkflowDocumentForStorage.mockImplementation(
    async ({
      id,
      yaml,
      actor,
      now,
      spaceId,
    }: {
      id: string;
      yaml: string;
      actor: string;
      now: Date;
      spaceId: string;
    }) => {
      const enabled = getYamlEnabled(yaml);
      return {
        workflowData: createWorkflowSource({
          name: id,
          enabled,
          yaml,
          definition: { name: id, enabled } as WorkflowYaml,
          version: INITIAL_WORKFLOW_VERSION,
          createdBy: actor,
          lastUpdatedBy: actor,
          spaceId,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          managed: false,
          managedBy: null,
          managedVersion: null,
          definitionHash: null,
          managedTemplateValues: null,
          originManagedWorkflowId: null,
          lifecycle: null,
        }),
      };
    }
  );
};

const createCrudServiceMock = () => {
  const crudService = {
    getWorkflowDocumentWithVersion: jest.fn(),
    getWorkflowDocumentSource: jest.fn(),
    getManagedWorkflowDocumentsAllSpaces: jest.fn().mockResolvedValue([]),
    indexWorkflowDocument: jest.fn().mockResolvedValue({ seqNo: 1, primaryTerm: 1 }),
    createWorkflowDocument: jest.fn(
      async (_id, _spaceId, document: WorkflowProperties) => document
    ),
    writeWorkflowDocumentWithOcc: jest.fn(
      async (_id, _spaceId, params: WriteWorkflowDocumentWithOccParams) => params.document
    ),
    readModifyWriteWorkflowDocument: jest.fn(
      async (_id, _spaceId, params: ReadModifyWriteWorkflowDocumentParams) =>
        params.mutate(createWorkflowSource({}))
    ),
    deleteWorkflows: jest.fn().mockResolvedValue(undefined),
    logWorkflowChangesAfterWrite: jest.fn().mockResolvedValue(undefined),
    isWorkflowVersioningEnabled: jest.fn().mockReturnValue(false),
    prepareWorkflowDocumentForStorage: jest.fn(
      async ({
        id,
        yaml,
        actor,
        now,
        spaceId,
      }: {
        id: string;
        yaml: string;
        actor: string;
        now: Date;
        spaceId: string;
      }) => {
        const enabled = getYamlEnabled(yaml);
        return {
          workflowData: createWorkflowSource({
            name: id,
            enabled,
            yaml,
            definition: { name: id, enabled } as WorkflowYaml,
            createdBy: actor,
            lastUpdatedBy: actor,
            spaceId,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            managed: false,
            managedBy: null,
            managedVersion: null,
            definitionHash: null,
            managedTemplateValues: null,
            originManagedWorkflowId: null,
            lifecycle: null,
          }),
        };
      }
    ),
  };

  return crudService;
};

const wireOccAwareCrudWrites = (
  crudService: ReturnType<typeof createCrudServiceMock>,
  logger: ReturnType<typeof loggerMock.create>
) => {
  const index = async ({
    id: docId,
    document,
    create,
    ifSeqNo,
    ifPrimaryTerm,
  }: {
    id: string;
    document: WorkflowProperties;
    create?: boolean;
    ifSeqNo?: number;
    ifPrimaryTerm?: number;
  }) => crudService.indexWorkflowDocument(docId, document, { create, ifSeqNo, ifPrimaryTerm });

  const wrapConflict = async <T>(workflowId: string, operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (isOccConflictError(error)) {
        throw new WorkflowConflictError(
          `Workflow with id '${workflowId}' was updated concurrently. Please retry.`,
          workflowId
        );
      }
      throw error;
    }
  };

  const indexWriter = new OccWriter<WorkflowProperties>({
    index,
    logger,
  });

  crudService.createWorkflowDocument.mockImplementation(async (id, _spaceId, document) =>
    wrapConflict(id, async () => (await indexWriter.create({ id, document })).document)
  );

  crudService.writeWorkflowDocumentWithOcc.mockImplementation(async (id, _spaceId, params) =>
    wrapConflict(id, async () => {
      const { document } = await indexWriter.write({
        id,
        document: params.document,
        ifSeqNo: params.ifSeqNo,
        ifPrimaryTerm: params.ifPrimaryTerm,
      });
      return document;
    })
  );

  crudService.readModifyWriteWorkflowDocument.mockImplementation(async (id, spaceId, params) => {
    const readModifyWriter = new OccWriter<WorkflowProperties>({
      get: async (docId) => {
        const document = await crudService.getWorkflowDocumentWithVersion(docId, spaceId);
        if (!document) {
          return null;
        }
        return {
          id: docId,
          source: document.source,
          occ: { seqNo: document.seqNo, primaryTerm: document.primaryTerm },
        };
      },
      index,
      maxRetries: params.maxRetries,
      retryDelayMs: 0,
      logger,
    });

    return wrapConflict(id, async () => {
      const { document } = await readModifyWriter.readModifyWrite({
        id,
        mutate: params.mutate,
      });
      return document;
    });
  });
};

const getLastIndexedDocument = (
  crudService: ReturnType<typeof createCrudServiceMock>
): WorkflowProperties => {
  return crudService.indexWorkflowDocument.mock.calls.at(-1)?.[1] as WorkflowProperties;
};

const createExecutionEngineMock = () =>
  ({
    executeWorkflow: jest.fn().mockResolvedValue({ workflowExecutionId: 'execution-1' }),
  } as unknown as WorkflowsExecutionEnginePluginStart);

const createService = () => {
  const crudService = createCrudServiceMock();
  const workflowsExecutionEngine = createExecutionEngineMock();
  const logger = loggerMock.create();
  const service = new ManagedWorkflowsService({
    crudService: crudService as unknown as WorkflowCrudService,
    workflowsExecutionEngine,
    logger,
  });

  return {
    crudService,
    workflowsExecutionEngine,
    logger,
    service,
  };
};

const getIndexedDocument = (
  crudService: ReturnType<typeof createCrudServiceMock>
): WorkflowProperties => {
  const indexed = crudService.indexWorkflowDocument.mock.calls.at(-1)?.[1] as
    | WorkflowProperties
    | undefined;
  if (indexed) {
    return indexed;
  }

  const createArgs = crudService.createWorkflowDocument.mock.calls.at(-1);
  if (createArgs) {
    return createArgs[2];
  }

  const writeArgs = crudService.writeWorkflowDocumentWithOcc.mock.calls.at(-1);
  if (writeArgs) {
    return writeArgs[2].document;
  }

  throw new Error('No indexed workflow document found in test mocks');
};

const expectNoOccWrites = (crudService: ReturnType<typeof createCrudServiceMock>) => {
  expect(crudService.createWorkflowDocument).not.toHaveBeenCalled();
  expect(crudService.writeWorkflowDocumentWithOcc).not.toHaveBeenCalled();
};

describe('ManagedWorkflowsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManagedWorkflowDefinitions = [createDefinition()];
  });

  describe('installManagedWorkflow', () => {
    it('creates a new managed workflow document', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.prepareWorkflowDocumentForStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          lightweightValidation: true,
        })
      );
      expect(crudService.createWorkflowDocument).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.any(Object)
      );
      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument).toEqual(
        expect.objectContaining({
          managed: true,
          managedBy: PLUGIN_ID,
          originManagedWorkflowId: WORKFLOW_ID,
          lifecycle: 'static',
          managedVersion: 1,
          definitionHash: definitionHash(definition.yaml),
        })
      );
    });

    it('sets document.version to 1 on managed create when versioning is enabled', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.isWorkflowVersioningEnabled.mockReturnValue(true);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.version).toBe(INITIAL_WORKFLOW_VERSION);
      expect(crudService.createWorkflowDocument).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({ version: INITIAL_WORKFLOW_VERSION })
      );
    });

    it('does not set document.version on managed create when versioning is disabled', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.isWorkflowVersioningEnabled.mockReturnValue(false);
      crudService.prepareWorkflowDocumentForStorage.mockImplementation(
        async ({ id, yaml, actor, now, spaceId }) => {
          const enabled = getYamlEnabled(yaml);
          return {
            workflowData: createWorkflowSource({
              name: id,
              enabled,
              yaml,
              definition: { name: id, enabled } as WorkflowYaml,
              createdBy: actor,
              lastUpdatedBy: actor,
              spaceId,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            }),
          };
        }
      );
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument).not.toHaveProperty('version');
      expect(crudService.createWorkflowDocument).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.not.objectContaining({ version: expect.anything() })
      );
    });

    it('bumps document.version from the existing document on managed update when versioning is enabled', async () => {
      const definition = createDefinition({ version: 2 });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.isWorkflowVersioningEnabled.mockReturnValue(true);
      mockPrepareReturnsInitialVersion(crudService);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            version: 5,
            definitionHash: 'old-hash',
            managedVersion: 1,
          })
        )
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({
          document: expect.objectContaining({ version: 6 }),
          ifSeqNo: 7,
          ifPrimaryTerm: 13,
        })
      );

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.version).toBe(6);

      expect(crudService.logWorkflowChangesAfterWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: WorkflowChangeHistoryAction.workflowUpdate,
          spaceId: SPACE_ID,
          workflows: [
            expect.objectContaining({
              id: WORKFLOW_ID,
              document: expect.objectContaining({ version: 6 }),
            }),
          ],
        })
      );
    });

    it('preserves existing version in change history when workflow versioning is disabled on managed update', async () => {
      const definition = createDefinition({ version: 2 });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.isWorkflowVersioningEnabled.mockReturnValue(false);
      mockPrepareReturnsInitialVersion(crudService);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            version: 5,
            definitionHash: 'old-hash',
            managedVersion: 1,
          })
        )
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({
          document: expect.objectContaining({ version: 5 }),
        })
      );

      expect(crudService.logWorkflowChangesAfterWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: WorkflowChangeHistoryAction.workflowUpdate,
          workflows: [
            expect.objectContaining({
              document: expect.objectContaining({ version: 5 }),
            }),
          ],
        })
      );
    });

    it('logs workflow install to change history after creating a managed workflow', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.logWorkflowChangesAfterWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: WorkflowChangeHistoryAction.workflowInstall,
          spaceId: SPACE_ID,
          workflows: [
            expect.objectContaining({
              id: WORKFLOW_ID,
              document: expect.objectContaining({ managed: true }),
            }),
          ],
        })
      );
    });

    it('preserves the stored enabled state when enablement is restorable', async () => {
      const definition = createDefinition({
        yaml: workflowYaml({ enabled: true }),
        management: { enablement: 'restorable', versionStrategy: 'auto' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            enabled: false,
            yaml: workflowYaml({ enabled: false }),
            definitionHash: 'old-hash',
          })
        )
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.enabled).toBe(false);
      expect(indexedDocument.definition).toEqual(expect.objectContaining({ enabled: false }));
      expect(indexedDocument.yaml).toContain('enabled: false');
    });

    it('reapplies the definition enabled state when enablement is enforced', async () => {
      const definition = createDefinition({
        yaml: workflowYaml({ enabled: true }),
        management: { enablement: 'enforced', versionStrategy: 'auto' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            enabled: false,
            yaml: workflowYaml({ enabled: false }),
            definitionHash: 'old-hash',
          })
        )
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.enabled).toBe(true);
      expect(indexedDocument.definition).toEqual(expect.objectContaining({ enabled: true }));
      expect(indexedDocument.yaml).toContain('enabled: true');
    });

    it('skips on_adopt updates during the startup window', async () => {
      const definition = createDefinition({
        management: { versionStrategy: 'on_adopt' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(createWorkflowSource({ definitionHash: 'old-hash' }))
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expectNoOccWrites(crudService);
    });

    it('skips on_adopt updates during the startup window even when template values change', async () => {
      const definition = createTemplateDefinition({
        management: { versionStrategy: 'on_adopt' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            definitionHash: definitionHash(definition.yamlTemplate.toString()),
            managedTemplateValues: { recipient: 'Original', enabled: true },
            yaml: workflowYaml({ name: 'Managed Workflow - Original', enabled: true }),
          })
        )
      );

      await service.installManagedWorkflow(
        WORKFLOW_ID,
        { spaceId: SPACE_ID, values: { recipient: 'Changed', enabled: false } },
        definition.pluginId
      );

      expectNoOccWrites(crudService);
    });

    it('applies on_adopt updates after the plugin is ready', async () => {
      const definition = createDefinition({
        management: { versionStrategy: 'on_adopt' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(createWorkflowSource({ definitionHash: 'old-hash' }))
      );

      await service.pluginReady(definition.pluginId);
      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({
          document: expect.any(Object),
          ifSeqNo: expect.any(Number),
          ifPrimaryTerm: expect.any(Number),
        })
      );
      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument).toEqual(
        expect.objectContaining({ definitionHash: definitionHash(definition.yaml) })
      );
    });

    it('short-circuits when the definition hash and template values are unchanged', async () => {
      const definition = createTemplateDefinition();
      const templateValues: TemplateValues = { recipient: 'World', enabled: true };
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            definitionHash: definitionHash(definition.yamlTemplate.toString()),
            managedTemplateValues: templateValues,
          })
        )
      );

      await service.installManagedWorkflow(
        WORKFLOW_ID,
        { spaceId: SPACE_ID, values: templateValues },
        definition.pluginId
      );

      expectNoOccWrites(crudService);
    });

    it('reindexes when the definition version changed but the hash is unchanged', async () => {
      const definition = createDefinition({ version: 2 });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            definitionHash: definitionHash(definition.yaml),
            managedVersion: 1,
          })
        )
      );

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument).toEqual(expect.objectContaining({ managedVersion: 2 }));
      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({
          document: expect.any(Object),
          ifSeqNo: expect.any(Number),
          ifPrimaryTerm: expect.any(Number),
        })
      );
    });

    it('re-renders and reindexes when template values change', async () => {
      const definition = createTemplateDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(
          createWorkflowSource({
            definitionHash: definitionHash(definition.yamlTemplate.toString()),
            managedTemplateValues: { recipient: 'World', enabled: true },
          })
        )
      );

      await service.installManagedWorkflow(
        WORKFLOW_ID,
        { spaceId: SPACE_ID, values: { recipient: 'Elastic', enabled: true } },
        definition.pluginId
      );

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.managedTemplateValues).toEqual({
        recipient: 'Elastic',
        enabled: true,
      });
      expect(indexedDocument.yaml).toContain('Managed Workflow - Elastic');
      expect(indexedDocument.enabled).toBe(true);
    });

    it('throws after exhausting version-conflict retries', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, logger, service } = createService();
      wireOccAwareCrudWrites(crudService, logger);
      const conflictError = Object.assign(new Error('conflict'), { statusCode: 409 });
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);
      crudService.indexWorkflowDocument.mockRejectedValue(conflictError);

      await expect(
        service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId)
      ).rejects.toBeInstanceOf(WorkflowConflictError);
      expect(crudService.createWorkflowDocument).toHaveBeenCalledTimes(3);
      expect(crudService.indexWorkflowDocument).toHaveBeenCalledTimes(3);
    });
  });

  describe('installManagedWorkflow with OccWriter', () => {
    it('retries managed create through the outer install loop when create hits a conflict', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, logger, service } = createService();
      wireOccAwareCrudWrites(crudService, logger);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);

      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      crudService.indexWorkflowDocument
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ seqNo: 1, primaryTerm: 1 });

      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.createWorkflowDocument).toHaveBeenCalledTimes(2);
      expect(crudService.indexWorkflowDocument).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`retrying install for '${WORKFLOW_ID}'`)
      );
    });

    it('re-prepares managed updates from fresh existing after an OCC write conflict', async () => {
      const definition = createDefinition({
        version: 2,
        yaml: workflowYaml({ name: 'Updated Managed Workflow' }),
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, logger, service } = createService();
      wireOccAwareCrudWrites(crudService, logger);

      const existingEnabled = createWorkflowSource({
        managedVersion: 1,
        definitionHash: definitionHash(createDefinition().yaml),
        enabled: true,
      });
      const existingDisabled = createWorkflowSource({
        ...existingEnabled,
        enabled: false,
        yaml: workflowYaml({ enabled: false }),
      });

      const versionedReads = [
        createVersionedDocument(existingEnabled, { seqNo: 1, primaryTerm: 1 }),
        createVersionedDocument(existingDisabled, { seqNo: 2, primaryTerm: 1 }),
      ];
      let readIndex = 0;
      crudService.getWorkflowDocumentWithVersion.mockImplementation(async () => {
        const document = versionedReads[readIndex];
        readIndex += 1;
        return document;
      });

      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      crudService.indexWorkflowDocument
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ seqNo: 3, primaryTerm: 1 });

      await service.pluginReady(definition.pluginId);
      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.getWorkflowDocumentWithVersion).toHaveBeenCalledTimes(2);
      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledTimes(2);
      expect(crudService.indexWorkflowDocument).toHaveBeenCalledTimes(2);
      expect(getLastIndexedDocument(crudService).enabled).toBe(false);
    });

    it('uses optimistic OCC write with version metadata from the install pre-read', async () => {
      const definition = createDefinition({
        version: 2,
        yaml: workflowYaml({ name: 'Updated Managed Workflow' }),
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, logger, service } = createService();
      wireOccAwareCrudWrites(crudService, logger);

      const existingEnabled = createWorkflowSource({
        managedVersion: 1,
        definitionHash: definitionHash(createDefinition().yaml),
        enabled: true,
      });
      const existingDisabled = createWorkflowSource({
        ...existingEnabled,
        enabled: false,
        yaml: workflowYaml({ enabled: false }),
      });

      const versionedReads = [
        createVersionedDocument(existingEnabled, { seqNo: 1, primaryTerm: 1 }),
        createVersionedDocument(existingDisabled, { seqNo: 2, primaryTerm: 1 }),
      ];
      let readIndex = 0;
      crudService.getWorkflowDocumentWithVersion.mockImplementation(async () => {
        const document = versionedReads[readIndex];
        readIndex += 1;
        return document;
      });

      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      crudService.indexWorkflowDocument
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ seqNo: 3, primaryTerm: 1 });

      await service.pluginReady(definition.pluginId);
      await service.installManagedWorkflow(WORKFLOW_ID, { spaceId: SPACE_ID }, definition.pluginId);

      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenNthCalledWith(
        1,
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({ ifSeqNo: 1, ifPrimaryTerm: 1 })
      );
      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenNthCalledWith(
        2,
        WORKFLOW_ID,
        SPACE_ID,
        expect.objectContaining({ ifSeqNo: 2, ifPrimaryTerm: 1 })
      );
    });
  });

  describe('getManagedWorkflowStatus', () => {
    it('returns intact when the installed managed workflow matches the registry', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          definitionHash: definitionHash(definition.yaml),
          managedVersion: definition.version,
          originManagedWorkflowId: definition.id,
        })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status).toEqual({
        status: 'intact',
        workflowId: WORKFLOW_ID,
        definitionId: WORKFLOW_ID,
        spaceId: SPACE_ID,
        installed: true,
        enabled: true,
        valid: true,
        managedBy: PLUGIN_ID,
        storedVersion: 1,
        registryVersion: 1,
        storedHash: definitionHash(definition.yaml),
        registryHash: definitionHash(definition.yaml),
      });
      expect(crudService.getWorkflowDocumentSource).toHaveBeenCalledWith(WORKFLOW_ID, SPACE_ID, {
        includeDeleted: true,
        includeGlobal: true,
      });
    });

    it('returns missing when the workflow document does not exist', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(null);

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status).toEqual(
        expect.objectContaining({
          status: 'missing',
          installed: false,
          enabled: null,
          valid: null,
          managedBy: null,
          storedVersion: null,
          storedHash: null,
        })
      );
    });

    it('returns missing when the workflow document is soft-deleted', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({ deleted_at: new Date('2024-01-02T00:00:00.000Z') })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status.status).toBe('missing');
      expect(status.installed).toBe(false);
    });

    it('returns disabled when the installed managed workflow is disabled', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          enabled: false,
          definitionHash: definitionHash(definition.yaml),
          managedVersion: definition.version,
          originManagedWorkflowId: definition.id,
        })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status.status).toBe('disabled');
      expect(status.enabled).toBe(false);
    });

    it('returns invalid before disabled when the document has no valid definition', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          enabled: false,
          valid: false,
          definition: null,
          definitionHash: definitionHash(definition.yaml),
          managedVersion: definition.version,
          originManagedWorkflowId: definition.id,
        })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status.status).toBe('invalid');
      expect(status.valid).toBe(false);
    });

    it('returns drifted when the stored hash or version differs from the registry', async () => {
      const definition = createDefinition({ version: 2 });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          definitionHash: 'old-hash',
          managedVersion: 1,
          originManagedWorkflowId: definition.id,
        })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status).toEqual(
        expect.objectContaining({
          status: 'drifted',
          storedVersion: 1,
          registryVersion: 2,
          storedHash: 'old-hash',
          registryHash: definitionHash(definition.yaml),
        })
      );
    });

    it('returns not_managed when a non-managed workflow exists at the resolved id', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          managed: false,
          managedBy: null,
          managedVersion: null,
          definitionHash: null,
          originManagedWorkflowId: null,
        })
      );

      const status = await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID },
        definition.pluginId
      );

      expect(status).toEqual(
        expect.objectContaining({
          status: 'not_managed',
          installed: true,
          managedBy: null,
          storedVersion: null,
          storedHash: null,
        })
      );
    });

    it('resolves explicit workflowId and workflowIdSuffix options', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          definitionHash: definitionHash(definition.yaml),
          managedVersion: definition.version,
          originManagedWorkflowId: definition.id,
        })
      );

      await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID, workflowId: `${WORKFLOW_ID}-custom` },
        definition.pluginId
      );
      await service.getManagedWorkflowStatus(
        WORKFLOW_ID,
        { spaceId: SPACE_ID, workflowIdSuffix: 'tenant-a' },
        definition.pluginId
      );

      expect(crudService.getWorkflowDocumentSource).toHaveBeenNthCalledWith(
        1,
        `${WORKFLOW_ID}-custom`,
        SPACE_ID,
        {
          includeDeleted: true,
          includeGlobal: true,
        }
      );
      expect(crudService.getWorkflowDocumentSource).toHaveBeenNthCalledWith(
        2,
        `${WORKFLOW_ID}-tenant-a`,
        SPACE_ID,
        {
          includeDeleted: true,
          includeGlobal: true,
        }
      );
    });

    it('throws clearly for unknown managed workflow ids', async () => {
      mockManagedWorkflowDefinitions = [];
      const { service } = createService();

      await expect(
        service.getManagedWorkflowStatus(WORKFLOW_ID, { spaceId: SPACE_ID }, PLUGIN_ID)
      ).rejects.toThrow(`Unknown managed workflow id: ${WORKFLOW_ID}`);
    });

    it('validates definition ownership before querying stored workflow state', async () => {
      const definition = createDefinition({ pluginId: 'otherPlugin' });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();

      await expect(
        service.getManagedWorkflowStatus(WORKFLOW_ID, { spaceId: SPACE_ID }, PLUGIN_ID)
      ).rejects.toThrow(
        `Managed workflow '${WORKFLOW_ID}' is owned by plugin 'otherPlugin' but was registered by '${PLUGIN_ID}'`
      );
      expect(crudService.getWorkflowDocumentSource).not.toHaveBeenCalled();
    });
  });

  describe('pluginReady', () => {
    it('deletes only static managed docs that were not installed during the startup window', async () => {
      const installedDefinition = createDefinition({ id: 'system-installed' });
      const orphanDefinition = createDefinition({ id: 'system-orphan' });
      const dynamicDefinition = createDefinition({
        id: 'system-dynamic',
        management: { lifecycle: 'dynamic', versionStrategy: 'on_adopt' },
      });
      mockManagedWorkflowDefinitions = [installedDefinition, orphanDefinition, dynamicDefinition];
      const { crudService, service } = createService();

      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(null);
      await service.installManagedWorkflow(
        installedDefinition.id as ManagedWorkflowId,
        { spaceId: SPACE_ID },
        PLUGIN_ID
      );
      crudService.createWorkflowDocument.mockClear();
      crudService.writeWorkflowDocumentWithOcc.mockClear();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: installedDefinition.id,
          source: createWorkflowSource({
            originManagedWorkflowId: installedDefinition.id,
          }),
        },
        {
          id: orphanDefinition.id,
          source: createWorkflowSource({
            originManagedWorkflowId: orphanDefinition.id,
          }),
        },
        {
          id: dynamicDefinition.id,
          source: createWorkflowSource({
            originManagedWorkflowId: dynamicDefinition.id,
            lifecycle: 'dynamic',
          }),
        },
      ]);

      await service.pluginReady(PLUGIN_ID);

      expect(crudService.getManagedWorkflowDocumentsAllSpaces).toHaveBeenCalledWith({
        pluginId: PLUGIN_ID,
      });
      expect(crudService.deleteWorkflows).toHaveBeenCalledTimes(1);
      expect(crudService.deleteWorkflows).toHaveBeenCalledWith(['system-orphan'], SPACE_ID, {
        force: true,
      });
    });

    it('auto-updates dynamic workflows with auto version strategy at startup', async () => {
      const definition = createDefinition({
        id: 'system-dynamic',
        version: 2,
        yaml: workflowYaml({ name: 'Updated Dynamic Workflow', enabled: true }),
        management: {
          lifecycle: 'dynamic',
          versionStrategy: 'auto',
          enablement: 'restorable',
        },
      });
      const existingSource = createWorkflowSource({
        enabled: false,
        yaml: workflowYaml({ name: 'Old Dynamic Workflow', enabled: false }),
        definition: { name: 'Old Dynamic Workflow', enabled: false } as WorkflowYaml,
        definitionHash: 'old-hash',
        lifecycle: 'dynamic',
        managedVersion: 1,
        originManagedWorkflowId: definition.id,
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: definition.id,
          source: existingSource,
        },
      ]);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(existingSource)
      );

      await service.pluginReady(PLUGIN_ID);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.enabled).toBe(false);
      expect(indexedDocument.lifecycle).toBe('dynamic');
      expect(indexedDocument.managedVersion).toBe(2);
      expect(indexedDocument.definitionHash).toBe(definitionHash(definition.yaml));
      expect(indexedDocument.yaml).toContain('name: Updated Dynamic Workflow');
      expect(indexedDocument.yaml).toContain('enabled: false');
      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        definition.id,
        SPACE_ID,
        expect.objectContaining({
          document: expect.any(Object),
          ifSeqNo: expect.any(Number),
          ifPrimaryTerm: expect.any(Number),
        })
      );
    });

    it('preserves template values when auto-updating dynamic workflows at startup', async () => {
      const definition = createTemplateDefinition({
        id: 'system-dynamic-template',
        management: { lifecycle: 'dynamic', versionStrategy: 'auto' },
      });
      const templateValues: TemplateValues = { recipient: 'Persisted Override', enabled: false };
      const existingSource = createWorkflowSource({
        enabled: false,
        yaml: workflowYaml({ name: 'Old Dynamic Workflow', enabled: false }),
        definition: { name: 'Old Dynamic Workflow', enabled: false } as WorkflowYaml,
        definitionHash: 'old-hash',
        lifecycle: 'dynamic',
        managedTemplateValues: templateValues,
        originManagedWorkflowId: definition.id,
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: `${definition.id}-instance`,
          source: existingSource,
        },
      ]);
      crudService.getWorkflowDocumentWithVersion.mockResolvedValue(
        createVersionedDocument(existingSource)
      );

      await service.pluginReady(PLUGIN_ID);

      const indexedDocument = getIndexedDocument(crudService);
      expect(indexedDocument.managedTemplateValues).toEqual(templateValues);
      expect(indexedDocument.yaml).toContain('Managed Workflow - Persisted Override');
      expect(indexedDocument.yaml).toContain('enabled: false');
      expect(crudService.writeWorkflowDocumentWithOcc).toHaveBeenCalledWith(
        `${definition.id}-instance`,
        SPACE_ID,
        expect.objectContaining({
          document: expect.any(Object),
          ifSeqNo: expect.any(Number),
          ifPrimaryTerm: expect.any(Number),
        })
      );
    });

    it('does not auto-update dynamic workflows with on_adopt version strategy at startup', async () => {
      const definition = createDefinition({
        id: 'system-dynamic',
        version: 2,
        management: { lifecycle: 'dynamic', versionStrategy: 'on_adopt' },
      });
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, service } = createService();

      await service.pluginReady(PLUGIN_ID);

      expect(crudService.getManagedWorkflowDocumentsAllSpaces).not.toHaveBeenCalled();
      expectNoOccWrites(crudService);
    });

    it('does not update on_adopt templated dynamic workflows during startup reconciliation', async () => {
      const autoDefinition = createDefinition({
        id: 'system-dynamic-auto',
        management: { lifecycle: 'dynamic', versionStrategy: 'auto' },
      });
      const onAdoptDefinition = createTemplateDefinition({
        id: 'system-dynamic-on-adopt',
        management: { lifecycle: 'dynamic', versionStrategy: 'on_adopt' },
      });
      const templateValues: TemplateValues = { recipient: 'Persisted Override', enabled: false };
      mockManagedWorkflowDefinitions = [autoDefinition, onAdoptDefinition];
      const { crudService, service } = createService();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: `${onAdoptDefinition.id}-instance`,
          source: createWorkflowSource({
            enabled: false,
            definitionHash: 'old-hash',
            lifecycle: 'dynamic',
            managedTemplateValues: templateValues,
            originManagedWorkflowId: onAdoptDefinition.id,
          }),
        },
      ]);

      await service.pluginReady(PLUGIN_ID);

      expect(crudService.getWorkflowDocumentWithVersion).not.toHaveBeenCalled();
      expectNoOccWrites(crudService);
    });

    it('is idempotent when called more than once', async () => {
      const definition = createDefinition();
      mockManagedWorkflowDefinitions = [definition];
      const { crudService, logger, service } = createService();

      await service.pluginReady(PLUGIN_ID);
      await service.pluginReady(PLUGIN_ID);

      expect(crudService.getManagedWorkflowDocumentsAllSpaces).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Managed workflows: plugin '${PLUGIN_ID}' called ready() more than once. Ignoring.`
      );
    });
  });

  describe('cleanupUnregisteredOrphans', () => {
    it('deletes managed docs whose owner or definition is no longer registered', async () => {
      const knownDefinition = createDefinition({ id: 'system-known' });
      mockManagedWorkflowDefinitions = [knownDefinition];
      const { crudService, service } = createService();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: 'system-known',
          source: createWorkflowSource({
            managedBy: PLUGIN_ID,
            originManagedWorkflowId: knownDefinition.id,
          }),
        },
        {
          id: 'system-unregistered-owner',
          source: createWorkflowSource({
            managedBy: 'removedPlugin',
            originManagedWorkflowId: knownDefinition.id,
          }),
        },
        {
          id: 'system-removed-definition',
          source: createWorkflowSource({
            managedBy: PLUGIN_ID,
            originManagedWorkflowId: 'system-removed',
          }),
        },
        {
          id: 'system-missing-owner',
          source: createWorkflowSource({
            managedBy: null,
            originManagedWorkflowId: knownDefinition.id,
            spaceId: 'other-space',
          }),
        },
        {
          id: 'system-missing-definition',
          source: createWorkflowSource({
            managedBy: PLUGIN_ID,
            originManagedWorkflowId: null,
            spaceId: 'other-space',
          }),
        },
      ]);

      await service.cleanupUnregisteredOrphans([PLUGIN_ID]);

      expect(crudService.getManagedWorkflowDocumentsAllSpaces).toHaveBeenCalledWith({
        includeDeleted: true,
      });
      expect(crudService.deleteWorkflows).toHaveBeenCalledTimes(2);
      expect(crudService.deleteWorkflows).toHaveBeenCalledWith(
        ['system-unregistered-owner', 'system-removed-definition'],
        SPACE_ID,
        { force: true }
      );
      expect(crudService.deleteWorkflows).toHaveBeenCalledWith(
        ['system-missing-owner', 'system-missing-definition'],
        'other-space',
        { force: true }
      );
    });

    it('does not delete managed docs for registered owners with known definitions', async () => {
      const staticDefinition = createDefinition({ id: 'system-static' });
      const dynamicDefinition = createDefinition({
        id: 'system-dynamic',
        management: { lifecycle: 'dynamic' },
      });
      mockManagedWorkflowDefinitions = [staticDefinition, dynamicDefinition];
      const { crudService, service } = createService();
      crudService.getManagedWorkflowDocumentsAllSpaces.mockResolvedValue([
        {
          id: staticDefinition.id,
          source: createWorkflowSource({
            managedBy: PLUGIN_ID,
            originManagedWorkflowId: staticDefinition.id,
          }),
        },
        {
          id: dynamicDefinition.id,
          source: createWorkflowSource({
            managedBy: PLUGIN_ID,
            originManagedWorkflowId: dynamicDefinition.id,
            lifecycle: 'dynamic',
          }),
        },
      ]);

      await service.cleanupUnregisteredOrphans([PLUGIN_ID]);

      expect(crudService.deleteWorkflows).not.toHaveBeenCalled();
    });
  });

  describe('executeManagedWorkflow', () => {
    it('executes a global managed workflow from a tenant space using tenant execution context', async () => {
      const definition = createDefinition();
      const request = {} as KibanaRequest;
      const { crudService, workflowsExecutionEngine, service } = createService();
      mockManagedWorkflowDefinitions = [definition];
      crudService.getWorkflowDocumentSource.mockResolvedValue(
        createWorkflowSource({
          spaceId: '*',
          definition: { name: 'Managed Workflow', enabled: true } as WorkflowYaml,
        })
      );

      const executionId = await service.executeManagedWorkflow(
        WORKFLOW_ID,
        request,
        {
          spaceId: SPACE_ID,
          inputs: { foo: 'bar' },
          triggeredBy: 'test',
          metadata: { source: 'unit-test' },
        },
        definition.pluginId
      );

      expect(executionId).toBe('execution-1');
      expect(crudService.getWorkflowDocumentSource).toHaveBeenCalledWith(WORKFLOW_ID, SPACE_ID, {
        includeGlobal: true,
      });
      expect(workflowsExecutionEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining<Partial<WorkflowExecutionEngineModel>>({
          id: WORKFLOW_ID,
          managed: true,
          managedBy: PLUGIN_ID,
          originManagedWorkflowId: WORKFLOW_ID,
          managedVersion: 1,
        }),
        {
          spaceId: SPACE_ID,
          inputs: { foo: 'bar' },
          triggeredBy: 'test',
          metadata: { source: 'unit-test' },
        },
        request
      );
    });
  });
});
