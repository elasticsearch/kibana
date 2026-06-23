/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@kbn/react-query';
import {
  type AgentDefinition,
  type AgentAccessControlEntry,
  AgentAccessControlMode,
  type ToolSelection,
  defaultAgentToolIds,
} from '@kbn/agent-builder-common';
import { useSearchParams } from 'react-router-dom-v5-compat';
import type { AgentCreateRequest, AgentUpdateRequest } from '../../../../common/agents';
import { useAgentBuilderServices } from '../use_agent_builder_service';
import { useAgentBuilderAgentById } from './use_agent_by_id';
import { useToolsService } from '../tools/use_tools';
import { useSkillsService } from '../skills/use_skills';
import { usePluginsService } from '../plugins/use_plugins';
import { useExperimentalFeatures } from '../use_experimental_features';
import { queryKeys } from '../../query_keys';
import { duplicateName } from '../../utils/duplicate_name';
import { searchParamNames } from '../../search_param_names';
import { cleanInvalidToolReferences } from '../../utils/tool_selection_utils';

export type AgentEditState = Omit<AgentDefinition, 'type' | 'readonly'>;

const defaultToolSelection: ToolSelection[] = [
  {
    tool_ids: [...defaultAgentToolIds],
  },
];

const emptyState = (): AgentEditState => ({
  id: '',
  name: '',
  description: '',
  access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
  labels: [],
  avatar_color: '',
  avatar_symbol: '',
  configuration: {
    instructions: '',
    tools: defaultToolSelection,
    enable_elastic_capabilities: false,
    workflow_ids: [],
    plugin_ids: [],
  },
});

const accessControlEntriesSignature = (entries: AgentAccessControlEntry[] = []): string =>
  JSON.stringify(
    [...entries]
      .map((entry) => ({ type: entry.type, name: entry.name, role: entry.role }))
      .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`))
  );

export function useAgentEdit({
  editingAgentId,
  onSaveSuccess,
  onSaveError,
}: {
  editingAgentId?: string;
  onSaveSuccess: (agent: AgentDefinition) => void;
  onSaveError: (err: Error) => void;
}) {
  const [searchParams] = useSearchParams();
  const { agentService } = useAgentBuilderServices();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AgentEditState>(emptyState());

  const isExperimentalFeaturesEnabled = useExperimentalFeatures();
  const { tools, isLoading: toolsLoading, error: toolsError } = useToolsService();
  const { skills, isLoading: skillsLoading, error: skillsError } = useSkillsService();
  const { plugins, isLoading: pluginsLoading, error: pluginsError } = usePluginsService();
  const sourceAgentId = searchParams.get(searchParamNames.sourceId);
  const isClone = Boolean(!editingAgentId && sourceAgentId);
  const agentId = editingAgentId || sourceAgentId || '';
  const { agent, isLoading: agentLoading, error: agentError } = useAgentBuilderAgentById(agentId);

  const createMutation = useMutation({
    mutationFn: (data: AgentCreateRequest) => agentService.create(data),
    onError: (err: Error) => {
      onSaveError(err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: AgentUpdateRequest) => {
      if (!editingAgentId) {
        throw new Error('Agent ID is required for update');
      }
      return agentService.update(agentId, data);
    },
    onError: (err: Error) => {
      onSaveError(err);
    },
  });

  const updateAccessControlMutation = useMutation({
    mutationFn: (entries: AgentAccessControlEntry[]) => {
      if (!editingAgentId) {
        throw new Error('Agent ID is required for access control update');
      }
      return agentService.updateAccessControl(agentId, { entries });
    },
    onError: (err: Error) => {
      onSaveError(err);
    },
  });

  useEffect(() => {
    if (!agentId) {
      setState(emptyState());

      return;
    }

    if (agent) {
      const { type, permissions, ...agentState } = agent;
      agentState.access_control = agentState.access_control ?? {
        access_mode: AgentAccessControlMode.Public,
        entries: [],
      };
      if (isClone) {
        agentState.id = duplicateName(agentState.id);
      }
      setState(agentState);
    }
  }, [agentId, agent, isClone]);

  const submit = useCallback(
    async (data: AgentEditState) => {
      const requestData = cleanInvalidToolReferences(data, tools);

      if (editingAgentId) {
        const { id, access_control, ...updatedAgent } = requestData;
        const result = await updateMutation.mutateAsync(
          access_control
            ? { ...updatedAgent, access_control: { access_mode: access_control.access_mode } }
            : updatedAgent
        );

        const initialEntries = agent?.access_control?.entries;
        const nextEntries = access_control?.entries;
        const shouldUpdateAccessControl =
          initialEntries !== undefined &&
          nextEntries !== undefined &&
          accessControlEntriesSignature(initialEntries) !==
            accessControlEntriesSignature(nextEntries);

        if (shouldUpdateAccessControl) {
          await updateAccessControlMutation.mutateAsync(nextEntries);
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.byId(agentId) });
        if (shouldUpdateAccessControl) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.agentProfiles.accessControl(agentId),
          });
        }
        onSaveSuccess(result);
      } else {
        const { access_control, created_by, avatar_icon, ...createData } = requestData;
        const result = await createMutation.mutateAsync(
          access_control
            ? { ...createData, access_control: { access_mode: access_control.access_mode } }
            : createData
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.all });
        onSaveSuccess(result);
      }
    },
    [
      editingAgentId,
      createMutation,
      updateMutation,
      updateAccessControlMutation,
      tools,
      agent?.access_control?.entries,
      agentId,
      queryClient,
      onSaveSuccess,
    ]
  );

  const isLoading = agentId
    ? agentLoading ||
      toolsLoading ||
      skillsLoading ||
      (isExperimentalFeaturesEnabled && pluginsLoading)
    : false;

  return {
    state,
    isLoading,
    isSubmitting:
      createMutation.isLoading || updateMutation.isLoading || updateAccessControlMutation.isLoading,
    permissions: agent?.permissions,
    submit,
    tools,
    skills,
    plugins,
    error:
      toolsError ||
      skillsError ||
      (isExperimentalFeaturesEnabled ? pluginsError : undefined) ||
      agentError,
  };
}
