/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../common/license';
import type { MlAuthorizationService } from '../lib/capabilities/check_capabilities';
import { registerAnomalyDetectionTools } from './tools';
import { createAnomalyDetectionSkill } from './skills/anomaly_detection';

export const registerAnomalyDetectionAgentBuilder = ({
  agentBuilder,
  resolveMlCapabilities,
  authorization,
  mlLicense,
}: {
  agentBuilder: AgentBuilderPluginSetup;
  resolveMlCapabilities: ResolveMlCapabilities;
  authorization?: MlAuthorizationService;
  mlLicense?: MlLicense;
}): void => {
  registerAnomalyDetectionTools(agentBuilder, resolveMlCapabilities, authorization, mlLicense);
  agentBuilder.skills.register(createAnomalyDetectionSkill());
};
