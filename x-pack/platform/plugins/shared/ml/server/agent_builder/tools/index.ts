/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../common/license';
import type { MlAuthorizationService } from '../../lib/capabilities/check_capabilities';
import { createAdGetJobInfoTool } from './ad_get_job_info';
import { createAdCreateJobTool } from './ad_create_job';
import { createAdManageJobStateTool } from './ad_manage_job_state';
import { createAdUpdateJobConfigTool } from './ad_update_job_config';

export {
  AD_GET_JOB_INFO_TOOL_ID,
  AD_CREATE_JOB_TOOL_ID,
  AD_MANAGE_JOB_STATE_TOOL_ID,
  AD_UPDATE_JOB_CONFIG_TOOL_ID,
} from './tool_ids';

export const registerAnomalyDetectionTools = (
  agentBuilder: AgentBuilderPluginSetup,
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense
): void => {
  agentBuilder.tools.register(
    createAdGetJobInfoTool(resolveMlCapabilities, authorization, mlLicense)
  );
  agentBuilder.tools.register(
    createAdCreateJobTool(resolveMlCapabilities, authorization, mlLicense)
  );
  agentBuilder.tools.register(
    createAdManageJobStateTool(resolveMlCapabilities, authorization, mlLicense)
  );
  agentBuilder.tools.register(
    createAdUpdateJobConfigTool(resolveMlCapabilities, authorization, mlLicense)
  );
};
