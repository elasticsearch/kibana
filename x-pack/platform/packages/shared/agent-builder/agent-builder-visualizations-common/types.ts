/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { VISUALIZATION_ATTACHMENT_TYPE } from './constants';
import type { VisualizationAttachmentData } from './visualization_types';

export type VisualizationAttachment = Attachment<
  typeof VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData
>;