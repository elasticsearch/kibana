/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { createErrorResult, createOtherResult } from '@kbn/agent-builder-server';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { z } from '@kbn/zod/v4';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import {
  EndpointAuthorizationError,
  EndpointHttpError,
  NotFoundError as EndpointNotFoundError,
} from '../../../../endpoint/errors';
import {
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
} from '../domain/impact';
import {
  createEndpointPolicyManagementService,
  type EndpointPolicyManagementService,
} from '../services/endpoint_policy_management_service';
import {
  InvalidEndpointPolicyError,
  POLICY_ERROR_MESSAGES,
  PolicyAmbiguousNameError,
  PolicyNotFoundError,
} from '../services/policy_errors';

export type PolicyToolErrorClass =
  | 'not_authorized'
  | 'not_found'
  | 'ambiguous_name'
  | 'invalid_policy'
  | 'conflict'
  | 'non_writable_path'
  | 'unsupported_operation'
  | 'invalid_input'
  | 'unknown_current_value'
  | 'unknown_error';

export const POLICY_TOOL_ERROR_MESSAGES: Readonly<Record<PolicyToolErrorClass, string>> = {
  ...POLICY_ERROR_MESSAGES,
  non_writable_path: 'Requested policy path is not writable',
  unsupported_operation: 'Requested policy change is not supported',
  invalid_input: 'Requested policy change input is invalid',
  unknown_current_value:
    'Requested policy change cannot be assessed because the current policy value is unknown',
  unknown_error: 'Failed to complete the policy management request',
};

interface CreatePolicyToolOptions<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TResult extends Record<string, unknown>
> {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
  id: string;
  description: string;
  schema: TSchema;
  maxResultTokens?: number;
  run: (
    params: z.infer<TSchema>,
    service: EndpointPolicyManagementService
  ) => Promise<TResult> | TResult;
}

export const classifyPolicyError = (error: unknown): PolicyToolErrorClass => {
  if (error instanceof EndpointAuthorizationError) {
    return 'not_authorized';
  }

  if (error instanceof PolicyNotFoundError || error instanceof EndpointNotFoundError) {
    return 'not_found';
  }

  if (error instanceof PolicyAmbiguousNameError) {
    return 'ambiguous_name';
  }

  if (error instanceof InvalidEndpointPolicyError) {
    return 'invalid_policy';
  }

  if (error instanceof PolicyChangePreparationError) {
    switch (error.code) {
      case POLICY_CHANGE_PREPARATION_ERROR_CODE.non_writable_path:
        return 'non_writable_path';
      case POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation:
        return 'unsupported_operation';
      case POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input:
        return 'invalid_input';
      case POLICY_CHANGE_PREPARATION_ERROR_CODE.unknown_current_value:
        return 'unknown_current_value';
      default:
        return 'unknown_error';
    }
  }

  if (error instanceof EndpointHttpError) {
    if (error.statusCode === 403) {
      return 'not_authorized';
    }
    if (error.statusCode === 404) {
      return 'not_found';
    }
    if (error.statusCode === 409) {
      return 'conflict';
    }
  }

  return 'unknown_error';
};

type PolicyToolOrdinaryErrorMetadata = Record<string, unknown> & {
  error: PolicyToolErrorClass;
  candidates?: never;
  candidates_truncated?: never;
  candidates_total?: never;
};

type PolicyToolAmbiguousNameErrorMetadata = Record<string, unknown> & {
  error: PolicyToolErrorClass;
  candidates: PolicyAmbiguousNameError['candidates'];
  candidates_truncated: PolicyAmbiguousNameError['candidatesTruncated'];
  candidates_total: PolicyAmbiguousNameError['candidatesTotal'];
};

type PolicyToolErrorMetadata =
  | PolicyToolOrdinaryErrorMetadata
  | PolicyToolAmbiguousNameErrorMetadata;

const buildErrorMetadata = (
  error: unknown,
  errorClass: PolicyToolErrorClass
): PolicyToolErrorMetadata => {
  if (error instanceof PolicyAmbiguousNameError) {
    return {
      error: errorClass,
      candidates: error.candidates,
      candidates_truncated: error.candidatesTruncated,
      candidates_total: error.candidatesTotal,
    };
  }

  return { error: errorClass };
};

const toPolicyErrorResult = (error: unknown, logger: Logger, toolId: string) => {
  const errorClass = classifyPolicyError(error);

  if (errorClass === 'unknown_error') {
    logger.error(`Error in ${toolId}: ${error instanceof Error ? error.message : String(error)}`);
  } else {
    logger.debug(`Error in ${toolId}: ${errorClass}`);
  }

  return createErrorResult({
    message: POLICY_TOOL_ERROR_MESSAGES[errorClass],
    metadata: buildErrorMetadata(error, errorClass),
  });
};

export const createPolicyTool = <
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TResult extends Record<string, unknown>
>({
  endpointAppContextService,
  getStartServices,
  id,
  description,
  schema,
  maxResultTokens,
  run,
}: CreatePolicyToolOptions<TSchema, TResult>): BuiltinSkillBoundedTool<TSchema> => ({
  id,
  type: ToolType.builtin,
  description,
  schema,
  ...(maxResultTokens !== undefined ? { maxResultTokens } : {}),
  handler: async (params: z.infer<TSchema>, ctx: ToolHandlerContext) => {
    try {
      const service = createEndpointPolicyManagementService({
        endpointAppContextService,
        getStartServices,
        request: ctx.request,
        spaceId: ctx.spaceId,
      });
      return { results: [createOtherResult(await run(params, service))] };
    } catch (error) {
      return { results: [toPolicyErrorResult(error, ctx.logger, id)] };
    }
  },
});
