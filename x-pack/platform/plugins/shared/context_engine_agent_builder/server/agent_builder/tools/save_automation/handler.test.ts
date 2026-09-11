/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AI_INDEX_ATTACHMENT_TYPE } from '../../../../common/agent_builder_attachments';
import { MAX_AI_INDEX_AUTOMATIONS } from '@kbn/context-engine-plugin/common/constants';
import {
  AiIndexConflictError,
  AiIndexManagedError,
} from '@kbn/context-engine-plugin/server/ai_indices/errors';
import type { AiIndexService } from '@kbn/context-engine-plugin/server/ai_indices/service';
import {
  parseWorkflowNameFromYaml,
  resolveAiIndexIdFromAttachments,
  saveAutomationHandler,
  getSaveAutomationErrorMessage,
  tryResolveAiIndexDisplayLabelFromAttachments,
  tryResolveWorkflowDisplayNameFromAttachments,
} from './handler';

jest.mock('../../assert_context_engine_write_access', () => ({
  assertContextEngineWriteAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@kbn/agent-builder-tools-base/workflows', () => ({
  hasWorkflowReadPrivilege: jest.fn().mockResolvedValue(true),
  hasWorkflowCreatePrivilege: jest.fn().mockResolvedValue(true),
  hasWorkflowUpdatePrivilege: jest.fn().mockResolvedValue(true),
  hasWorkflowExecutePrivilege: jest.fn().mockResolvedValue(true),
  executeWorkflow: jest.fn(),
}));

const {
  hasWorkflowReadPrivilege,
  hasWorkflowCreatePrivilege,
  hasWorkflowUpdatePrivilege,
  hasWorkflowExecutePrivilege,
  executeWorkflow,
} = jest.requireMock('@kbn/agent-builder-tools-base/workflows');

const WORKFLOW_ATTACHMENT_ID = 'workflow-attachment-1';
const WORKFLOW_YAML = 'name: pilot\nsteps: []';

const createAttachmentStateManager = ({
  origin,
  yaml = WORKFLOW_YAML,
}: {
  origin?: string;
  yaml?: string;
} = {}) => ({
  getAll: jest.fn().mockReturnValue([
    {
      id: WORKFLOW_ATTACHMENT_ID,
      type: 'workflow.yaml',
      origin,
      current_version: 1,
      versions: [{ version: 1, data: { yaml, workflowId: 'pilot-workflow' } }],
    },
    {
      id: 'ai-index-attachment',
      type: AI_INDEX_ATTACHMENT_TYPE,
      current_version: 1,
      versions: [{ version: 1, data: { id: 'my-ai-index' } }],
    },
  ]),
  updateOrigin: jest.fn().mockResolvedValue(true),
  update: jest.fn().mockResolvedValue({ id: WORKFLOW_ATTACHMENT_ID }),
  add: jest.fn().mockResolvedValue({ id: 'created-attachment' }),
});

describe('resolveAiIndexIdFromAttachments', () => {
  it('returns an explicit aiIndexId when provided', () => {
    expect(
      resolveAiIndexIdFromAttachments(
        [{ type: AI_INDEX_ATTACHMENT_TYPE, data: { id: 'from-attachment' } }],
        'explicit-id'
      )
    ).toBe('explicit-id');
  });

  it('resolves aiIndexId from the ai_index attachment', () => {
    expect(
      resolveAiIndexIdFromAttachments([
        { type: AI_INDEX_ATTACHMENT_TYPE, data: { id: 'from-attachment' } },
      ])
    ).toBe('from-attachment');
  });

  it('throws when no aiIndexId is available', () => {
    expect(() => resolveAiIndexIdFromAttachments([])).toThrow(/No ai_index attachment found/);
  });
});

