/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import type { AgentDefinition } from '@kbn/agent-builder-common';
import { i18n } from '@kbn/i18n';
import { useCallback, useMemo } from 'react';
import type { ConnectorItem } from '../../../../common/http_api/tools';
import { queryKeys } from '../../query_keys';
import { useAgentBuilderAgentById } from '../agents/use_agent_by_id';
import { useAgentBuilderServices } from '../use_agent_builder_service';
import { useListConnectors } from '../tools/use_mcp_connectors';
import { useToasts } from '../use_toasts';
import { agentHasConnector, getEffectiveConnectorIds } from './connector_ids_utils';

export const useAgentConnectors = ({ agentId }: { agentId: string }) => {
  const { agent } = useAgentBuilderAgentById(agentId);
  const { connectors: allConnectors, isLoading } = useListConnectors({});
  const { agentService } = useAgentBuilderServices();
  const queryClient = useQueryClient();
  const { addSuccessToast, addErrorToast } = useToasts();

  const agentQueryKey = queryKeys.agentProfiles.byId(agentId);

  const assignedConnectors = useMemo(
    () => (agent ? allConnectors.filter((c) => agentHasConnector(agent, c.id)) : []),
    [agent, allConnectors]
  );

  const activeConnectorIdSet = useMemo(
    () =>
      new Set(
        agent
          ? getEffectiveConnectorIds(
              agent,
              allConnectors.map((c) => c.id)
            )
          : []
      ),
    [agent, allConnectors]
  );

  const getCurrentConnectorIds = useCallback((): string[] => {
    const currentAgent = queryClient.getQueryData<AgentDefinition>(agentQueryKey);
    return currentAgent
      ? getEffectiveConnectorIds(
          currentAgent,
          allConnectors.map((c) => c.id)
        )
      : allConnectors.map((c) => c.id);
  }, [queryClient, agentQueryKey, allConnectors]);

  const updateConnectorsMutation = useMutation({
    mutationFn: (newConnectorIds: string[]) =>
      agentService.update(agentId, {
        configuration: { connector_ids: newConnectorIds },
      }),
    onMutate: async (newConnectorIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: agentQueryKey });
      const previousAgent = queryClient.getQueryData<AgentDefinition>(agentQueryKey);
      if (previousAgent) {
        queryClient.setQueryData<AgentDefinition>(agentQueryKey, {
          ...previousAgent,
          configuration: { ...previousAgent.configuration, connector_ids: newConnectorIds },
        });
      }
      return { previousAgent };
    },
    onError: (_err, _newConnectorIds, context) => {
      if (context?.previousAgent) {
        queryClient.setQueryData<AgentDefinition>(agentQueryKey, context.previousAgent);
      }
      addErrorToast({
        title: i18n.translate('xpack.agentBuilder.agentConnectors.updateErrorToast', {
          defaultMessage: 'Failed to update connectors',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: agentQueryKey });
    },
  });

  const assign = useCallback(
    (connector: Pick<ConnectorItem, 'id' | 'name'>) => {
      const currentIds = getCurrentConnectorIds();
      if (currentIds.includes(connector.id)) return;
      updateConnectorsMutation.mutate([...currentIds, connector.id], {
        onSuccess: () =>
          addSuccessToast({
            title: i18n.translate('xpack.agentBuilder.agentConnectors.assignSuccessToast', {
              defaultMessage: '{name} added',
              values: { name: connector.name },
            }),
          }),
      });
    },
    [getCurrentConnectorIds, updateConnectorsMutation, addSuccessToast]
  );

  const unassign = useCallback(
    (connector: ConnectorItem) => {
      const currentIds = getCurrentConnectorIds();
      updateConnectorsMutation.mutate(
        currentIds.filter((id) => id !== connector.id),
        {
          onSuccess: () =>
            addSuccessToast({
              title: i18n.translate('xpack.agentBuilder.agentConnectors.unassignSuccessToast', {
                defaultMessage: '{name} removed',
                values: { name: connector.name },
              }),
            }),
        }
      );
    },
    [getCurrentConnectorIds, updateConnectorsMutation, addSuccessToast]
  );

  return {
    assignedConnectors,
    allConnectors,
    activeConnectorIdSet,
    isLoading,
    isAssigning: updateConnectorsMutation.isLoading,
    assign,
    unassign,
  };
};
