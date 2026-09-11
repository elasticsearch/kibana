/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { contextEngineAiIndexTools, platformCoreTools } from '@kbn/agent-builder-common/tools';
import { internalNamespaces } from '@kbn/agent-builder-common/base/namespaces';
import { contextEngineSkillAvailability } from '../context_engine_skill_availability';
import content from './ai_index_automations.skill.md.text';
import indexMetadataTemplateYaml from './index_metadata_template.yaml.text';
import entityProfileTemplateYaml from './entity_profile_template.yaml.text';
import documentTemplateYaml from './document_template.yaml.text';

export const aiIndexAutomationsSkill = defineSkillType({
  id: 'ai-index-automations',
  name: 'ai-index-automations',
  basePath: 'skills/platform/context-engine',
  experimental: true,
  availability: contextEngineSkillAvailability,
  description:
    'Read, draft and change the workflow automations that generate Knowledge Indicators for a Context Engine AI Index. Load when authoring a KI generation workflow, when inspecting what an existing automation does, when a proposed fix names a workflow step, or when validating or piloting an automation.',
  content,
  // One runnable workflow per strategy that comes up most. These are the starting point for
  // authoring: an agent handed a template edits it, where one handed only a prose shape writes a
  // workflow from nothing and rediscovers what the template already encodes.
  referencedContent: [
    {
      name: 'index-metadata-template',
      relativePath: '.',
      content: indexMetadataTemplateYaml,
    },
    {
      name: 'entity-profile-template',
      relativePath: '.',
      content: entityProfileTemplateYaml,
    },
    {
      name: 'document-template',
      relativePath: '.',
      content: documentTemplateYaml,
    },
  ],
  // This is the skill that holds the authoring and execution tools. Skill tools are additive, so
  // an agent that only diagnoses an index loads `analyze-and-improve` and stays read-only; loading
  // this one is what grants the ability to write.
  // No `generateWorkflow`: authoring starts from the templates above. Generating a workflow from a
  // description is slower than editing one and lands on a draft that still needs repairing.
  getRegistryTools: () => [
    platformCoreTools.executeWorkflow,
    platformCoreTools.getWorkflowExecutionStatus,
    platformCoreTools.generateEsql,
    platformCoreTools.executeEsql,
    contextEngineAiIndexTools.queryAiIndices,
    `${internalNamespaces.workflows}.validate_workflow`,
    `${internalNamespaces.workflows}.get_workflow`,
    `${internalNamespaces.workflows}.get_step_definitions`,
    `${internalNamespaces.workflows}.get_trigger_definitions`,
    `${internalNamespaces.workflows}.get_examples`,
    `${internalNamespaces.workflows}.get_connectors`,
    `${internalNamespaces.workflows}.workflow_execute_step`,
  ],
});
