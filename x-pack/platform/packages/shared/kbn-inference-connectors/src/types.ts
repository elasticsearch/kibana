/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionConnector } from '@kbn/alerts-ui-shared/src/common/types';
import type { OpenAiProviderType } from '@kbn/connector-schemas/openai';
import type { EisInferenceEndpointMetadata } from '@kbn/inference-common';

export type AIConnector = ActionConnector & {
  // related to OpenAI connectors, ex: Azure OpenAI, OpenAI
  apiProvider?: OpenAiProviderType;
  isRecommended?: boolean;
  /** When true, this connector represents an Elastic-managed inference endpoint (EIS). */
  isEis?: boolean;
  /** EIS metadata for the underlying inference endpoint (capabilities, release date, etc.). */
  metadata?: EisInferenceEndpointMetadata;
};
