/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup } from '@kbn/core-lifecycle-server';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { productDocumentationTool } from './product_documentation';
import { integrationKnowledgeTool } from './integration_knowledge';
import type {
  AgentBuilderPlatformPluginStart,
  PluginSetupDependencies,
  PluginStartDependencies,
} from '../types';
import { casesTool } from './cases/cases';
import { getDocumentByIdTool } from './get_document_by_id';
import { getIndexMappingsTool } from './get_index_mapping';
import { listIndicesTool } from './list_indices';
import { indexExplorerTool } from './index_explorer';
import { generateEsqlTool } from './generate_esql';
import { executeEsqlTool } from './execute_esql';
import { searchTool } from './search';

export const registerTools = ({
  coreSetup,
  setupDeps,
}: {
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>;
  setupDeps: PluginSetupDependencies;
}) => {
  const { agentBuilder } = setupDeps;

  const tools: Array<BuiltinToolDefinition<any>> = [
    searchTool({ coreSetup, topSnippetsDefaults: agentBuilder.topSnippets }),
    getDocumentByIdTool(),
    executeEsqlTool(),
    generateEsqlTool(),
    getIndexMappingsTool(),
    listIndicesTool(),
    indexExplorerTool(),
    productDocumentationTool(coreSetup),
    integrationKnowledgeTool(coreSetup),
    casesTool(coreSetup),
  ];

  tools.forEach((tool) => {
    agentBuilder.tools.register(tool);
  });
};
