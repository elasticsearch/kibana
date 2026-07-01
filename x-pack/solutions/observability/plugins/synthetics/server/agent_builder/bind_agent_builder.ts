/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { SyntheticsPluginsSetupDependencies } from '../types';
import { createMonitorAttachmentType } from './attachments/monitor_attachment_type';
import { registerSkills } from './skills/register_skills';

export const bindAgentBuilder = ({
  logger,
  plugins,
}: {
  logger: Logger;
  plugins: SyntheticsPluginsSetupDependencies;
}): void => {
  const { agentBuilder } = plugins;
  if (!agentBuilder) {
    return;
  }

  agentBuilder.attachments.registerType(
    createMonitorAttachmentType({ logger }) as AttachmentTypeDefinition
  );

  registerSkills(agentBuilder);

  logger.debug('Registered Synthetics monitor-management skill and monitor attachment type');
};
