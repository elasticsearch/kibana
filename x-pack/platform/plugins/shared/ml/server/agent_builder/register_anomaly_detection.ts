/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../common/license';
import type { MlFeatures } from '../../common/constants/app';
import type { MlAuthorizationService } from '../lib/capabilities/check_capabilities';
import type { MlClientFactoryDeps } from './ml_client_factory';
import { createMlClientFactory, createDataRecognizerFactory } from './ml_client_factory';
import { createAnomalyDetectionSkill } from './skills/anomaly_detection';
import {
  createAnomalySwimLaneAttachmentType,
  createAnomalyChartsAttachmentType,
  createSingleMetricViewerAttachmentType,
} from './attachment_types';

export const registerAnomalyDetectionAgentBuilder = ({
  agentBuilder,
  resolveMlCapabilities,
  authorization,
  mlLicense,
  enabledFeatures,
  mlClientFactoryDeps,
}: {
  agentBuilder: AgentBuilderPluginSetup;
  resolveMlCapabilities: ResolveMlCapabilities;
  authorization?: MlAuthorizationService;
  mlLicense?: MlLicense;
  enabledFeatures?: MlFeatures;
  mlClientFactoryDeps: MlClientFactoryDeps;
}): void => {
  const buildMlClient = createMlClientFactory(mlClientFactoryDeps);
  const buildDataRecognizer = createDataRecognizerFactory(mlClientFactoryDeps);

  agentBuilder.attachments.registerType(
    createAnomalySwimLaneAttachmentType() as AttachmentTypeDefinition
  );
  agentBuilder.attachments.registerType(
    createAnomalyChartsAttachmentType() as AttachmentTypeDefinition
  );
  agentBuilder.attachments.registerType(
    createSingleMetricViewerAttachmentType() as AttachmentTypeDefinition
  );

  agentBuilder.skills.register(
    createAnomalyDetectionSkill(
      resolveMlCapabilities,
      authorization,
      mlLicense,
      enabledFeatures,
      buildMlClient,
      buildDataRecognizer
    )
  );
};
