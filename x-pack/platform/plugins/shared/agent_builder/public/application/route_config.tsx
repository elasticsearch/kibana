/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { matchPath } from 'react-router-dom';
import { i18n } from '@kbn/i18n';

import { AgentBuilderConnectorsPage } from './pages/connectors';
import { AgentBuilderAgentConnectorsPage } from './pages/agent_connectors';
import { AgentBuilderConversationsPage } from './pages/conversations';
import { AgentBuilderAgentsPage } from './pages/agents';
import { AgentBuilderAgentsCreate } from './pages/agent_create';
import { AgentBuilderAgentsEdit } from './pages/agent_edit';
import { AgentBuilderAgentOverviewPage } from './pages/agent_overview';
import { AgentBuilderAgentSkillsPage } from './pages/agent_skills';
import { AgentBuilderAgentPluginsPage } from './pages/agent_plugins';
import { AgentBuilderAgentToolsPage } from './pages/agent_tools';
import { AgentBuilderToolsPage } from './pages/tools';
import { AgentBuilderToolCreatePage } from './pages/tool_create';
import { AgentBuilderToolDetailsPage } from './pages/tool_details';
import { AgentBuilderBulkImportMcpToolsPage } from './pages/bulk_import_mcp_tools';
import { AgentBuilderSkillsPage } from './pages/skills';
import { AgentBuilderSkillCreatePage } from './pages/skill_create';
import { AgentBuilderSkillDetailsPage } from './pages/skill_details';
import { AgentBuilderPluginsPage } from './pages/plugins';
import { AgentBuilderPluginDetailsPage } from './pages/plugin_details';
import { AgentBuilderMcpClientsPage } from './pages/mcp_clients';
import { AgentBuilderMcpClientCreatePage } from './pages/mcp_client_create';
import { AgentBuilderMcpClientEditPage } from './pages/mcp_client_edit';
import { agentBuilderViewIds } from './agent_builder_view_ids';
import { appPaths } from './utils/app_paths';

export type SidebarView = 'conversation' | 'manage';

export interface FeatureFlags {
  experimental: boolean;
}

export interface Capabilities {
  isUIAMEnabled: boolean;
}

export interface RouteAccessConfig {
  featureFlags: FeatureFlags;
  capabilities: Capabilities;
}

export interface RouteDefinition {
  path: string;
  viewId: string;
  element: React.ReactNode;
  sidebarView: SidebarView;
  isExperimental?: boolean;
  requiresUIAM?: boolean;
  navLabel?: string;
  navIcon?: string;
}

const navLabels = {
  overview: i18n.translate('xpack.agentBuilder.routeConfig.overview', {
    defaultMessage: 'Overview',
  }),
  skills: i18n.translate('xpack.agentBuilder.routeConfig.skills', {
    defaultMessage: 'Skills',
  }),
  tools: i18n.translate('xpack.agentBuilder.routeConfig.tools', {
    defaultMessage: 'Tools',
  }),
  plugins: i18n.translate('xpack.agentBuilder.routeConfig.plugins', {
    defaultMessage: 'Plugins',
  }),
  connectors: i18n.translate('xpack.agentBuilder.routeConfig.connectors', {
    defaultMessage: 'Connectors',
  }),
  agents: i18n.translate('xpack.agentBuilder.routeConfig.agents', {
    defaultMessage: 'Agents',
  }),
};

