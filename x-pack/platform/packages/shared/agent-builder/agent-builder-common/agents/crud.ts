/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentDefinition, AgentConfiguration } from './definition';
import type { AgentAccessControl } from './access_control/types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentListOptions {}

export type AgentCreateRequest = Omit<
  AgentDefinition,
  'type' | 'readonly' | 'created_by' | 'access_control'
> & {
  access_control?: Pick<AgentAccessControl, 'access_mode'>;
};

export type AgentUpdateRequest = Partial<
  Pick<AgentDefinition, 'name' | 'description' | 'labels' | 'avatar_color' | 'avatar_symbol'>
> & {
  access_control?: Pick<AgentAccessControl, 'access_mode'>;
  configuration?: Partial<AgentConfiguration>;
};

export type AgentDeleteRequest = Pick<AgentDefinition, 'id'>;
