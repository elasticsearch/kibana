/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export enum ProductFeatureSecurityKey {
  /** Enables Advanced Insights (Entity Risk, GenAI) */
  advancedInsights = 'advanced_insights',

  /** Enables Configurations page for AI SOC */
  configurations = 'configurations',

  /** Enables AI Value Report access */
  aiValueReport = 'ai_value_report',

  /**
   * Enables rule gaps auto-fill
   */
  ruleGapsAutoFill = 'rule_gaps_auto_fill',

  /** Elastic endpoint detections, includes CSP rules which remain provisionally within siem */
  detections = 'detections',
  /**
   * Enables Investigation guide in Timeline
   */
  investigationGuide = 'investigation_guide',
  /**
   * Enables Investigation guide interactions (e.g., osquery, timelines, etc.)
   */
  investigationGuideInteractions = 'investigation_guide_interactions',
  /**
   * Enables access to the Endpoint List and associated views that allows management of hosts
   * running endpoint security
   */
  endpointHostManagement = 'endpoint_host_management',

  /**
   * Enables access to the Trusted Devices
   */
  endpointTrustedDevices = 'endpoint_trusted_devices',
  /**
   * Enables access to Endpoint host isolation and release actions
   */
  endpointHostIsolation = 'endpoint_host_isolation',
  /**
   * Enables endpoint policy views that enables user to manage endpoint security policies
   */
  endpointPolicyManagement = 'endpoint_policy_management',

  /**
   * Enables the ablity to manage or view scripts used with Elastic Defend reponse actions
   */
  endpointScriptsManagement = 'endpoint_scripts_management',

  /**
   * Enables Endpoint Policy protections (like Malware, Ransomware, etc)
   */
  endpointPolicyProtections = 'endpoint_policy_protections',
  /**
   * Enables management of all endpoint related artifacts (ex. Trusted Applications, Event Filters,
   * Host Isolation Exceptions, Blocklist.
   */
  endpointArtifactManagement = 'endpoint_artifact_management',
  /**
   * Enables managing host isolation exceptions for serverless PLIs
   * Allows user to create, read, update HIEs Endpoint Complete PLI
   */
  endpointHostIsolationExceptions = 'endpoint_host_isolation_exceptions',
  /**
   * Enables custom YARA signature management for Elastic Defend.
   */
  endpointCustomYaraSignatures = 'endpoint_custom_yara_signatures',
  /**
   * Enables all of endpoint's supported response actions - like host isolation, file operations,
   * process operations, command execution, etc.
   */
  endpointResponseActions = 'endpoint_response_actions',
  /**
   * Enables Threat Intelligence
   */
  threatIntelligence = 'threat-intelligence',
  /**
   * Enables Osquery Response Actions
   */
  osqueryAutomatedResponseActions = 'osquery_automated_response_actions',

  /**
   * Enables Protection Updates
   */
  endpointProtectionUpdates = 'endpoint_protection_updates',

  /**
   * Enables Endpoint Custom Notification
   */

  endpointCustomNotification = 'endpoint_custom_notification',

  /**
   * Enables Agent Tamper Protection
   */
  endpointAgentTamperProtection = 'endpoint_agent_tamper_protection',

  /**
   * Enables managing endpoint exceptions on rules and alerts
   */
  endpointExceptions = 'endpointExceptions',

  /**
   * enables all rule actions
   */
  externalRuleActions = 'external_rule_actions',

  /**
   * enables Cloud Security Posture - CSPM, KSPM, CNVM
   */
  cloudSecurityPosture = 'cloud_security_posture',

  /**
   * enables the automatic import
   */
  automaticImport = 'automatic_import',

  /** Enables Endpoint Workflow Insights */
  securityWorkflowInsights = 'security_workflow_insights',

  /**
   * Enables graph visualization for alerts and events
   */
  graphVisualization = 'graph_visualization',
}

export enum ProductFeatureCasesKey {
  /**
   * Enables Cases Connectors
   */
  casesConnectors = 'cases_connectors',
}

export enum ProductFeatureAssistantKey {
  /**
   * Enables Elastic AI Assistant
   */
  assistant = 'assistant',
}

export enum ProductFeatureAttackDiscoveryKey {
  /**
   * Enables Attack discovery
   */
  attackDiscovery = 'attack_discovery',
}

export enum ProductFeatureTimelineKey {
  /**
   * Enables Timeline
   */
  timeline = 'timeline',
}

export enum ProductFeatureNotesKey {
  /**
   * Enables Notes
   */
  notes = 'notes',
}
export enum ProductFeatureSiemMigrationsKey {
  /**
   * Enables the SIEM Migrations main feature
   */
  siemMigrations = 'siem_migrations',
}

