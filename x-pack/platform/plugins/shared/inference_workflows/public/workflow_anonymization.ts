/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  createPublicStepDefinition,
  type PublicTriggerDefinition,
} from '@kbn/workflows-extensions/public';
import {
  aiPiiCommonDefinition,
  aroundCompletionTriggerDefinition,
  callSiteProceedCommonDefinition,
  piiRestoreCommonDefinition,
} from '../common/workflow_anonymization';

const loadAgentIcon = () =>
  import('@elastic/eui/es/components/icon/assets/product_agent').then(({ icon }) => ({
    default: icon,
  }));

const AgentIcon = React.lazy(loadAgentIcon);

export const aiPiiStepDefinition = createPublicStepDefinition({
  ...aiPiiCommonDefinition,
  icon: AgentIcon,
});

export const callSiteProceedStepDefinition = createPublicStepDefinition({
  ...callSiteProceedCommonDefinition,
  icon: AgentIcon,
});

export const piiRestoreStepDefinition = createPublicStepDefinition({
  ...piiRestoreCommonDefinition,
  icon: AgentIcon,
});

export const aroundCompletionPublicTriggerDefinition: PublicTriggerDefinition<
  typeof aroundCompletionTriggerDefinition.eventSchema
> = {
  ...aroundCompletionTriggerDefinition,
  icon: AgentIcon,
};
