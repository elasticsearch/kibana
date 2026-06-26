/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { UnifiedAttachmentTypeRegistry } from '../attachment_framework/unified_attachment_registry';
import { registerCaseWorkflowSteps } from '.';

describe('registerCaseWorkflowSteps', () => {
  const buildRegistryWithComment = () => {
    const registry = new UnifiedAttachmentTypeRegistry();
    registry.register({
      id: 'comment',
      schema: z.object({
        type: z.literal('comment'),
        owner: z.string(),
        data: z.object({ content: z.string() }),
      }),
    });
    return registry;
  };

  const registerWithFlag = (
    isCasesAttachmentsEnabled: boolean,
    registry: UnifiedAttachmentTypeRegistry
  ) => {
    const workflowsExtensions = { registerStepDefinition: jest.fn() };
    const getCasesClient = jest.fn();

    registerCaseWorkflowSteps(
      workflowsExtensions as never,
      getCasesClient as never,
      registry,
      isCasesAttachmentsEnabled
    );

    return workflowsExtensions.registerStepDefinition;
  };

  it('registers generic attachment steps only when unified attachments are enabled', () => {
    const disabled = registerWithFlag(false, buildRegistryWithComment());
    const enabled = registerWithFlag(true, buildRegistryWithComment());

    expect(enabled).toHaveBeenCalledTimes(disabled.mock.calls.length + 2);
  });

  it('skips the generic attachment steps when no authorable attachment type is registered', () => {
    const disabled = registerWithFlag(false, new UnifiedAttachmentTypeRegistry());
    const enabled = registerWithFlag(true, new UnifiedAttachmentTypeRegistry());

    expect(enabled).toHaveBeenCalledTimes(disabled.mock.calls.length);
  });
});
