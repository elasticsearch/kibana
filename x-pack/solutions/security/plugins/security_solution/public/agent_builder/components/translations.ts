/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ADD_TO_CHAT = i18n.translate(
  'xpack.securitySolution.agentBuilder.addToChatButtonLabel',
  {
    defaultMessage: 'Add to chat',
  }
);

export const UPGRADE_TO_ENTERPRISE_TO_USE_AGENT_BUILDER_CHAT = i18n.translate(
  'xpack.securitySolution.agentBuilder.upgradeToEnterpriseToUseAgentBuilderChatTooltip',
  {
    defaultMessage: 'Upgrade your license to use Agent builder chat.',
  }
);

export const NON_ESQL_RULE_ADD_TO_CHAT_DISABLED_TOOLTIP = i18n.translate(
  'xpack.securitySolution.agentBuilder.nonEsqlRuleAddToChatDisabledTooltip',
  {
    defaultMessage: 'AI rule creation is only supported for ES|QL rules.',
  }
);

export const getNonEsqlRuleActionDisabledReason = (ruleTypeLabel: string) =>
  i18n.translate('xpack.securitySolution.agentBuilder.ruleAttachment.nonEsqlDisabledReason', {
    defaultMessage: 'AI rule creation is only supported for ES|QL rules. This rule is {ruleType}.',
    values: { ruleType: ruleTypeLabel },
  });
