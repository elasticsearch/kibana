/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';
import {
  agentBuilderDefaultAgentId,
  AgentType,
  getDefaultAgentAccessControl,
} from '@kbn/agent-builder-common';
import type { AgentAccessControl, UserIdAndName } from '@kbn/agent-builder-common';
import type { AgentCreateRequest, AgentUpdateRequest } from '../../../../../common/agents';
import type { AgentConfigurationProperties, AgentProperties } from './storage';
import type { PersistedAgentDefinition } from '../types';
import { normalizeAccessControl } from '../../access_control/persisted';

export type Document = Pick<GetResponse<AgentProperties>, '_id' | '_source'>;

const defaultAgentType = AgentType.chat;

export const fromEs = (document: Document): PersistedAgentDefinition => {
  if (!document._source) {
    throw new Error('No source found on get conversation response');
  }

  const configuration: AgentConfigurationProperties =
    document._source.configuration ?? document._source.config;

  // backward compatibility with M1 - we check the document id.
  const resolvedId = document._source.id ?? document._id;

  return {
    id: resolvedId,
    type: document._source.type,
    name: document._source.name,
    description: document._source.description,
    labels: document._source.labels,
    avatar_color: document._source.avatar_color,
    avatar_symbol: document._source.avatar_symbol,
    access_control: normalizeAccessControl(document._source),
    created_by:
      document._source.created_by_id || document._source.created_by_name
        ? {
            id: document._source.created_by_id,
            username: document._source.created_by_name ?? 'unknown',
          }
        : undefined,
    configuration: {
      instructions: configuration.instructions,
      tools: configuration.tools,
      skill_ids: configuration.skill_ids,
      enable_elastic_capabilities:
        configuration.enable_elastic_capabilities ??
        (resolvedId === agentBuilderDefaultAgentId ? true : undefined),
      workflow_ids: configuration.workflow_ids,
      plugin_ids: configuration.plugin_ids,
      connector_ids: configuration.connector_ids,
    },
  };
};

export const createRequestToEs = ({
  profile,
  user,
  space,
  creationDate,
}: {
  profile: AgentCreateRequest;
  user: UserIdAndName;
  space: string;
  creationDate: Date;
}): AgentProperties => {
  return {
    id: profile.id,
    name: profile.name,
    type: defaultAgentType,
    space,
    description: profile.description,
    labels: profile.labels,
    avatar_color: profile.avatar_color,
    avatar_symbol: profile.avatar_symbol,
    created_by_id: user.id,
    created_by_name: user.username,
    access_control: profile.access_control
      ? { access_mode: profile.access_control.access_mode, entries: [] }
      : getDefaultAgentAccessControl(),
    config: {
      instructions: profile.configuration.instructions,
      tools: profile.configuration.tools,
      skill_ids: profile.configuration.skill_ids,
      enable_elastic_capabilities: profile.configuration.enable_elastic_capabilities,
      workflow_ids: profile.configuration.workflow_ids,
      plugin_ids: profile.configuration.plugin_ids,
      connector_ids: profile.configuration.connector_ids,
    },
    created_at: creationDate.toISOString(),
    updated_at: creationDate.toISOString(),
  };
};

export const updateRequestToEs = ({
  agentId,
  currentProps,
  update,
  updateDate,
}: {
  agentId: string;
  currentProps: AgentProperties;
  update: AgentUpdateRequest;
  updateDate: Date;
}): AgentProperties => {
  const currentConfig = currentProps.configuration ?? currentProps.config;
  const { configuration, access_control, ...restUpdate } = update;
  const currentAccessControl = normalizeAccessControl(currentProps);

  // Strip legacy fields from the persisted doc: `access_control` and `config` are now the source of
  // truth, so any leftover `visibility`/`acl`/`configuration` is migrated into them and discarded.
  const {
    visibility,
    acl,
    configuration: _legacyConfiguration,
    ...restCurrentProps
  } = currentProps;

  const updated: AgentProperties = {
    ...restCurrentProps,
    ...restUpdate,
    id: agentId,
    access_control: access_control
      ? { ...currentAccessControl, access_mode: access_control.access_mode }
      : currentAccessControl,
    config: {
      ...currentConfig,
      ...configuration,
    },
    updated_at: updateDate.toISOString(),
  };

  return updated;
};

export const accessControlUpdateToEs = ({
  currentProps,
  access_control,
  updateDate,
}: {
  currentProps: AgentProperties;
  access_control: AgentAccessControl;
  updateDate: Date;
}): AgentProperties => {
  return {
    ...currentProps,
    access_control,
    updated_at: updateDate.toISOString(),
  };
};
