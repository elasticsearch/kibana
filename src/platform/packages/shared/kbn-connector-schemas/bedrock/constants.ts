/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';

export const CONNECTOR_ID = '.bedrock';
export const CONNECTOR_NAME = i18n.translate('connectors.bedrock.title', {
  defaultMessage: 'Amazon Bedrock',
});

export const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
export const DEFAULT_URL = `https://bedrock-runtime.us-east-1.amazonaws.com` as const;

export const DEFAULT_TIMEOUT_MS = 200000;
export const DEFAULT_TOKEN_LIMIT = 8191;

/**
 * Claude 4.7+ models deprecated the temperature parameter.
 *
 * Claude 4.x model IDs follow the pattern claude-{variant}-{major}-{minor}-{date},
 * while Claude 3.x IDs follow claude-{major}-{minor}-{variant}-{date}.
 */
export const claudeModelSupportsTemperature = (modelId?: string): boolean => {
  if (!modelId) return true;
  const match = modelId.toLowerCase().match(/claude-[a-z][\w]*-(\d+)-(\d+)/);
  if (!match || match.length < 3) return true;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return !(major > 4 || (major === 4 && minor >= 7));
};

export enum SUB_ACTION {
  RUN = 'run',
  INVOKE_AI = 'invokeAI',
  INVOKE_AI_RAW = 'invokeAIRaw',
  INVOKE_STREAM = 'invokeStream',
  DASHBOARD = 'getDashboard',
  TEST = 'test',
  BEDROCK_CLIENT_SEND = 'bedrockClientSend',
  CONVERSE = 'converse',
  CONVERSE_STREAM = 'converseStream',
}
