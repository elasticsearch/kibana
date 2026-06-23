/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as Rx from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import type { AIChatExperience } from '@kbn/ai-assistant-common';
import { WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows/common/constants';
import { AGENT_BUILDER_NAV_AT_TOP_FLAG } from '@kbn/navigation-plugin/public';
import { ProductLine } from '../../common/product';
import type { SecurityProductTypes } from '../../common/config';
import { type Services } from '../common/services';
import { createAiNavigationTree } from './ai_navigation/ai_navigation_tree';
import { createNavigationTree } from './navigation_tree';

export const registerSolutionNavigation = async (
  services: Services,
  productTypes: SecurityProductTypes
) => {
  const shouldUseAINavigation = productTypes.some(
    (productType) => productType.product_line === ProductLine.aiSoc
  );

  const agentBuilderNavAtTop = services.featureFlags.getBooleanValue(
    AGENT_BUILDER_NAV_AT_TOP_FLAG,
    false
  );

  // Do not pass a defaultOverride: when userValue is unset, get() must use the registered
  // default (e.g. Agent for security spaces from aiAssistantManagementSelection), not Classic.
  const chatExperience$ = services.settings.client.get$<AIChatExperience>(AI_CHAT_EXPERIENCE_TYPE);

  // Get initial chat experience for setting initial navigation tree
  const initialChatExperience = await firstValueFrom(chatExperience$);

  // Same as chat experience: no defaultOverride so unset values use the registered default
  // (workflows:ui:enabled defaults to true in workflows_management).
  const workflowsUiEnabled$ = services.settings.client.get$<boolean>(WORKFLOWS_UI_SETTING_ID);
  const workflowsUiEnabled = await firstValueFrom(workflowsUiEnabled$);

  const navigationTree = shouldUseAINavigation
    ? createAiNavigationTree(
        services,
        initialChatExperience,
        workflowsUiEnabled,
        agentBuilderNavAtTop
      )
    : await createNavigationTree(services, initialChatExperience);

  services.securitySolution.setSolutionNavigationTree(navigationTree);

  services.serverless.initNavigation('security', Rx.of(navigationTree));
};
