/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AttachmentTypeRegistry } from '../../common/registry';
import type { UnifiedAttachmentType, UnifiedAttachmentTypeSetup } from './types';

export class UnifiedAttachmentTypeRegistry extends AttachmentTypeRegistry<UnifiedAttachmentType> {
  constructor() {
    super('UnifiedAttachmentTypeRegistry');
  }

  public register(attachmentType: UnifiedAttachmentTypeSetup): void {
    const item: UnifiedAttachmentType = {
      id: attachmentType.id,
      schema: attachmentType.schema,
      schemaValidator: attachmentType.schemaValidator,
      workflowSchema: attachmentType.workflowSchema,
      telemetry: attachmentType.telemetry || ((state, stats) => stats),
    };

    super.register(item);
  }
}
