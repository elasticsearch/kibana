/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, KibanaRequest } from '@kbn/core/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { CasesClient } from '../client';
import type { CasesServerStartDependencies } from '../types';
import { searchCasesTool } from './tools/search_cases';
import { manageCasesTool } from './tools/manage_cases';
import { attachmentsTool } from './tools/attachment_tools';
import { observablesTool } from './tools/observable_tools';
import { casesSkill } from './skills/cases_skill';
import { createCaseAttachmentType } from './attachments/case_attachment_type';
import { createCasesAttachmentType } from './attachments/cases_attachment_type';

/**
 * Registers all Cases agent builder tools:
 *
 * 1. `platform.core.cases` — read/search (get by ID, bulk get, find similar, by alert IDs, search/filter)
 * 2. `platform.core.cases.manage` — create, update, delete, assign, unassign, add tags, set custom field
 * 3. `platform.core.cases.attachments` — add comment/alerts/events, get all attachments
 * 4. `platform.core.cases.observables` — add, update, delete observables
 */
export function registerCasesAgentBuilderTools(
  agentBuilder: AgentBuilderPluginSetup,
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>,
  coreSetup: CoreSetup<CasesServerStartDependencies>
): void {
  agentBuilder.tools.register(searchCasesTool(coreSetup, getCasesClient));
  agentBuilder.tools.register(manageCasesTool(getCasesClient));
  agentBuilder.tools.register(attachmentsTool(getCasesClient));
  agentBuilder.tools.register(observablesTool(getCasesClient));
  agentBuilder.skills.register(casesSkill);
  agentBuilder.attachments.registerType(
    createCaseAttachmentType() as Parameters<typeof agentBuilder.attachments.registerType>[0]
  );
  agentBuilder.attachments.registerType(
    createCasesAttachmentType() as Parameters<typeof agentBuilder.attachments.registerType>[0]
  );
}
