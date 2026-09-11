/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type ExperimentalFeatures = { [K in keyof typeof allowedExperimentalValues]: boolean };

/**
 * A list of allowed values that can be used in `xpack.securitySolution.enableExperimental`.
 * This object is then used to validate and parse the value entered.
 */
export const allowedExperimentalValues = Object.freeze({
  /**
   * This is used for enabling the end-to-end tests for the security_solution telemetry.
   * We disable the telemetry since we don't have specific roles or permissions around it and
   * we don't want people to be able to violate security by getting access to whole documents
   * around telemetry they should not.
   * @see telemetry_detection_rules_preview_route.ts
   * @see test/security_solution_api_integration/test_suites/telemetry/README.md
   */
  previewTelemetryUrlEnabled: false,

  /**
   * Enables extended rule execution logging to Event Log. When this setting is enabled:
   * - Rules write their console error, info, debug, and trace messages to Event Log,
   *   in addition to other events they log there (status changes and execution metrics).
   * - We add a Kibana Advanced Setting that controls this behavior (on/off and log level).
   * - We show a table with plain execution logs on the Rule Details page.
   */
  extendedRuleExecutionLoggingEnabled: false,

  /**
   * `runscript` response actions for SentinelOne hosts.
   *
   * Release: 9.2.0 (earlier for serverless)
   */
  responseActionsSentinelOneRunScriptEnabled: true,

  /**
   * Memory Dump response actions support for Elastic Defend.
   * Release: v9.3
   */
  responseActionsEndpointMemoryDump: true,

  /**
   * `physical` memory dump type for the Memory Dump response action for Elastic Defend Endpoint
   * Release: 9.6, backported to 9.5.x
   */
  responseActionsEndpointMemoryDumpRaw: true,

  /**
   * `runscript` response action for Elastic Defend Endpoint
   * Release: 9.4
   */
  responseActionsEndpointRunScript: true,

  /**
   * Support for Automated Endpoint `runscript` (from rules)
   * Release: 9.4
   */
  responseActionsEndpointAutomatedRunScript: true,

  /**
   * Scripts library in support of `runscript`/upload-execute` new command for elastic defend
   * Release: 9.4
   */
  responseActionsScriptLibraryManagement: true,

  /**
   * `cancel` response action for Elastic Defend Endpoint
   * Release: 9.5
   */
  responseActionsEndpointCancel: true,

  /**
   * `kill_descendants` parameter option for the `kill-process` response action for Elastic Defend Endpoint
   * Release: 9.6
   */
  responseActionsEndpointKillProcessDescendants: false,

  /**
   * Enables CCS prefixing of endpoint indices so a Defend agent shipping to a remote ES output
   * (Fleet remote output) is visible from the managing cluster's Kibana.
   * Release: 9.5
   */
  defendRemoteOutputCcs: true,

  /**
   * Enables Cross-Project Search fan-out for Elastic Defend read paths on serverless, moving the reads
   * it covers from the internal user to a project-routed current-user client. Fan-out additionally
   * requires the request to resolve at least one linked project via `cps.isCpsActive()`, so a
   * serverless project with no linked projects reads exactly as it did before CPS. Off until the
   * request user holds index privileges on the Defend indices: a missing grant drops rows silently.
   */
  defendCrossProjectSearch: true,

  /**
   * Enables the Assistant Model Evaluation advanced setting and API endpoint, introduced in `8.11.0`.
   */
  assistantModelEvaluation: false,

  /**
   * Enable resetting risk scores to zero for outdated entities
   */
  enableRiskScoreResetToZero: true,

  /**
   * Enable privmon modifier in risk scoring calculation
   */
  enableRiskScorePrivmonModifier: true,

  /**
   * Entity Analytics: Disables the Risk Score AI Assistant tool.
   */
  riskScoreAssistantToolDisabled: false,
  /**
   * Enables the new Entity Analytics home page experience.
   */
  entityAnalyticsNewHomePageEnabled: true,

  /**
   * Enables the lead generation pipeline for Entity Analytics.
   * When enabled, the lead generation engine, observation modules,
   * API routes, and persistence indices are activated.
   */
  leadGenerationEnabled: true,

  /**
   * disables ES|QL rules
   */
  esqlRulesDisabled: false,

  /**
   * Enables gap reason display in the gaps table and reason-based filtering.
   */
  gapReasonDetectionEnabled: true,

  /**
   * Adds a new option to filter descendants of a process for Management / Trusted Apps
   */
  filterProcessDescendantsForTrustedAppsEnabled: true,

  /**
   * Entity Analytics: enables attaching entities (users, hosts, IPs) to a case from
   * Entity Analytics surfaces such as the entity flyout, and registers the
   * `security.entity` unified cases attachment type.
   */
  entityAttachmentsEnabled: true,

  /**
   * Enables AI rule creation feature
   */
  aiRuleCreationEnabled: true,

  /**
   * Disables the siem migrations feature
   */
  siemMigrationsDisabled: false,

  /**
   * Enables the Defend Insights Policy Response Failure feature
   */
  defendInsightsPolicyResponseFailure: true,

  /**
   * Removes Endpoint Exceptions from Rules/Alerts pages, and shows it instead in Manage/Assets.
   * Additionally: enables import/export for all Endpoint artifacts.
   */
  endpointExceptionsMovedUnderManagement: true,

  /**
   * Enables CrowdStrike's RunScript RTR command
   * Release: 8.18/9.0
   */
  crowdstrikeRunScriptEnabled: true,

  /**
   * Enables Microsoft Defender for Endpoint's RunScript command
   * Release: 8.19/9.1
   */
  microsoftDefenderEndpointRunScriptEnabled: true,

  /**
   * Enables advanced mode for Trusted Apps creation and update
   */
  trustedAppsAdvancedMode: true,

  /**
   * Enables Trusted Devices artifact management for device control protections.
   * Allows users to manage trusted USB and external devices
   */
  trustedDevices: true,

  /**
   * Enables custom YARA signature management in Elastic Defend.
   */
  customYaraSignaturesEnabled: false,

  /**
   * Enables the ability to import and migration dashboards through automatic migration service
   */
  automaticDashboardsMigration: true,

  /**
   * Enables Microsoft Defender for Endpoint's Cancel command
   * Release: 9.2.0
   */
  microsoftDefenderEndpointCancelEnabled: true,
  /**
   * Protects all the work related to the attacks and alerts alignment effort
   */
  enableAlertsAndAttacksAlignment: true,
  /**
   * Enables attaching an attack, together with its constituent alerts, to a case from
   * the Attacks page and the attack flyout, and registers the `security.attack` unified
   * cases attachment type on the server.
   */
  attackAttachmentsEnabled: false,
  /**
   *  Enables the QRadar rules import feature
   */
  qradarRulesMigration: true,
  /**
   *  Enables the Microsoft Sentinel rules import feature
   */
  sentinelRulesMigration: true,
  /**
   * Enables the Kubernetes Dashboard in Security Solution
   */
  kubernetesEnabled: true,

  /**
   * Enables the Entity Analytics Watchlist feature.
   */
  entityAnalyticsWatchlistEnabled: true,

  /**
   * Enables the Trial Companion feature.
   */
  trialCompanionEnabled: false,

  /**
   * Enables DNS events toggle for Linux in Endpoint policy configuration.
   * When disabled, DNS field is not added to Linux policies and not shown in UI.
   */
  linuxDnsEvents: true,

  /**
   * Enables the Automatic Migration of Splunk dashboards in Security Solution
   */
  splunkV2DashboardsEnabled: true,

  /**
   * Enables Detection Engine Health UI
   */
  deHealthUIEnabled: false,

  /**
   * Enables Rule Health UI
   */
  ruleHealthUIEnabled: false,

  /**
   * Enables the Automatic Troubleshooting Agent Builder skill
   */
  automaticTroubleshootingSkill: true,

  /**
   * Enables the PCI DSS v4.0.1 Compliance Agent Builder skill and its backing tools.
   * Gates skill + tool registration so the feature can ship dark and be enabled per environment.
   */
  pciComplianceAgentBuilder: true,

  /**
   * Enables the Endpoint Forensic Analysis Agent Builder skill (DFIR / patient zero / timeline).
   * Shipped dark by default; enable per environment via config.
   */
  endpointForensicAnalysisSkill: false,

  /**
   * Enables the investigate-rule Agent Builder skill.
   * Gates skill registration so the feature can ship dark and be enabled per environment.
   */
  investigateRuleSkill: false,

  /**
   * Enables the find-security-rules Agent Builder skill.
   * Part of the DEX AI skills family (`dexAiSkill*`).
   */
  dexAiSkillFindRules: true,

  /**
   * Enables the recommend-prebuilt-rules Agent Builder skill.
   * Part of the DEX AI skills family (`dexAiSkill*`).
   */
  dexAiSkillRecommendPrebuiltRules: true,

  /**
   * Enables the detection-coverage Agent Builder skill.
   * Part of the DEX AI skills family (`dexAiSkill*`).
   */
  dexAiSkillDetectionCoverage: false,

  /**
   * Disables the new flyout using the EUI flyout system. When this flag is off (the default), the
   * "Enable new flyout" advanced setting is registered and defaults to off, so users can opt in.
   * Turning this flag on unregisters that advanced setting, forcing the
   * legacy flyout and effectively removing the new flyout option.
   */
  newFlyoutSystemDisabled: false,

  /**
   * Uses entity store v2 for entity analytics skill
   */
  entityAnalyticsEntityStoreV2: true,

  /**
   * Enables entity ML anomaly details API
   */
  entityAnalyticsAnomalyDetails: true,

  /**
   * Enables the deprecated prebuilt rules UI
   * Release: 9.4
   */
  prebuiltRulesDeprecationUIEnabled: true,

  /**
   * Enables the Detection Rule Changes History API endpoint
   * (`GET /api/detection_engine/rules/_history`).
   *
   * Independent of the alerting framework's `xpack.alerting.ruleChangeTracking.enabled`
   * config flag, which gates the underlying primitive that produces the history
   * records. Both must be enabled for the API to return non-empty results.
   */
  ruleChangesHistoryEnabled: true,

  /**
   * Enables the agent builder `run_rule_preview` tool and the `security.rule.preview`
   * attachment (server type + client renderer). Gates registration so the feature can
   * ship dark and be enabled per environment.
   */
  rulePreviewAttachmentEnabled: false,

  /**
   * Enables the risk score history API endpoint for Entity Analytics.
   */
  riskScoreHistoryEnabled: true,

  /**
   * Enables UI treatments surfacing rules whose MITRE ATT&CK mappings drift
   * from the locally stored kibana mappings after a MITRE version bump.
   */
  mitreAttackUpdatesUIEnabled: true,

  /**
   * Risk score maintainer create-if-missing path: when an alert's EUID passes the entity type's
   * creation policy but has no entity store record, create the entity (with its risk score)
   * instead of silently dropping the score.
   */
  riskScoreCreateMissingEntitiesEnabled: false,

  /**
   * Enables the SIEM Rule Migrations Agent Builder tools.
   */
  siemRuleMigrationsAgentBuilderEnabled: false,

  /**
   * Threat-intel supply pipeline (indices, ingest adapters, create
   * report, IOC extraction, LLM enrichment, Diamond, promote task). Default
   * off. Direct index access is not yet cross-space hardened, so this must remain
   * disabled until that isolation is implemented or the administrator trust model
   * is explicitly accepted. Enable with:
   *   xpack.securitySolution.enableExperimental: ['threatIntelSupplyEnabled']
   */
  threatIntelSupplyEnabled: false,
});

