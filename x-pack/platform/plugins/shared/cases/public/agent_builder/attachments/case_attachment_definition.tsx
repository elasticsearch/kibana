/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AttachmentUIDefinition } from '@kbn/agent-builder-browser';
import { createCaseInlineContent, type CaseAttachment } from './case_inline_content';

interface Services {
  application: ApplicationStart;
}

export const createCaseAttachmentDefinition = (
  services: Services
): AttachmentUIDefinition<CaseAttachment> => {
  const InlineContent = createCaseInlineContent(services);
  return {
    getLabel: (attachment) => attachment.data.title,
    getIcon: () => 'briefcase',
    renderInlineContent: (props) => <InlineContent {...props} />,
  };
};
