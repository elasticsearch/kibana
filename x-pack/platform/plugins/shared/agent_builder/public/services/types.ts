/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { AgentBuilderAccessChecker } from './access/access';
import type { AgentBuilderStartDependencies, OpenConversationSidebarReturn } from '../types';
import type { OpenSidebarInternalOptions } from '../sidebar/types';
import type { AgentService } from './agents';
import type { AttachmentsService } from './attachments';
import type { RenderersService } from './renderers';
import type { ChatService } from './chat';
import type { ConversationsService } from './conversations';
import type { DocLinksService } from './doc_links';
import type { ToolsService } from './tools';
import type { SkillsService } from './skills/skills_service';
import type { SmlService } from './sml/sml_service';
import type { PluginsService } from './plugins/plugins_service';
import type { OAuthClientsService } from './oauth_clients';
import type { NavigationService } from './navigation';
import type { EventsService } from './events';

export interface AgentBuilderInternalService {
  agentService: AgentService;
  attachmentsService: AttachmentsService;
  renderersService: RenderersService;
  chatService: ChatService;
  conversationsService: ConversationsService;
  docLinksService: DocLinksService;
  navigationService: NavigationService;
  toolsService: ToolsService;
  skillsService: SkillsService;
  smlService: SmlService;
  pluginsService: PluginsService;
  oauthClientsService: OAuthClientsService;
  startDependencies: AgentBuilderStartDependencies;
  usageCollection?: UsageCollectionSetup;
  accessChecker: AgentBuilderAccessChecker;
  eventsService: EventsService;
  isEarsEnabled: boolean;
  isEarsExperimentalEnabled: boolean;
  openSidebarConversation: (options?: OpenSidebarInternalOptions) => OpenConversationSidebarReturn;
}
