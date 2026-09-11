/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';
import { DEFAULT_MODEL as BEDROCK_DEFAULT_MODEL } from '@kbn/connector-schemas/bedrock/constants';
import { DEFAULT_MODEL as GEMINI_DEFAULT_MODEL } from '@kbn/connector-schemas/gemini/constants';
import { DEFAULT_MODEL as OPENAI_DEFAULT_MODEL } from '@kbn/connector-schemas/openai/constants';
import { SERVICE_SETTINGS, TASK_SETTINGS } from '@kbn/inference-common';
import { GEMINI, DOCUMENTATION_BASE as DOCUMENTATION } from './translations';
import type { InternalOverrideFieldsType } from './types/types';
import { FieldType } from './types/types';

export enum ServiceProviderKeys {
  'alibabacloud-ai-search' = 'alibabacloud-ai-search',
  amazonbedrock = 'amazonbedrock',
  'amazon_sagemaker' = 'amazon_sagemaker',
  anthropic = 'anthropic',
  azureaistudio = 'azureaistudio',
  azureopenai = 'azureopenai',
  cohere = 'cohere',
  deepseek = 'deepseek',
  elastic = 'elastic',
  elasticsearch = 'elasticsearch',
  googleaistudio = 'googleaistudio',
  googlevertexai = 'googlevertexai',
  groq = 'groq',
  hugging_face = 'hugging_face',
  jinaai = 'jinaai',
  mistral = 'mistral',
  openai = 'openai',
  voyageai = 'voyageai',
  watsonxai = 'watsonxai',
  ai21 = 'ai21',
  llama = 'llama',
  contextualai = 'contextualai',
  fireworksai = 'fireworksai',
  nvidia = 'nvidia',
}

export const GEMINI_REGION_DOC_LINK = (
  <EuiLink
    data-test-subj="gemini-vertexai-api-doc"
    href="https://cloud.google.com/vertex-ai/docs/reference/rest#rest_endpoints"
    external
    rel="noopener nofollow noreferrer"
  >
    {`${GEMINI} ${DOCUMENTATION}`}
  </EuiLink>
);

export const GEMINI_PROJECT_ID_DOC_LINK = (
  <EuiLink
    data-test-subj="gemini-api-doc"
    href="https://cloud.google.com/vertex-ai/docs/start/cloud-environment"
    external
    rel="noopener nofollow noreferrer"
  >
    {`${GEMINI} ${DOCUMENTATION}`}
  </EuiLink>
);

export const serviceProviderLinkComponents: Partial<
  Record<ServiceProviderKeys, Record<string, React.ReactNode>>
> = {
  [ServiceProviderKeys.googlevertexai]: {
    location: GEMINI_REGION_DOC_LINK,
    project_id: GEMINI_PROJECT_ID_DOC_LINK,
  },
};

export const DEFAULT_TASK_TYPE = 'completion';
export const CHAT_COMPLETION_TASK_TYPE = 'chat_completion';
export const internalProviderKeys: Array<ServiceProviderKeys | string> = [
  ServiceProviderKeys.elasticsearch,
];

export const MAX_NUMBER_OF_ALLOCATIONS = 'max_number_of_allocations';
export const CONTEXT_WINDOW_LENGTH = 'contextWindowLength';
export { SERVICE_SETTINGS, TASK_SETTINGS };
export const TASK_TYPE_CONFIG = 'taskTypeConfig';
export const PROVIDER_CONFIG = 'providerConfig';
export const PROVIDER_SECRETS = 'providerSecrets';

// This is a temporaray solution to handle the internal overrides for field configurations that have not been updated in the services endpoint
// defaultValues can be used to set default values for model_id fields for providers
export const INTERNAL_OVERRIDE_FIELDS: InternalOverrideFieldsType = {
  [ServiceProviderKeys.elasticsearch]: {
    hidden: ['num_allocations', 'num_threads'],
    additional: [
      {
        [MAX_NUMBER_OF_ALLOCATIONS]: {
          default_value: null,
          description:
            'Maximum scaling limit available to the endpoint. Max allocations will determine the maximum number of VCUs that the endpoint can scale up to.',
          label: 'Max scaling limit (allocations)',
          required: false,
          sensitive: false,
          supported_task_types: ['text_embedding', 'sparse_embedding', 'rerank'],
          type: FieldType.INTEGER,
          updatable: true,
        },
      },
    ],
    serverlessOnly: true,
  },
  // Default model values for providers
  [ServiceProviderKeys.openai]: {
    defaultValues: { model_id: OPENAI_DEFAULT_MODEL },
    supplementalData: [
      {
        headers: {
          location: TASK_SETTINGS,
        },
      },
    ],
  },
  [ServiceProviderKeys.anthropic]: {
    supplementalData: [
      {
        max_tokens: {
          location: TASK_SETTINGS,
        },
      },
    ],
  },
  [ServiceProviderKeys.amazonbedrock]: {
    defaultValues: { model: BEDROCK_DEFAULT_MODEL },
  },
  [ServiceProviderKeys.googlevertexai]: {
    defaultValues: { model_id: GEMINI_DEFAULT_MODEL },
  },
  [ServiceProviderKeys.googleaistudio]: {
    defaultValues: { model_id: GEMINI_DEFAULT_MODEL },
  },
  [ServiceProviderKeys.mistral]: {
    hidden: ['max_input_tokens'],
  },
};