export enum ProductFeatureRulesKey {
  /** Elastic endpoint detections, includes alerts, rules, investigations */
  detections = 'detections',

  /** Enables external detections for AI SOC, includes alerts_summary, basic_rules*/
  externalDetections = 'external_detections',

  /**
   * Enables customization of prebuilt Elastic rules
   */
  prebuiltRuleCustomization = 'prebuilt_rule_customization',

  /**
   * Enables Exceptions
   */
  exceptions = 'exceptions',
}

export enum ProductFeatureAlertsKey {
  /** Elastic endpoint detections, includes alerts, rules, investigations */
  detections = 'detections',

  /** Enables external detections for AI SOC, includes alerts_summary, basic_rules*/
  externalDetections = 'external_detections',
}

export enum ProductFeatureWorkflowsKey {
  /** Enables Workflows feature in a general sense */
  workflows = 'workflows',
}

// Merges the two enums.
export const ProductFeatureKey = {
  ...ProductFeatureSecurityKey,
  ...ProductFeatureCasesKey,
  ...ProductFeatureAssistantKey,
  ...ProductFeatureAttackDiscoveryKey,
  ...ProductFeatureSiemMigrationsKey,
  ...ProductFeatureTimelineKey,
  ...ProductFeatureNotesKey,
  ...ProductFeatureRulesKey,
  ...ProductFeatureAlertsKey,
  ...ProductFeatureWorkflowsKey,
};
// We need to merge the value and the type and export both to replicate how enum works.
export type ProductFeatureKeyType =
  | ProductFeatureSecurityKey
  | ProductFeatureCasesKey
  | ProductFeatureAssistantKey
  | ProductFeatureAttackDiscoveryKey
  | ProductFeatureSiemMigrationsKey
  | ProductFeatureTimelineKey
  | ProductFeatureNotesKey
  | ProductFeatureRulesKey
  | ProductFeatureAlertsKey
  | ProductFeatureWorkflowsKey;

export const ALL_PRODUCT_FEATURE_KEYS = Object.freeze(Object.values(ProductFeatureKey));

/** Sub-features IDs for Security */
export enum SecuritySubFeatureId {
  endpointList = 'endpointListSubFeature',
  endpointExceptions = 'endpointExceptionsSubFeature',
  trustedApplications = 'trustedApplicationsSubFeature',
  trustedDevices = 'trustedDevicesSubFeature',
  hostIsolationExceptionsBasic = 'hostIsolationExceptionsBasicSubFeature',
  blocklist = 'blocklistSubFeature',
  eventFilters = 'eventFiltersSubFeature',
  customYaraSignatures = 'customYaraSignaturesSubFeature',
  globalArtifactManagement = 'globalArtifactManagementSubFeature',
  policyManagement = 'policyManagementSubFeature',
  scriptsManagement = 'scriptsManagementSubFeature',
  responseActionsHistory = 'responseActionsHistorySubFeature',
  workflowInsights = 'workflowInsightsSubFeature',
  socManagement = 'socManagementSubFeature',
  hostIsolation = 'hostIsolationSubFeature',
  processOperations = 'processOperationsSubFeature',
  fileOperations = 'fileOperationsSubFeature',
  executeAction = 'executeActionSubFeature',
  scanAction = 'scanActionSubFeature',
}

/** Sub-features IDs for Cases */
export enum CasesSubFeatureId {
  deleteCases = 'deleteCasesSubFeature',
  casesSettings = 'casesSettingsSubFeature',
  createComment = 'createCommentSubFeature',
  reopenCase = 'reopenCaseSubFeature',
  assignUsers = 'assignUsersSubFeature',
  manageTemplates = 'manageTemplatesSubFeature',
}

/** Sub-features IDs for Security Assistant */
export enum AssistantSubFeatureId {
  updateAnonymization = 'updateAnonymizationSubFeature',
  manageGlobalKnowledgeBase = 'manageGlobalKnowledgeBaseSubFeature',
}

/** Sub-features IDs for Security Attack Discovery */
export enum AttackDiscoverySubFeatureId {
  updateSchedule = 'updateScheduleSubFeature',
}

/** Sub-features IDs for Security Rules */
export enum RulesSubFeatureId {
  exceptions = 'exceptionsSubFeature',
  investigationGuide = 'investigationGuideSubFeature',
  customHighlightedFields = 'customHighlightedFieldsSubFeature',
  enableDisableRules = 'enableDisableRulesSubFeature',
  manualRunRules = 'manualRunRulesSubFeature',
  rulesManagementSettings = 'rulesManagementSettingsSubFeature',
}
