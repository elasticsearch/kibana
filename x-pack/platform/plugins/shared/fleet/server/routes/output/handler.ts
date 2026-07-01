/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler, SavedObjectsClientContract } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';

import Boom from '@hapi/boom';

import { isEqual } from 'lodash';

import {
  SERVERLESS_DEFAULT_OUTPUT_ID,
  SERVERLESS_PRIVATE_OUTPUT_ID,
  outputType,
} from '../../../common/constants';

import type {
  DeleteOutputRequestSchema,
  GetLatestOutputHealthRequestSchema,
  GetOneOutputRequestSchema,
  PostOutputRequestSchema,
  PutOutputRequestSchema,
} from '../../types';
import type {
  DeleteOutputResponse,
  GetOneOutputResponse,
  GetOutputsResponse,
  Output,
  PostLogstashApiKeyResponse,
} from '../../../common/types';
import { outputService } from '../../services/output';
import { FleetUnauthorizedError } from '../../errors';
import { agentPolicyService, appContextService } from '../../services';
import { generateLogstashApiKey, canCreateLogstashApiKey } from '../../services/api_keys';
import { throwIfSslPathInvalid } from '../utils/ssl_utils';

function validateOutputSslPaths(output: Partial<Output>) {
  throwIfSslPathInvalid([
    ...(output.ssl?.certificate_authorities ?? []),
    output.ssl?.certificate,
    output.ssl?.key,
    output.secrets?.ssl?.key,
  ]);
}

function ensureNoDuplicateSecrets(output: Partial<Output>) {
  if (output.type === outputType.Kafka && output?.password && output?.secrets?.password) {
    throw Boom.badRequest('Cannot specify both password and secrets.password');
  }
  if (output.ssl?.key && output.secrets?.ssl?.key) {
    throw Boom.badRequest('Cannot specify both ssl.key and secrets.ssl.key');
  }
  if (output.type === outputType.RemoteElasticsearch) {
    if (output.service_token && output.secrets?.service_token) {
      throw Boom.badRequest('Cannot specify both service_token and secrets.service_token');
    }
  }
}

export const getOutputsHandler: RequestHandler = async (context, request, response) => {
  const outputs = await outputService.list();

  const body: GetOutputsResponse = {
    items: outputs.items,
    page: outputs.page,
    perPage: outputs.perPage,
    total: outputs.total,
  };

  return response.ok({ body });
};

export const getOneOutputHandler: RequestHandler<
  TypeOf<typeof GetOneOutputRequestSchema.params>
> = async (context, request, response) => {
  try {
    const output = await outputService.get(request.params.outputId);

    const body: GetOneOutputResponse = {
      item: output,
    };

    return response.ok({ body });
  } catch (error) {
    if (error.isBoom && error.output.statusCode === 404) {
      return response.notFound({
        body: { message: `Output ${request.params.outputId} not found` },
      });
    }

    throw error;
  }
};

export const putOutputHandler: RequestHandler<
  TypeOf<typeof PutOutputRequestSchema.params>,
  undefined,
  TypeOf<typeof PutOutputRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const outputUpdate = request.body;
  try {
    await validateOutputServerless(outputUpdate, soClient, request.params.outputId);
    validateOutputSslPaths(outputUpdate);
    ensureNoDuplicateSecrets(outputUpdate);
    await outputService.update(soClient, esClient, request.params.outputId, outputUpdate);
    const output = await outputService.get(request.params.outputId);
    await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, output.id, {
      isDefault: output.is_default,
      isDefaultMonitoring: output.is_default_monitoring,
    });

    const body: GetOneOutputResponse = {
      item: output,
    };

    return response.ok({ body });
  } catch (error) {
    if (error.isBoom && error.output.statusCode === 404) {
      return response.notFound({
        body: { message: `Output ${request.params.outputId} not found` },
      });
    }

    throw error;
  }
};

export const postOutputHandler: RequestHandler<
  undefined,
  undefined,
  TypeOf<typeof PostOutputRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const { id, ...newOutput } = request.body;
  await validateOutputServerless(newOutput, soClient);
  validateOutputSslPaths(newOutput);
  ensureNoDuplicateSecrets(newOutput);
  const output = await outputService.create(soClient, esClient, newOutput, { id });
  await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, output.id, {
    isDefault: output.is_default,
    isDefaultMonitoring: output.is_default_monitoring,
  });

  const body: GetOneOutputResponse = {
    item: output,
  };

  return response.ok({ body });
};

async function validateOutputServerless(
  output: Partial<Output>,
  soClient: SavedObjectsClientContract,
  outputId?: string
): Promise<void> {
  const cloudSetup = appContextService.getCloud();
  if (!cloudSetup?.isServerlessEnabled) {
    return;
  }
  // Elasticsearch outputs must have the default host URL in serverless.
  // No need to validate on update if hosts are not passed.
  if (outputId && !output.hosts) {
    return;
  }
  const defaultOutput = await outputService.get(SERVERLESS_DEFAULT_OUTPUT_ID);
  let originalOutput;
  if (outputId) {
    originalOutput = await outputService.get(outputId);
  }
  const type = output.type || originalOutput?.type;
  if (type !== outputType.Elasticsearch) {
    return;
  }

  if (isEqual(output.hosts, defaultOutput.hosts)) {
    return;
  }

  try {
    const privateOutput = await outputService.get(SERVERLESS_PRIVATE_OUTPUT_ID);
    if (isEqual(output.hosts, privateOutput.hosts)) {
      return;
    }
  } catch (e) {
    // Private endpoint SO not present — PrivateLink not enabled for this project.
  }

  throw Boom.badRequest(
    `Elasticsearch output host must have default URL in serverless: ${defaultOutput.hosts}`
  );
}

export const deleteOutputHandler: RequestHandler<
  TypeOf<typeof DeleteOutputRequestSchema.params>
> = async (context, request, response) => {
  try {
    await outputService.delete(request.params.outputId);

    const body: DeleteOutputResponse = {
      id: request.params.outputId,
    };

    return response.ok({ body });
  } catch (error) {
    if (error.isBoom && error.output.statusCode === 404) {
      return response.notFound({
        body: { message: `Output ${request.params.outputId} not found` },
      });
    }

    throw error;
  }
};

export const postLogstashApiKeyHandler: RequestHandler = async (context, request, response) => {
  const esClient = (await context.core).elasticsearch.client.asCurrentUser;
  const hasCreatePrivileges = await canCreateLogstashApiKey(esClient);
  if (!hasCreatePrivileges) {
    throw new FleetUnauthorizedError('Missing permissions to create logstash API key');
  }

  const apiKey = await generateLogstashApiKey(esClient);

  const body: PostLogstashApiKeyResponse = {
    // Logstash expect the key to be formatted like this id:key
    api_key: `${apiKey.id}:${apiKey.api_key}`,
  };

  return response.ok({ body });
};

export const getLatestOutputHealth: RequestHandler<
  TypeOf<typeof GetLatestOutputHealthRequestSchema.params>
> = async (context, request, response) => {
  const esClient = (await context.core).elasticsearch.client.asInternalUser;
  const outputHealth = await outputService.getLatestOutputHealth(esClient, request.params.outputId);
  return response.ok({ body: outputHealth });
};
