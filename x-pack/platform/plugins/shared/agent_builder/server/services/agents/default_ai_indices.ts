/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderDefaultAiIndexId } from '@kbn/agent-builder-common';
import { smlAiIndexDescription, smlIndexName } from '@kbn/agent-builder-sml-plugin/server';

export interface DefaultAiIndex {
  esqlTarget: string;
  description: string;
}

/**
 * The AI Indices every chat agent gets by default, keyed by Context Engine id.
 *
 * Chat agent base configuration derives from these keys. Prompt catalog resolves defaults through
 * Context Engine like any other id; these values are only a fallback when no resolver is available.
 */
export const defaultAiIndices: Record<string, DefaultAiIndex> = {
  [agentBuilderDefaultAiIndexId]: {
    esqlTarget: smlIndexName,
    description: smlAiIndexDescription,
  },
};