describe('save automation confirmation labels', () => {
  it('parses workflow names from yaml via the workflows yaml parser', () => {
    expect(parseWorkflowNameFromYaml('name: "Pilot Workflow"\nsteps: []')).toBe('Pilot Workflow');
    expect(parseWorkflowNameFromYaml('name: "My \\"escaped\\" value"\nsteps: []')).toBe(
      'My "escaped" value'
    );
    expect(parseWorkflowNameFromYaml('name: |\n  A multiline\n  name\nsteps: []')).toBe(
      'A multiline\nname\n'
    );
  });

  it('resolves workflow display names from attachments', () => {
    const attachments = createAttachmentStateManager();
    expect(
      tryResolveWorkflowDisplayNameFromAttachments(
        attachments as unknown as Parameters<
          typeof tryResolveWorkflowDisplayNameFromAttachments
        >[0],
        WORKFLOW_ATTACHMENT_ID
      )
    ).toBe('pilot');
  });

  it('resolves ai index display labels from attachments', () => {
    const attachments = createAttachmentStateManager();
    expect(
      tryResolveAiIndexDisplayLabelFromAttachments(
        attachments as unknown as Parameters<typeof tryResolveAiIndexDisplayLabelFromAttachments>[0]
      )
    ).toBe('my-ai-index');
  });
});

describe('getSaveAutomationErrorMessage', () => {
  it('returns error.message for Error instances', () => {
    expect(getSaveAutomationErrorMessage(new AiIndexManagedError('my-ai-index'))).toBe(
      "AI index 'my-ai-index' is managed and cannot be modified via the API"
    );
    expect(getSaveAutomationErrorMessage(new AiIndexConflictError('my-ai-index'))).toContain(
      'my-ai-index'
    );
    expect(
      getSaveAutomationErrorMessage(
        Object.assign(new Error("Workflow with id 'wf-1' already exists"), { statusCode: 409 })
      )
    ).toBe("Workflow with id 'wf-1' already exists");
    expect(
      getSaveAutomationErrorMessage(
        Object.assign(new Error('search failed'), { statusCode: 500, meta: {} })
      )
    ).toBe('search failed');
    expect(
      getSaveAutomationErrorMessage(new Error("Workflow 'wf-1' was not found in this space."))
    ).toBe("Workflow 'wf-1' was not found in this space.");
  });

  it('returns a generic message for non-Error values', () => {
    expect(getSaveAutomationErrorMessage('boom')).toBe(
      'An unexpected error occurred while saving the workflow automation.'
    );
  });
});