// Routes ordered from most specific to least specific for correct matching
export const agentRoutes: RouteDefinition[] = [
  {
    path: '/agents/:agentId/conversations/:conversationId',
    viewId: agentBuilderViewIds.agentConversation,
    sidebarView: 'conversation',
    element: <AgentBuilderConversationsPage />,
  },
  {
    path: '/agents/:agentId/overview',
    viewId: agentBuilderViewIds.agentOverview,
    sidebarView: 'conversation',
    navLabel: navLabels.overview,
    element: <AgentBuilderAgentOverviewPage />,
  },
  {
    path: '/agents/:agentId/skills',
    viewId: agentBuilderViewIds.agentSkills,
    sidebarView: 'conversation',
    navLabel: navLabels.skills,
    element: <AgentBuilderAgentSkillsPage />,
  },
  {
    path: '/agents/:agentId/plugins',
    viewId: agentBuilderViewIds.agentPlugins,
    sidebarView: 'conversation',
    isExperimental: true,
    navLabel: navLabels.plugins,
    element: <AgentBuilderAgentPluginsPage />,
  },
  {
    path: '/agents/:agentId/connectors',
    viewId: agentBuilderViewIds.agentConnectors,
    sidebarView: 'conversation',
    navLabel: navLabels.connectors,
    element: <AgentBuilderAgentConnectorsPage />,
  },
  {
    path: '/agents/:agentId/tools',
    viewId: agentBuilderViewIds.agentTools,
    sidebarView: 'conversation',
    navLabel: navLabels.tools,
    element: <AgentBuilderAgentToolsPage />,
  },
  // Catch-all for agent root - must be last
  {
    path: '/agents/:agentId',
    viewId: agentBuilderViewIds.agentRoot,
    sidebarView: 'conversation',
    element: <AgentBuilderConversationsPage />,
  },
];

export const manageRoutes: RouteDefinition[] = [
  {
    path: '/manage/agents',
    viewId: agentBuilderViewIds.manageAgents,
    sidebarView: 'manage',
    navLabel: navLabels.agents,
    element: <AgentBuilderAgentsPage />,
  },
  {
    path: '/manage/agents/new',
    viewId: agentBuilderViewIds.manageAgentCreate,
    sidebarView: 'manage',
    element: <AgentBuilderAgentsCreate />,
  },
  {
    path: '/manage/agents/:agentId',
    viewId: agentBuilderViewIds.manageAgentEdit,
    sidebarView: 'manage',
    element: <AgentBuilderAgentsEdit />,
  },
  {
    path: '/manage/skills',
    viewId: agentBuilderViewIds.manageSkills,
    sidebarView: 'manage',
    navLabel: navLabels.skills,
    element: <AgentBuilderSkillsPage />,
  },
  {
    path: '/manage/skills/new',
    viewId: agentBuilderViewIds.manageSkillCreate,
    sidebarView: 'manage',
    element: <AgentBuilderSkillCreatePage />,
  },
  {
    path: '/manage/skills/:skillId',
    viewId: agentBuilderViewIds.manageSkillDetails,
    sidebarView: 'manage',
    element: <AgentBuilderSkillDetailsPage />,
  },
  {
    path: '/manage/plugins',
    viewId: agentBuilderViewIds.managePlugins,
    sidebarView: 'manage',
    isExperimental: true,
    navLabel: navLabels.plugins,
    element: <AgentBuilderPluginsPage />,
  },
  {
    path: '/manage/plugins/:pluginId',
    viewId: agentBuilderViewIds.managePluginDetails,
    sidebarView: 'manage',
    isExperimental: true,
    element: <AgentBuilderPluginDetailsPage />,
  },
  {
    path: '/manage/connectors',
    viewId: agentBuilderViewIds.manageConnectors,
    sidebarView: 'manage',
    navLabel: navLabels.connectors,
    element: <AgentBuilderConnectorsPage />,
  },
  {
    path: '/manage/tools',
    viewId: agentBuilderViewIds.manageTools,
    sidebarView: 'manage',
    navLabel: navLabels.tools,
    element: <AgentBuilderToolsPage />,
  },
  {
    path: '/manage/tools/new',
    viewId: agentBuilderViewIds.manageToolCreate,
    sidebarView: 'manage',
    element: <AgentBuilderToolCreatePage />,
  },
  {
    path: '/manage/tools/bulk_import_mcp',
    viewId: agentBuilderViewIds.manageToolBulkImportMcp,
    sidebarView: 'manage',
    element: <AgentBuilderBulkImportMcpToolsPage />,
  },
  {
    path: '/manage/tools/mcp_clients/new',
    viewId: agentBuilderViewIds.manageMcpClientCreate,
    sidebarView: 'manage',
    requiresUIAM: true,
    element: <AgentBuilderMcpClientCreatePage />,
  },
  {
    path: '/manage/tools/mcp_clients/:clientId',
    viewId: agentBuilderViewIds.manageMcpClientEdit,
    sidebarView: 'manage',
    requiresUIAM: true,
    element: <AgentBuilderMcpClientEditPage />,
  },
  {
    path: '/manage/tools/mcp_clients',
    viewId: agentBuilderViewIds.manageMcpClients,
    sidebarView: 'manage',
    requiresUIAM: true,
    element: <AgentBuilderMcpClientsPage />,
  },
  {
    path: '/manage/tools/:toolId',
    viewId: agentBuilderViewIds.manageToolDetails,
    sidebarView: 'manage',
    element: <AgentBuilderToolDetailsPage />,
  },
];

