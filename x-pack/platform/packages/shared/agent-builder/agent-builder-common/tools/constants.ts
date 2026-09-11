/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from './definition';
import { internalNamespaces } from '../base/namespaces';

const platformCoreTool = <TName extends string>(
  toolName: TName
): `${typeof internalNamespaces.platformCore}.${TName}` => {
  return `${internalNamespaces.platformCore}.${toolName}`;
};

/**
 * Ids of built-in agentBuilder tools
 */
export const platformCoreTools = {
  indexExplorer: platformCoreTool('index_explorer'),
  search: platformCoreTool('search'),
  listIndices: platformCoreTool('list_indices'),
  getIndexMapping: platformCoreTool('get_index_mapping'),
  getDocumentById: platformCoreTool('get_document_by_id'),
  generateEsql: platformCoreTool('generate_esql'),
  generateWorkflow: platformCoreTool('generate_workflow'),
  executeEsql: platformCoreTool('execute_esql'),
  executeWorkflow: platformCoreTool('execute_workflow'),
  createVisualization: platformCoreTool('create_visualization'),
  getWorkflowExecutionStatus: platformCoreTool('get_workflow_execution_status'),
  resumeWorkflowExecution: platformCoreTool('resume_workflow_execution'),
  listWorkflowExecutions: platformCoreTool('list_workflow_executions'),
  productDocumentation: platformCoreTool('product_documentation'),
  cases: platformCoreTool('cases'),
  integrationKnowledge: platformCoreTool('integration_knowledge'),
  // SML tools
  smlSearch: platformCoreTool('sml_search'),
  smlAttach: platformCoreTool('sml_attach'),
  // Connector tools
  executeConnectorSubAction: platformCoreTool('execute_connector_sub_action'),
  listInferenceEndpoints: platformCoreTool('list_inference_endpoints'),
} as const;

const casesTool = <TName extends string>(
  toolName: TName
): `${typeof internalNamespaces.platformCore}.cases.${TName}` => {
  return `${internalNamespaces.platformCore}.cases.${toolName}`;
};

/**
 * Ids of built-in Cases cluster tools, registered by the Cases plugin.
 * All live under `platform.core.cases.*`.
 * The read/search tool uses `platformCoreTools.cases` (`platform.core.cases`).
 */
export const platformCoreCasesTools = {
  manage: casesTool('manage'),
  getAttachments: casesTool('get_attachments'),
  manageAttachments: casesTool('manage_attachments'),
  observables: casesTool('observables'),
  findTemplates: casesTool('find_templates'),
} as const;

/**
 * Sig Events tools should try to follow this naming convention when possible:
 * {namespace}.sig_events.{feature}_{entity}_{action}
 *
 * - {feature} refers to a high-level scope within Sig Events, for example KIs.
 * - {entity} is a more granular entity withing the {feature} scope, for example Feature KI or Query KI.
 * - {action} the action to perform on the entity
 */
export const platformSignificantEventsTools = {
  searchKnowledgeIndicators: `${internalNamespaces.platformSignificantEvents}.ki_search`,
  searchSimilarFeatures: `${internalNamespaces.platformSignificantEvents}.ki_feature_similarity_search`,
  createFeatureKnowledgeIndicator: `${internalNamespaces.platformSignificantEvents}.ki_feature_create`,
  createQueryKnowledgeIndicator: `${internalNamespaces.platformSignificantEvents}.ki_query_create`,
  searchEvent: `${internalNamespaces.platformSignificantEvents}.event_search`,
  createEvent: `${internalNamespaces.platformSignificantEvents}.event_create`,
  updateEventStatus: `${internalNamespaces.platformSignificantEvents}.event_status_update`,
  eventsWrite: `${internalNamespaces.platformSignificantEvents}.events_write`,
  attachInvestigation: `${internalNamespaces.platformStreams}.sig_events.event_investigation_attach`,
  reportInvestigationProgress: `${internalNamespaces.platformStreams}.investigation_progress_report`,
} as const;

export const attachmentTools = {
  read: `${internalNamespaces.attachments}.read`,
  update: `${internalNamespaces.attachments}.update`,
  add: `${internalNamespaces.attachments}.add`,
  list: `${internalNamespaces.attachments}.list`,
  diff: `${internalNamespaces.attachments}.diff`,
};

export const internalTools = {
  runSubagent: 'run_subagent',
  sendMessageToAgent: 'send_message_to_agent',
  sleep: 'sleep',
  writeTodos: 'write_todos',
  loadSkill: 'load_skill',
  searchRelevantSkills: 'search_relevant_skills',
  askUserQuestion: 'ask_user_question',
  readFile: 'read_file',
  listFiles: 'list_files',
  bash: 'bash',
  setConversationMetadata: 'set_conversation_metadata',
  discoverApis: 'discover_apis',
  describeApi: 'describe_api',
  describeApiType: 'describe_api_type',
  executeApi: 'execute_api',
};

export const isAttachmentTool = (toolName: string) =>
  Object.values(attachmentTools).includes(toolName);

/**
 * Legacy filestore tool ids, used to classify these historical tool calls as `internal`.
 */
const LEGACY_FILESTORE_TOOL_IDS = new Set([
  'filestore.read',
  'filestore.ls',
  'filestore.grep',
  'filestore.glob',
]);
const isLegacyFilestoreTool = (toolName: string) => LEGACY_FILESTORE_TOOL_IDS.has(toolName);

const isInternalToolName = (toolName: string) => Object.values(internalTools).includes(toolName);

export const isInternalTool = (toolName: string) =>
  isAttachmentTool(toolName) || isLegacyFilestoreTool(toolName) || isInternalToolName(toolName);

/**
 * Internal tools whose results are still written to the `/tool_calls` filestore.
 */
const filestoreAllowedInternalToolIds = new Set<string>([
  internalTools.discoverApis,
  internalTools.describeApi,
  internalTools.describeApiType,
  internalTools.executeApi,
]);

export const isExcludedFromFilestore = (toolName: string) =>
  isInternalTool(toolName) && !filestoreAllowedInternalToolIds.has(toolName);

/**
 * List of tool types which can be created / edited by a user.
 */
export const editableToolTypes: ToolType[] = [
  ToolType.esql,
  ToolType.index_search,
  ToolType.workflow,
  ToolType.mcp,
];

export const defaultAgentToolIds = [
  platformCoreTools.search,
  platformCoreTools.listIndices,
  platformCoreTools.getIndexMapping,
  platformCoreTools.generateEsql,
  platformCoreTools.executeEsql,
  platformCoreTools.getDocumentById,
  platformCoreTools.getWorkflowExecutionStatus,
  platformCoreTools.resumeWorkflowExecution,
  platformCoreTools.listWorkflowExecutions,
  platformCoreTools.generateWorkflow,
  platformCoreTools.executeWorkflow,
  platformCoreTools.smlSearch,
  platformCoreTools.smlAttach,
  platformCoreTools.executeConnectorSubAction,
  platformCoreTools.productDocumentation,
];

/**
 * The number of active tools that will trigger a warning in the UI.
 * Agent will perform poorly if it has too many tools.
 */
export const activeToolsCountWarningThreshold = 24;
