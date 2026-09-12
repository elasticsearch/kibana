/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_EVENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { SecurityEventAttachmentPayloadSchema } from '../common/cases/attachments/event';
import { getEventAttachmentType } from './cases/attachments/event';

describe('security.event attachment type', () => {
  it('registers the full-payload zod schema on the unified registry', () => {
    const eventAttachmentType = getEventAttachmentType();

    expect(eventAttachmentType.id).toBe(SECURITY_EVENT_ATTACHMENT_TYPE);
    expect(eventAttachmentType.schema).toBe(SecurityEventAttachmentPayloadSchema);
    expect(eventAttachmentType.workflow?.validateTargets).toBeDefined();
  });
});