type ExperimentalConfigKeys = Array<keyof ExperimentalFeatures>;
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

const allowedKeys = Object.keys(allowedExperimentalValues) as Readonly<ExperimentalConfigKeys>;

const disableExperimentalPrefix = 'disable:' as const;

/**
 * Parses the string value used in `xpack.securitySolution.enableExperimental` kibana configuration,
 * which should be an array of strings corresponding to allowedExperimentalValues keys.
 * Use the `disable:` prefix to disable a feature.
 *
 * @param configValue
 */
export const parseExperimentalConfigValue = (
  configValue: string[]
): { features: ExperimentalFeatures; invalid: string[] } => {
  const enabledFeatures: Mutable<Partial<ExperimentalFeatures>> = {};
  const invalidKeys: string[] = [];

  for (let value of configValue) {
    const isDisabled = value.startsWith(disableExperimentalPrefix);
    if (isDisabled) {
      value = value.replace(disableExperimentalPrefix, '');
    }
    if (!allowedKeys.includes(value as keyof ExperimentalFeatures)) {
      invalidKeys.push(value);
    } else {
      enabledFeatures[value as keyof ExperimentalFeatures] = !isDisabled;
    }
  }

  return {
    features: {
      ...allowedExperimentalValues,
      ...enabledFeatures,
    },
    invalid: invalidKeys,
  };
};

export const getExperimentalAllowedValues = (): string[] => [...allowedKeys];
