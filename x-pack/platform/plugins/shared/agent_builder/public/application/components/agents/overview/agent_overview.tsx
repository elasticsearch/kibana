/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { defaultAgentToolIds } from '@kbn/agent-builder-common';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useCanUpdateAgent } from '../../../hooks/agents/use_can_update_agent';
import { useSkillsService } from '../../../hooks/skills/use_skills';
import { usePluginsService } from '../../../hooks/plugins/use_plugins';
import { useToolsService } from '../../../hooks/tools/use_tools';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useExperimentalFeatures } from '../../../hooks/use_experimental_features';
import { useKibana } from '../../../hooks/use_kibana';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { isPreExecutionWorkflowEnabled } from '../../../utils/is_pre_execution_workflow_enabled';
import { AgentHeader } from './agent_header';
import { CapabilitiesSection } from './capabilities_section';
import { EditDetailsFlyout } from './edit_details_flyout';
import { SettingsSection } from './settings_section';
import { PageWrapper } from '../common/page_wrapper';
import { AccessFlyout } from '../access/access_flyout';
import { AccessSummaryCard } from '../access/access_summary_card';
import { useCanUpdateAgentAccess } from '../../../hooks/agents/use_can_update_agent_access';
import {
  getActivePlugins,
  getActiveSkills,
  getActiveTools,
} from '../../../utils/tool_selection_utils';

export const AgentOverview: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { euiTheme } = useEuiTheme();
  const { docLinksService } = useAgentBuilderServices();
  const { navigateToAgentBuilderUrl, createAgentBuilderUrl } = useNavigation();

  const isExperimentalFeaturesEnabled = useExperimentalFeatures();
  const {
    services: { uiSettings },
  } = useKibana();

  const { agent, isLoading } = useAgentBuilderAgentById(agentId);
  const { skills: allSkills, isLoading: skillsLoading } = useSkillsService();
  const { plugins: allPlugins, isLoading: pluginsLoading } = usePluginsService();
  const { tools: allTools, isLoading: toolsLoading } = useToolsService();
  const [isEditFlyoutOpen, setIsEditFlyoutOpen] = useState(false);
  const [isAccessFlyoutOpen, setIsAccessFlyoutOpen] = useState(false);
  const canEditAgent = useCanUpdateAgent({ agent });
  const { canUpdate: canUpdateAgentAccess } = useCanUpdateAgentAccess(agent);

  const canChangeAccessControlMode = isExperimentalFeaturesEnabled && canUpdateAgentAccess;

  const showWorkflowSection = isPreExecutionWorkflowEnabled(uiSettings);

  const enableElasticCapabilities = agent?.configuration?.enable_elastic_capabilities ?? false;

  const skillsCount = useMemo(
    () =>
      getActiveSkills(allSkills, agent?.configuration?.skill_ids, enableElasticCapabilities).length,
    [allSkills, agent?.configuration?.skill_ids, enableElasticCapabilities]
  );

  const pluginsCount = useMemo(
    () =>
      getActivePlugins(allPlugins, agent?.configuration?.plugin_ids, enableElasticCapabilities)
        .length,
    [allPlugins, agent?.configuration?.plugin_ids, enableElasticCapabilities]
  );

  const defaultToolIdSet = useMemo(() => new Set<string>(defaultAgentToolIds), []);

  const toolsCount = useMemo(() => {
    if (!agent) return 0;
    return getActiveTools(
      allTools,
      agent.configuration?.tools ?? [],
      enableElasticCapabilities,
      defaultToolIdSet
    ).length;
  }, [agent, allTools, enableElasticCapabilities, defaultToolIdSet]);

  const connectorsCount = agent?.configuration?.connector_ids?.length ?? 0;

  if (isLoading || !agent) {
    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          padding: ${euiTheme.size.xxl};
          height: 100%;
        `}
      >
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  const containerStyles = css`
    padding: ${euiTheme.size.l} ${euiTheme.size.xl};
    overflow-y: auto;
    height: 100%;
  `;

  return (
    <PageWrapper>
      <div css={containerStyles} data-test-subj="agentOverviewPage">
        <AgentHeader
          agent={agent}
          docsUrl={docLinksService.agentBuilderAgents}
          canEditAgent={canEditAgent}
          onEditDetails={() => setIsEditFlyoutOpen(true)}
          canManageAccess={canUpdateAgentAccess}
          onManageAccess={() => setIsAccessFlyoutOpen(true)}
        />

        <EuiSpacer size="l" />
        <EuiHorizontalRule margin="none" />
        <EuiSpacer size="l" />

        <AccessSummaryCard agent={agent} onManage={() => setIsAccessFlyoutOpen(true)} />
        <EuiSpacer size="l" />

        <CapabilitiesSection
          skillsCount={skillsCount}
          pluginsCount={pluginsCount}
          connectorsCount={connectorsCount}
          toolsCount={toolsCount}
          skillsCountLoading={skillsLoading}
          pluginsCountLoading={pluginsLoading}
          toolsCountLoading={toolsLoading}
          enableElasticCapabilities={enableElasticCapabilities}
          isExperimentalFeaturesEnabled={isExperimentalFeaturesEnabled}
          skillsHref={createAgentBuilderUrl(appPaths.agent.skills({ agentId: agentId! }))}
          pluginsHref={createAgentBuilderUrl(appPaths.agent.plugins({ agentId: agentId! }))}
          connectorsHref={createAgentBuilderUrl(appPaths.agent.connectors({ agentId: agentId! }))}
          toolsHref={createAgentBuilderUrl(appPaths.agent.tools({ agentId: agentId! }))}
          onNavigateToSkills={() =>
            navigateToAgentBuilderUrl(appPaths.agent.skills({ agentId: agentId! }))
          }
          onNavigateToPlugins={() =>
            navigateToAgentBuilderUrl(appPaths.agent.plugins({ agentId: agentId! }))
          }
          onNavigateToConnectors={() =>
            navigateToAgentBuilderUrl(appPaths.agent.connectors({ agentId: agentId! }))
          }
          onNavigateToTools={() =>
            navigateToAgentBuilderUrl(appPaths.agent.tools({ agentId: agentId! }))
          }
        />

        <EuiSpacer size="xl" />

        <SettingsSection
          enableElasticCapabilities={enableElasticCapabilities}
          currentInstructions={agent.configuration?.instructions ?? ''}
          showWorkflowSection={showWorkflowSection}
          workflowIds={agent.configuration?.workflow_ids ?? []}
          canEditAgent={canEditAgent}
          onOpenEditFlyout={() => setIsEditFlyoutOpen(true)}
        />

        {isEditFlyoutOpen && agent && (
          <EditDetailsFlyout
            agent={agent}
            onClose={() => setIsEditFlyoutOpen(false)}
            canChangeAccessControlMode={canChangeAccessControlMode}
            showWorkflowSection={showWorkflowSection}
          />
        )}

        {isAccessFlyoutOpen && agent && (
          <AccessFlyout agent={agent} onClose={() => setIsAccessFlyoutOpen(false)} />
        )}
      </div>
    </PageWrapper>
  );
};
