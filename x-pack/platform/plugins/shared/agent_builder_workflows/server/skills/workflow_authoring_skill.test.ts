/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import { platformCoreTools } from '@kbn/agent-builder-common/tools';
import { workflowAuthoringSkill } from './workflow_authoring_skill';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import { workflowTools } from '../../common/constants';

describe('workflowAuthoringSkill', () => {
  it('passes agent-builder validation', async () => {
    await expect(validateSkillDefinition(workflowAuthoringSkill)).resolves.toBeDefined();
  });

  describe('getRegistryTools', () => {
    it('includes all surviving workflow tools, generate_workflow, and execute_workflow', () => {
      const tools = workflowAuthoringSkill.getRegistryTools!();
      expect(tools).toEqual([
        ...Object.values(workflowTools),
        platformCoreTools.generateWorkflow,
        platformCoreTools.executeWorkflow,
      ]);
    });

    it('does not include the deleted low-level edit tools', () => {
      const tools = workflowAuthoringSkill.getRegistryTools!();
      expect(tools).not.toContain('workflows.workflow_insert_step');
      expect(tools).not.toContain('workflows.workflow_modify_step');
      expect(tools).not.toContain('workflows.workflow_modify_step_property');
      expect(tools).not.toContain('workflows.workflow_modify_property');
      expect(tools).not.toContain('workflows.workflow_delete_step');
      expect(tools).not.toContain('workflows.workflow_set_yaml');
    });
  });

  describe('content', () => {
    it('mentions SML tools for workflow discovery', () => {
      expect(workflowAuthoringSkill.content).toContain('platform.core.sml_search');
      expect(workflowAuthoringSkill.content).toContain('platform.core.sml_attach');
    });

    it('does not reference list_workflows or get_workflow tools', () => {
      expect(workflowAuthoringSkill.content).not.toContain('list_workflows');
      expect(workflowAuthoringSkill.content).not.toContain('get_workflow');
    });

    it('references the workflow attachment type', () => {
      expect(workflowAuthoringSkill.content).toContain(WORKFLOW_YAML_ATTACHMENT_TYPE);
    });

    it('delegates creation and editing to generate_workflow', () => {
      expect(workflowAuthoringSkill.content).toContain(platformCoreTools.generateWorkflow);
    });

    it('instructs to use only the slack2 namespace for Slack steps', () => {
      expect(workflowAuthoringSkill.content).toContain('ONLY use the `slack2.*` namespace');
      expect(workflowAuthoringSkill.content).toContain('slack2.sendMessage');
      expect(workflowAuthoringSkill.content).not.toMatch(/type: slack$/m);
      expect(workflowAuthoringSkill.content).not.toMatch(/type: slack_api/);
    });

    it('does not document the deleted low-level edit tools', () => {
      expect(workflowAuthoringSkill.content).not.toContain('workflow_insert_step');
      expect(workflowAuthoringSkill.content).not.toContain('workflow_modify_step');
      expect(workflowAuthoringSkill.content).not.toContain('workflow_set_yaml');
    });
  });
});