export const allRoutes: RouteDefinition[] = [...agentRoutes, ...manageRoutes];

export const getSidebarViewForRoute = (pathname: string): SidebarView => {
  for (const route of allRoutes) {
    if (matchPath(pathname, { path: route.path, exact: false })) {
      return route.sidebarView;
    }
  }
  return 'conversation';
};

export const getViewIdForPathname = (
  pathname: string,
  enabledRoutes: RouteDefinition[]
): string | undefined =>
  enabledRoutes.find((route) => matchPath(pathname, { path: route.path, exact: true }))?.viewId;

export const getAgentIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/agents\/([^/]+)/);
  return match ? match[1] : undefined;
};

export const getConversationIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/agents\/[^/]+\/conversations\/([^/]+)/);
  return match ? match[1] : undefined;
};

export const getPathWithSwitchedAgent = (pathname: string, newAgentId: string): string => {
  const currentAgentId = getAgentIdFromPath(pathname);
  if (!currentAgentId) {
    return appPaths.agent.root({ agentId: newAgentId });
  }

  if (getConversationIdFromPath(pathname)) {
    return appPaths.agent.conversations.new({ agentId: newAgentId });
  }

  const agentBase = `/agents/${currentAgentId}`;
  if (pathname === agentBase || pathname === `${agentBase}/`) {
    return appPaths.agent.root({ agentId: newAgentId });
  }

  if (pathname.startsWith(`${agentBase}/`)) {
    return `/agents/${newAgentId}${pathname.slice(agentBase.length)}`;
  }

  return appPaths.agent.root({ agentId: newAgentId });
};

export interface SidebarNavItem {
  label: string;
  path: string;
  icon?: string;
}

const isRouteEnabled = (route: RouteDefinition, config: RouteAccessConfig): boolean => {
  const { isExperimental, requiresUIAM } = route;
  const { featureFlags, capabilities } = config;
  if (isExperimental && !featureFlags.experimental) return false;
  if (requiresUIAM && !capabilities.isUIAMEnabled) return false;
  return true;
};

export const getEnabledRoutes = (config: RouteAccessConfig): RouteDefinition[] => {
  return allRoutes.filter((route) => isRouteEnabled(route, config));
};

export const getAgentSettingsNavItems = (
  agentId: string,
  config: RouteAccessConfig
): SidebarNavItem[] => {
  return agentRoutes
    .filter((route) => route.navLabel && isRouteEnabled(route, config))
    .map((route) => ({
      label: route.navLabel ?? '',
      path: route.path.replace(':agentId', agentId),
      icon: route.navIcon,
    }));
};

export const getManageNavItems = (config: RouteAccessConfig): SidebarNavItem[] => {
  return manageRoutes
    .filter((route) => route.navLabel && isRouteEnabled(route, config))
    .map((route) => ({
      label: route.navLabel!,
      path: route.path,
      icon: route.navIcon,
    }));
};