describe('saveAutomationHandler', () => {
  const request = httpServerMock.createKibanaRequest();
  const logger = loggingSystemMock.createLogger();
  const getCoreStart = jest.fn();
  const getSecurityStart = jest.fn().mockResolvedValue(undefined);
  let aiIndexService: jest.Mocked<
    Pick<AiIndexService, 'addAutomation' | 'assertCanAcceptAutomation'>
  >;
  let workflowsManagement: {
    getWorkflow: jest.Mock;
    createWorkflow: jest.Mock;
    updateWorkflow: jest.Mock;
    deleteWorkflows: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    hasWorkflowReadPrivilege.mockResolvedValue(true);
    hasWorkflowCreatePrivilege.mockResolvedValue(true);
    hasWorkflowUpdatePrivilege.mockResolvedValue(true);
    hasWorkflowExecutePrivilege.mockResolvedValue(true);
    executeWorkflow.mockResolvedValue({
      success: true,
      execution: { execution_id: 'exec-1' },
    });

    aiIndexService = {
      addAutomation: jest.fn(),
      assertCanAcceptAutomation: jest.fn().mockResolvedValue(undefined),
    };
    workflowsManagement = {
      getWorkflow: jest.fn().mockResolvedValue({ id: 'wf-new', enabled: true }),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn().mockResolvedValue({ id: 'wf-new', enabled: true }),
      deleteWorkflows: jest.fn().mockResolvedValue({ total: 1, deleted: 1, failures: [] }),
    };
    getCoreStart.mockResolvedValue({});
  });

  it('creates the workflow and attaches it to the AI index', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    const result = await saveAutomationHandler({
      params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(hasWorkflowCreatePrivilege).toHaveBeenCalled();
    // The draft names itself 'pilot-workflow', but supplying that id on create turns a clash with
    // any other space — or a soft-deleted tombstone — into a conflict that fails the save. The
    // server derives an id from the workflow name and disambiguates it instead.
    expect(workflowsManagement.createWorkflow).toHaveBeenCalledWith(
      { yaml: WORKFLOW_YAML },
      'default',
      request
    );
    expect(aiIndexService.assertCanAcceptAutomation).toHaveBeenCalledWith(
      'my-ai-index',
      'default',
      undefined
    );
    expect(aiIndexService.addAutomation).toHaveBeenCalledWith('my-ai-index', 'default', {
      type: 'workflow',
      value: 'wf-new',
    });
    expect(attachments.updateOrigin).toHaveBeenCalledWith(
      WORKFLOW_ATTACHMENT_ID,
      'wf-new',
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-new',
      status: 'saved_and_attached',
    });
  });

  it('updates an already persisted workflow before attaching', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');

    const attachments = createAttachmentStateManager({ origin: 'wf-persisted' });

    const result = await saveAutomationHandler({
      params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(aiIndexService.assertCanAcceptAutomation).toHaveBeenCalledWith(
      'my-ai-index',
      'default',
      { type: 'workflow', value: 'wf-persisted' }
    );
    expect(hasWorkflowUpdatePrivilege).toHaveBeenCalled();
    expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
      'wf-persisted',
      { yaml: WORKFLOW_YAML },
      'default',
      request
    );
    expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
    expect(attachments.updateOrigin).not.toHaveBeenCalled();
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-persisted',
      status: 'saved_and_attached',
    });
  });

  it('returns saved_and_attached when updating a workflow that is already linked', async () => {
    aiIndexService.addAutomation.mockResolvedValue('already_attached');

    const attachments = createAttachmentStateManager({ origin: 'wf-persisted' });

    const result = await saveAutomationHandler({
      params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
      'wf-persisted',
      { yaml: WORKFLOW_YAML },
      'default',
      request
    );
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-persisted',
      status: 'saved_and_attached',
    });
  });

  it('attaches an already saved workflow by id', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');

    const attachments = createAttachmentStateManager();

    const result = await saveAutomationHandler({
      params: { workflowId: 'wf-new' },
      request,
      spaceId: 'marketing',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(hasWorkflowReadPrivilege).toHaveBeenCalled();
    expect(aiIndexService.assertCanAcceptAutomation).toHaveBeenCalledWith(
      'my-ai-index',
      'marketing',
      { type: 'workflow', value: 'wf-new' }
    );
    expect(aiIndexService.addAutomation).toHaveBeenCalledWith('my-ai-index', 'marketing', {
      type: 'workflow',
      value: 'wf-new',
    });
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-new',
      status: 'attached',
    });
    expect(workflowsManagement.getWorkflow).toHaveBeenCalledWith('wf-new', 'marketing');
    expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
  });

  describe('run after save', () => {
    const save = (params: Parameters<typeof saveAutomationHandler>[0]['params']) =>
      saveAutomationHandler({
        params,
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      });

    beforeEach(() => {
      aiIndexService.addAutomation.mockResolvedValue('attached');
      workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });
    });

    it('does not run the automation unless asked to', async () => {
      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID });

      expect(executeWorkflow).not.toHaveBeenCalled();
      expect(result.run).toBeUndefined();
    });

    it('starts the run without waiting, and returns the execution id to poll', async () => {
      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 'wf-new', waitForCompletion: false })
      );
      expect(result.run).toEqual({ started: true, executionId: 'exec-1' });
      expect(result.status).toBe('saved_and_attached');
    });

    it('enables a disabled definition, since it cannot be run by id otherwise', async () => {
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-new', enabled: false });

      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
        'wf-new',
        { enabled: true },
        'default',
        request
      );
      expect(result.run).toEqual({
        started: true,
        executionId: 'exec-1',
        enabledForRun: true,
      });
    });

    it('reports why enabling was refused rather than executing into "workflow is disabled"', async () => {
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-new', enabled: false });
      workflowsManagement.updateWorkflow.mockResolvedValue({
        id: 'wf-new',
        enabled: false,
        validationErrors: ['Workflow has no valid definition'],
      });

      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(executeWorkflow).not.toHaveBeenCalled();
      expect(result.status).toBe('saved_and_attached');
      expect(result.run).toEqual({
        started: false,
        reason:
          "Workflow 'wf-new' is saved but could not be enabled, so it was not run. Workflow has no valid definition",
      });
    });

    it('treats a workflow with no enabled flag as one that still needs enabling', async () => {
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-new' });

      await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
        'wf-new',
        { enabled: true },
        'default',
        request
      );
    });

    it('leaves an already enabled definition alone', async () => {
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-new', enabled: true });

      await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(workflowsManagement.updateWorkflow).not.toHaveBeenCalledWith(
        'wf-new',
        { enabled: true },
        'default',
        request
      );
    });

    it('does not enable a disabled workflow for a caller who cannot update it', async () => {
      // Reached by attaching an already-saved workflow, where nothing else on the path needs the
      // update privilege — so enabling would be the one write the caller was never checked for.
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-existing', enabled: false });
      hasWorkflowUpdatePrivilege.mockResolvedValue(false);

      const result = await save({ workflowId: 'wf-existing', run: true });

      expect(workflowsManagement.updateWorkflow).not.toHaveBeenCalled();
      expect(executeWorkflow).not.toHaveBeenCalled();
      expect(result.status).toBe('attached');
      expect(result.run).toEqual({
        started: false,
        reason: expect.stringContaining('update privilege'),
      });
    });

    it('keeps the save when the caller cannot execute workflows', async () => {
      hasWorkflowExecutePrivilege.mockResolvedValue(false);

      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(executeWorkflow).not.toHaveBeenCalled();
      expect(result.status).toBe('saved_and_attached');
      expect(result.run).toEqual({
        started: false,
        reason: expect.stringContaining('execute privilege is required'),
      });
    });

    it('keeps the saved workflow when the run fails rather than rolling it back', async () => {
      executeWorkflow.mockResolvedValue({ success: false, error: 'boom' });

      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
      expect(result.status).toBe('saved_and_attached');
      expect(result.run).toEqual({ started: false, reason: 'boom' });
    });

    it('keeps the saved workflow when starting the run throws', async () => {
      executeWorkflow.mockRejectedValue(new Error('engine unavailable'));

      const result = await save({ workflowAttachmentId: WORKFLOW_ATTACHMENT_ID, run: true });

      expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
      expect(result.status).toBe('saved_and_attached');
      expect(result.run).toEqual({ started: false, reason: 'engine unavailable' });
    });

    it('runs a workflow that was attached by id', async () => {
      const result = await save({ workflowId: 'wf-existing', run: true });

      expect(executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 'wf-existing', waitForCompletion: false })
      );
      expect(result).toEqual({
        aiIndexId: 'my-ai-index',
        workflowId: 'wf-existing',
        status: 'attached',
        run: { started: true, executionId: 'exec-1' },
      });
    });
  });

  describe('overwriting a named workflow with a new definition', () => {
    const REPLACEMENT_YAML = 'name: replacement\nsteps: []';

    const overwrite = (
      attachments: ReturnType<typeof createAttachmentStateManager>,
      params: Parameters<typeof saveAutomationHandler>[0]['params'] = {
        workflowYaml: REPLACEMENT_YAML,
        workflowId: 'wf-persisted',
      }
    ) =>
      saveAutomationHandler({
        params,
        request,
        spaceId: 'default',
        attachments: attachments as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      });

    beforeEach(() => {
      aiIndexService.addAutomation.mockResolvedValue('already_attached');
      workflowsManagement.getWorkflow.mockResolvedValue({ id: 'wf-persisted', enabled: true });
    });

    it('replaces the named workflow rather than saving another one beside it', async () => {
      const result = await overwrite(createAttachmentStateManager());

      expect(hasWorkflowUpdatePrivilege).toHaveBeenCalled();
      expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
        'wf-persisted',
        { yaml: REPLACEMENT_YAML },
        'default',
        request
      );
      expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        aiIndexId: 'my-ai-index',
        workflowId: 'wf-persisted',
        status: 'saved_and_attached',
      });
    });

    it('refuses to overwrite a workflow that is gone, and says what to do instead', async () => {
      workflowsManagement.getWorkflow.mockResolvedValue(null);

      await expect(overwrite(createAttachmentStateManager())).rejects.toThrow(
        /Workflow 'wf-persisted' was not found in this space, so there is nothing to overwrite\. Omit workflowId/
      );
      expect(workflowsManagement.updateWorkflow).not.toHaveBeenCalled();
      expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
    });

    it('does not delete the workflow it overwrote when attaching then fails', async () => {
      aiIndexService.addAutomation.mockRejectedValue(new AiIndexManagedError('my-ai-index'));

      await expect(overwrite(createAttachmentStateManager())).rejects.toBeInstanceOf(
        AiIndexManagedError
      );

      // The rollback exists to undo a workflow this call brought into existence. An overwritten
      // one predates the call, and deleting it would destroy what the user already had.
      expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
    });

    it('refreshes an attachment left holding the definition that was replaced', async () => {
      const attachments = createAttachmentStateManager({
        origin: 'wf-persisted',
        yaml: 'name: superseded\nsteps: []',
      });

      await overwrite(attachments);

      // Left alone, a later save from this attachment would quietly restore the old definition.
      expect(attachments.update).toHaveBeenCalledWith(
        WORKFLOW_ATTACHMENT_ID,
        { data: { yaml: REPLACEMENT_YAML, workflowId: 'wf-persisted', name: 'replacement' } },
        ATTACHMENT_REF_ACTOR.agent
      );
    });

    it('leaves an attachment alone when it already holds what was saved', async () => {
      const attachments = createAttachmentStateManager({
        origin: 'wf-persisted',
        yaml: REPLACEMENT_YAML,
      });

      await overwrite(attachments);

      expect(attachments.update).not.toHaveBeenCalled();
      expect(attachments.add).not.toHaveBeenCalled();
    });

    it('gives the conversation an attachment for a workflow it has none for', async () => {
      const attachments = createAttachmentStateManager();

      await overwrite(attachments);

      expect(attachments.add).toHaveBeenCalledWith(
        {
          type: 'workflow.yaml',
          data: { yaml: REPLACEMENT_YAML, workflowId: 'wf-persisted', name: 'replacement' },
          origin: 'wf-persisted',
        },
        ATTACHMENT_REF_ACTOR.agent
      );
    });

    it('still reports the save when the stale attachment cannot be refreshed', async () => {
      const attachments = createAttachmentStateManager({
        origin: 'wf-persisted',
        yaml: 'name: superseded\nsteps: []',
      });
      attachments.update.mockRejectedValue(new Error('Cannot update deleted attachment'));

      const result = await overwrite(attachments);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('still holds the definition it replaced')
      );
      expect(result.workflowId).toBe('wf-persisted');
    });

    it('takes an explicit id over the workflow the attachment was last saved as', async () => {
      const attachments = createAttachmentStateManager({ origin: 'wf-from-attachment' });

      await overwrite(attachments, {
        workflowAttachmentId: WORKFLOW_ATTACHMENT_ID,
        workflowId: 'wf-persisted',
      });

      expect(workflowsManagement.updateWorkflow).toHaveBeenCalledWith(
        'wf-persisted',
        { yaml: WORKFLOW_YAML },
        'default',
        request
      );
      expect(attachments.updateOrigin).toHaveBeenCalledWith(
        WORKFLOW_ATTACHMENT_ID,
        'wf-persisted',
        ATTACHMENT_REF_ACTOR.agent
      );
    });

    it('rejects when the caller cannot update the workflow it named', async () => {
      hasWorkflowUpdatePrivilege.mockResolvedValue(false);

      await expect(overwrite(createAttachmentStateManager())).rejects.toThrow(
        /Unauthorized to update workflow 'wf-persisted'/
      );
      expect(workflowsManagement.updateWorkflow).not.toHaveBeenCalled();
    });
  });

  it('rejects attaching a workflow id that does not exist', async () => {
    workflowsManagement.getWorkflow.mockResolvedValue(null);

    await expect(
      saveAutomationHandler({
        params: { workflowId: 'wf-missing' },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/Workflow 'wf-missing' was not found/);
  });

  it('rejects when the caller lacks workflow read privilege', async () => {
    hasWorkflowReadPrivilege.mockResolvedValue(false);

    await expect(
      saveAutomationHandler({
        params: { workflowId: 'wf-new' },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/Unauthorized to reference workflow 'wf-new'/);
  });

  it('rejects when the caller lacks workflow create privilege', async () => {
    hasWorkflowCreatePrivilege.mockResolvedValue(false);

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/Unauthorized to create a workflow/);
  });

  it('rejects when the caller lacks workflow update privilege', async () => {
    hasWorkflowUpdatePrivilege.mockResolvedValue(false);

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager({ origin: 'wf-persisted' }) as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/Unauthorized to update workflow 'wf-persisted'/);
  });

  it('continues when updateOrigin fails after creating a workflow', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });

    const attachments = createAttachmentStateManager();
    attachments.updateOrigin.mockResolvedValue(false);

    const result = await saveAutomationHandler({
      params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('attachment origin could not be recorded')
    );
    expect(aiIndexService.addAutomation).toHaveBeenCalled();
    expect(attachments.updateOrigin).toHaveBeenCalledWith(
      WORKFLOW_ATTACHMENT_ID,
      'wf-new',
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-new',
      status: 'saved_and_attached',
    });
  });

  it('returns already_attached when the workflow is already linked', async () => {
    aiIndexService.addAutomation.mockResolvedValue('already_attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-existing', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    const result = await saveAutomationHandler({
      params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(result.status).toBe('already_attached');
  });

  it('rejects managed AI indices before creating a workflow', async () => {
    aiIndexService.assertCanAcceptAutomation.mockRejectedValue(
      new AiIndexManagedError('my-ai-index')
    );
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: attachments as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toBeInstanceOf(AiIndexManagedError);

    expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
    expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
    expect(aiIndexService.addAutomation).not.toHaveBeenCalled();
    expect(attachments.updateOrigin).not.toHaveBeenCalled();
  });

  it('rejects when the automation limit is reached before creating a workflow', async () => {
    aiIndexService.assertCanAcceptAutomation.mockRejectedValue(
      new Error(
        `AI index "my-ai-index" already has the maximum number of automations (${MAX_AI_INDEX_AUTOMATIONS}).`
      )
    );
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: attachments as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/maximum number of automations/);

    expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
    expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
    expect(aiIndexService.addAutomation).not.toHaveBeenCalled();
    expect(attachments.updateOrigin).not.toHaveBeenCalled();
  });

  it('rejects managed AI indices before attaching by workflow id', async () => {
    aiIndexService.assertCanAcceptAutomation.mockRejectedValue(
      new AiIndexManagedError('my-ai-index')
    );

    await expect(
      saveAutomationHandler({
        params: { workflowId: 'wf-new' },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toBeInstanceOf(AiIndexManagedError);

    expect(aiIndexService.addAutomation).not.toHaveBeenCalled();
  });

  it('does not roll back workflows created in the edit flow when attach fails', async () => {
    aiIndexService.assertCanAcceptAutomation.mockRejectedValue(
      new AiIndexManagedError('my-ai-index')
    );

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager({ origin: 'wf-persisted' }) as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toBeInstanceOf(AiIndexManagedError);

    expect(workflowsManagement.createWorkflow).not.toHaveBeenCalled();
    expect(workflowsManagement.updateWorkflow).not.toHaveBeenCalled();
    expect(workflowsManagement.deleteWorkflows).not.toHaveBeenCalled();
    expect(aiIndexService.addAutomation).not.toHaveBeenCalled();
  });

  it('saves yaml handed in directly and attaches the workflow', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-authored', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    const result = await saveAutomationHandler({
      params: { workflowYaml: WORKFLOW_YAML },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(hasWorkflowCreatePrivilege).toHaveBeenCalled();
    expect(workflowsManagement.createWorkflow).toHaveBeenCalledWith(
      { yaml: WORKFLOW_YAML },
      'default',
      request
    );
    expect(result).toEqual({
      aiIndexId: 'my-ai-index',
      workflowId: 'wf-authored',
      status: 'saved_and_attached',
    });
  });

  it('creates a workflow attachment linked to the saved workflow so a later edit updates it', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-authored', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    await saveAutomationHandler({
      params: { workflowYaml: WORKFLOW_YAML },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(attachments.add).toHaveBeenCalledWith(
      {
        type: 'workflow.yaml',
        data: { yaml: WORKFLOW_YAML, workflowId: 'wf-authored', name: 'pilot' },
        origin: 'wf-authored',
      },
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(attachments.updateOrigin).not.toHaveBeenCalled();
  });

  it('still reports the save when the workflow attachment cannot be created', async () => {
    aiIndexService.addAutomation.mockResolvedValue('attached');
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-authored', name: 'pilot' });

    const attachments = createAttachmentStateManager();
    attachments.add.mockRejectedValue(new Error('Unknown attachment type: workflow.yaml'));

    const result = await saveAutomationHandler({
      params: { workflowYaml: WORKFLOW_YAML },
      request,
      spaceId: 'default',
      attachments: attachments as never,
      logger,
      getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement: () => workflowsManagement as never,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no workflow attachment could be created')
    );
    expect(result.workflowId).toBe('wf-authored');
  });

  it('rolls back a workflow created from yaml when attach fails', async () => {
    aiIndexService.addAutomation.mockRejectedValue(new AiIndexManagedError('my-ai-index'));
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-authored', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    await expect(
      saveAutomationHandler({
        params: { workflowYaml: WORKFLOW_YAML },
        request,
        spaceId: 'default',
        attachments: attachments as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toBeInstanceOf(AiIndexManagedError);

    expect(workflowsManagement.deleteWorkflows).toHaveBeenCalledWith(
      ['wf-authored'],
      'default',
      request
    );
    expect(attachments.add).not.toHaveBeenCalled();
  });

  it('rejects when no workflow source is provided', async () => {
    await expect(
      saveAutomationHandler({
        params: {},
        request,
        spaceId: 'default',
        attachments: createAttachmentStateManager() as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toThrow(/Provide either workflowAttachmentId, workflowYaml or workflowId/);
  });

  it('rolls back a newly created workflow when attach fails after pre-check', async () => {
    aiIndexService.addAutomation.mockRejectedValue(new AiIndexManagedError('my-ai-index'));
    workflowsManagement.createWorkflow.mockResolvedValue({ id: 'wf-new', name: 'pilot' });

    const attachments = createAttachmentStateManager();

    await expect(
      saveAutomationHandler({
        params: { workflowAttachmentId: WORKFLOW_ATTACHMENT_ID },
        request,
        spaceId: 'default',
        attachments: attachments as never,
        logger,
        getAiIndexService: async () => aiIndexService as unknown as AiIndexService,
        getCoreStart,
        getSecurityStart,
        getWorkflowsManagement: () => workflowsManagement as never,
      })
    ).rejects.toBeInstanceOf(AiIndexManagedError);

    expect(workflowsManagement.createWorkflow).toHaveBeenCalled();
    expect(workflowsManagement.deleteWorkflows).toHaveBeenCalledWith(
      ['wf-new'],
      'default',
      request
    );
    expect(attachments.updateOrigin).not.toHaveBeenCalled();
  });
});
