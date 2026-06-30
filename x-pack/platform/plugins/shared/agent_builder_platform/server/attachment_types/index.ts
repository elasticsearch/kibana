/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { CoreSetup } from '@kbn/core-lifecycle-server';
import { createTextAttachmentType } from './text';
import { createEsqlAttachmentType } from './esql';
import { createScreenContextAttachmentType } from './screen_context';
import { createVisualizationAttachmentType } from './visualization';
import { createGraphAttachmentType } from './graph';
import { createConnectorAttachmentType } from './connector';
import { createConnectorSetupAttachmentType } from './connector_setup';
import { createSkillAttachmentType } from './skill';
import type {
  AgentBuilderPlatformPluginStart,
  PluginSetupDependencies,
  PluginStartDependencies,
} from '../types';

export const registerAttachmentTypes = ({
  coreSetup,
  setupDeps,
}: {
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>;
  setupDeps: PluginSetupDependencies;
}) => {
  const { agentBuilder } = setupDeps;

  const attachmentTypes: AttachmentTypeDefinition<any, any>[] = [
    createTextAttachmentType(),
    createScreenContextAttachmentType(),
    createEsqlAttachmentType(),
    createVisualizationAttachmentType(),
    createGraphAttachmentType(),
    createConnectorAttachmentType(),
    createConnectorSetupAttachmentType(),
    createSkillAttachmentType(),
  ];

  attachmentTypes.forEach((attachmentType) => {
    agentBuilder.attachments.registerType(attachmentType);
  });
};
