/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
};

export const AI_INDEX_COLLECTION_PATH = 'api/context_engine/ai_index';
export const MCP_PATH = 'api/agent_builder/mcp';

export { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
