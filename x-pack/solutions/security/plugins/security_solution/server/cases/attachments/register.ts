/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesServerSetup } from '@kbn/cases-plugin/server';

import type { ExperimentalFeatures } from '../../../common/experimental_features';
import { getEndpointAttachmentType } from './endpoint';
import { getEventAttachmentType } from './event';
import { getIndicatorAttachmentType } from './indicator';
import { getEntityAttachmentType } from './entity';
import { getTimelineAttachmentType } from './timeline';

export const registerCaseAttachments = (
  attachmentFramework: CasesServerSetup['attachmentFramework'],
  experimentalFeatures: ExperimentalFeatures
): void => {
  attachmentFramework.registerUnified(getEndpointAttachmentType());
  attachmentFramework.registerUnified(getEventAttachmentType());
  attachmentFramework.registerUnified(getIndicatorAttachmentType());
  if (experimentalFeatures.entityAttachmentsEnabled) {
    attachmentFramework.registerUnified(getEntityAttachmentType());
  }
  attachmentFramework.registerUnified(getTimelineAttachmentType());
};
