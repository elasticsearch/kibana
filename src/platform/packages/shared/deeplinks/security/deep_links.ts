/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export enum SecurityPageName {
  administration = 'administration',
  alerts = 'alerts',
  attacks = 'attacks',
  aiValue = 'ai_value',
  artifacts = 'artifacts',
  assetInventory = 'asset_inventory',
  attackDiscovery = 'attack_discovery',
  blocklist = 'blocklist',

  // TODO: https://github.com/elastic/kibana/issues/242434
  // Investigate possibility of using `detections` instead
  alertDetections = 'alert_detections',

  /*
   * Warning: Computed values are not permitted in an enum with string valued members
   * All Cases page names must match `CasesDeepLinkId` in x-pack/platform/plugins/shared/cases/public/common/navigation/deep_links.ts
   */
  case = 'cases', // must match `CasesDeepLinkId.cases`
  caseConfigure = 'cases_configure', // must match `CasesDeepLinkId.casesConfigure`
  caseCreate = 'cases_create', // must match `CasesDeepLinkId.casesCreate`
  caseTemplates = 'cases_templates', // must match `CasesDeepLinkId.casesTemplates`
  /*
   * Warning: Computed values are not permitted in an enum with string valued members
   * All cloud security posture page names must match `CloudSecurityPosturePageId` in x-pack/solutions/security/plugins/cloud_security_posture/public/common/navigation/types.ts
   */
  cloudSecurityPostureBenchmarks = 'cloud_security_posture-benchmarks',
  cloudSecurityPostureDashboard = 'cloud_security_posture-dashboard',
  cloudSecurityPostureVulnerabilityDashboard = 'cloud_security_posture-vulnerability_dashboard',
  cloudSecurityPostureFindings = 'cloud_security_posture-findings',
  cloudSecurityPostureRules = 'cloud_security_posture-rules',
  cloudDefend = 'cloud_defend',
  cloudDefendPolicies = 'cloud_defend-policies',
  dashboards = 'dashboards',
  dataQuality = 'data_quality',
  detections = 'detections',
  detectionAndResponse = 'detection_response',
  endpoints = 'endpoints',
  endpointExceptions = 'endpoint_exceptions',
  eventFilters = 'event_filters',
  exceptions = 'exceptions',
  exploreLanding = 'explore',
  hostIsolationExceptions = 'host_isolation_exceptions',
  hosts = 'hosts',
  hostsAll = 'hosts-all',
  hostsAnomalies = 'hosts-anomalies',
  hostsRisk = 'hosts-risk',
  hostsEvents = 'hosts-events',
  hostsSessions = 'hosts-sessions',
  hostsUncommonProcesses = 'hosts-uncommon_processes',
  kubernetes = 'kubernetes',
  landing = 'get_started',
  launchpad = 'launchpad',
  network = 'network',
  networkAnomalies = 'network-anomalies',
  networkDns = 'network-dns',
  networkEvents = 'network-events',
  networkFlows = 'network-flows',
  networkHttp = 'network-http',
  networkTls = 'network-tls',
  noPage = '',
  overview = 'overview',
  policies = 'policy',
  responseActionsHistory = 'response_actions_history',
  rules = 'rules',
  rulesAdd = 'rules-add',
  rulesChangesHistory = 'rules-changes-history',
  rulesCreate = 'rules-create',
  rulesLanding = 'rules-landing',
  rulesManagement = 'rules-management',
  scriptLibrary = 'script_library',
  siemReadiness = 'siem_readiness',
  siemMigrationsLanding = 'siem_migrations',
  siemMigrationsRules = 'siem_migrations-rules',
  siemMigrationsDashboards = 'siem_migrations-dashboards',
  siemMigrationsManage = 'siem_migrations-manage',
  /*
   * Warning: Computed values are not permitted in an enum with string valued members
   * All threat intelligence page names must match `TIPageId` in x-pack/solutions/security/plugins/threat_intelligence/public/common/navigation/types.ts
   */
  threatIntelligence = 'threat_intelligence',
  timelines = 'timelines',
  timelinesTemplates = 'timelines-templates',
  trustedApps = 'trusted_apps',
  trustedDevices = 'trusted_devices',
  users = 'users',
  usersAll = 'users-all',
  usersAnomalies = 'users-anomalies',
  usersAuthentications = 'users-authentications',
  usersEvents = 'users-events',
  usersRisk = 'users-risk',
  entityAnalytics = 'entity_analytics', // This is the first Entity Analytics page, that is why the name is too generic.
  entityAnalyticsManagement = 'entity_analytics-management',
  entityAnalyticsLanding = 'entity_analytics-landing',
  entityAnalyticsPrivilegedUserMonitoring = 'entity_analytics-privileged_user_monitoring',
  entityAnalyticsOverview = 'entity_analytics-overview',
  entityAnalyticsHomePage = 'entity_analytics-home_page',
  entityAnalyticsEntityStoreManagement = 'entity_analytics-entity_store_management',
  coverageOverview = 'coverage-overview',
  notes = 'notes',
  alertSummary = 'alert_summary',
  alertValidationWorkflow = 'alert_validation_workflow',
  configurations = 'configurations',
  configurationsIntegrations = 'configurations-integrations',
  configurationsAiSettings = 'configurations-ai_settings',
  configurationsBasicRules = 'configurations-basic_rules',

  /**
   * Detection Engine Health UI Pages
   */
  spaceRulesHealth = 'space-rules-health',
  ruleHealth = 'rule-health',

  /**
   * external links
   */
  externalLinkAgentBuilder = 'external_link-agent_builder',
  externalLinkDiscover = 'external_link-discover',
  externalLinkWorkflows = 'external_link-workflows',

  /**
   * Ingest Hub Onboarding
   */
  onboarding = 'onboarding',
}
