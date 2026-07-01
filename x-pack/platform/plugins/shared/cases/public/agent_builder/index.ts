/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import {
  CASE_ATTACHMENT_TYPE,
  CASES_ATTACHMENT_TYPE,
} from '../../common/types/agent_builder/attachment_schemas';
import { createCaseAttachmentDefinition } from './attachments/case_attachment_definition';
import { createCasesAttachmentDefinition } from './attachments/cases_attachment_definition';

interface RegisterCasesAgentBuilderAttachmentsArgs {
  attachments: AttachmentServiceStartContract;
  application: ApplicationStart;
}

export const registerCasesAgentBuilderAttachments = ({
  attachments,
  application,
}: RegisterCasesAgentBuilderAttachmentsArgs): void => {
  attachments.addAttachmentType(
    CASE_ATTACHMENT_TYPE,
    createCaseAttachmentDefinition({ application })
  );
  attachments.addAttachmentType(
    CASES_ATTACHMENT_TYPE,
    createCasesAttachmentDefinition({ application })
  );
};
