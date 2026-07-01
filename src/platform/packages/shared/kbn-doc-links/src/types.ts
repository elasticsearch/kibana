/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * @public
 */
export interface DocLinksMeta {
  version: string;
  ecs_version: string;
  elasticWebsiteUrl: string;
  elasticGithubUrl: string;
  docsWebsiteUrl: string;
  searchLabsUrl: string;
  apiDocsUrl: string;
}

/**
 * @public
 */
export interface DocLinks {
  readonly settings: string;
  readonly aiAssistantSettings: string;
  readonly elasticStackGetStarted: string;
  readonly apiReference: string;
  readonly releaseNotes: string;
  readonly serverlessReleaseNotes: string;
  readonly hostedCloudReleaseNotes: string;
  readonly upgrade: {
    readonly upgradingStackOnPrem: string;
    readonly upgradingStackOnCloud: string;
  };
  readonly apm: {
    readonly kibanaSettings: string;
    readonly supportedServiceMaps: string;
    readonly supportedServiceMapsLegend: string;
    readonly customLinks: string;
    readonly droppedTransactionSpans: string;
    readonly upgrading: string;
    readonly metaData: string;
    readonly overview: string;
    readonly tailSamplingPolicies: string;
    readonly elasticAgent: string;
    readonly storageExplorer: string;
    readonly infrastructureTab: string;
    readonly spanCompression: string;
    readonly transactionSampling: string;
    readonly indexLifecycleManagement: string;
    readonly metricsUi: string;
  };
  readonly canvas: {
    readonly guide: string;
  };
  readonly cloud: {
    readonly beatsAndLogstashConfiguration: string;
    readonly elasticsearchBillingManagingCosts: string;
    readonly indexManagement: string;
    readonly cloudConnect: string;
    readonly connectToAutoops: string;
    readonly deploymentSignup: string;
    readonly cloudPricing: string;
  };
  readonly console: {
    readonly guide: string;
  };
  readonly dashboard: {
    readonly guide: string;
    readonly drilldowns: string;
    readonly drilldownsTriggerPicker: string;
    readonly urlDrilldownTemplateSyntax: string;
    readonly urlDrilldownVariables: string;
  };
  readonly discover: Record<string, string>;
  readonly filebeat: {
    readonly base: string;
    readonly installation: string;
    readonly configuration: string;
    readonly elasticsearchOutput: string;
    readonly elasticsearchModule: string;
    readonly startup: string;
    readonly exportedFields: string;
    readonly suricataModule: string;
    readonly zeekModule: string;
  };
  readonly auditbeat: {
    readonly base: string;
    readonly auditdModule: string;
    readonly systemModule: string;
  };
  readonly searchHomepage: {
    readonly visitSearchLabs: string;
    readonly notebooksExamples: string;
    readonly customerEngineerRequestForm: string;
    readonly elasticCommunity: string;
    readonly elasticCloud: string;
  };
  readonly searchGettingStarted: {
    readonly visitSearchLabs: string;
    readonly notebooksExamples: string;
    readonly elasticTraining: string;
  };
  readonly metricbeat: {
    readonly base: string;
    readonly configure: string;
    readonly httpEndpoint: string;
    readonly install: string;
    readonly start: string;
  };
  readonly enterpriseSearch: {
    readonly aiSearchDoc: string;
    readonly aiSearchHelp: string;
    readonly apiKeys: string;
    readonly behavioralAnalytics: string;
    readonly behavioralAnalyticsCORS: string;
    readonly behavioralAnalyticsEvents: string;
    readonly buildConnector: string;
    readonly bulkApi: string;
    readonly configuration: string;
    readonly connectors: string;
    readonly connectorsClientDeploy: string;
    readonly connectorsMappings: string;
    readonly connectorsAzureBlobStorage: string;
    readonly connectorsBox: string;
    readonly connectorsClients: string;
    readonly connectorsConfluence: string;
    readonly connectorsContentExtraction: string;
    readonly connectorsDropbox: string;
    readonly connectorsGithub: string;
    readonly connectorsGitlab: string;
    readonly connectorsGoogleCloudStorage: string;
    readonly connectorsGoogleDrive: string;
    readonly connectorsGmail: string;
    readonly connectorsJira: string;
    readonly connectorsMicrosoftSQL: string;
    readonly connectorsMongoDB: string;
    readonly connectorsMySQL: string;
    readonly connectorsNative: string;
    readonly connectorsNetworkDrive: string;
    readonly connectorsNotion: string;
    readonly connectorsOneDrive: string;
    readonly connectorsOracle: string;
    readonly connectorsOutlook: string;
    readonly connectorsPostgreSQL: string;
    readonly connectorsRedis: string;
    readonly connectorsS3: string;
    readonly connectorsSalesforce: string;
    readonly connectorsServiceNow: string;
    readonly connectorsSharepoint: string;
    readonly connectorsSharepointOnline: string;
    readonly connectorsTeams: string;
    readonly connectorsSlack: string;
    readonly connectorsZoom: string;
    readonly crawlerExtractionRules: string;
    readonly crawlerManaging: string;
    readonly crawlerOverview: string;
    readonly deployTrainedModels: string;
    readonly documentLevelSecurity: string;
    readonly e5Model: string;
    readonly elasticInferenceService: string;
    readonly elasticInferenceServicePricing: string;
    readonly elasticInferenceServiceSupportedModels: string;
    readonly elser: string;
    readonly engines: string;
    readonly indexApi: string;
    readonly inferenceApiCreate: string;
    readonly inferenceApisConfigureChunking: string;
    readonly ingestionApis: string;
    readonly ingestPipelines: string;
    readonly knnSearch: string;
    readonly knnSearchCombine: string;
    readonly knnSearchTuneForSpeedAccuracy: string;
    readonly languageAnalyzers: string;
    readonly languageClients: string;
    readonly licenseManagement: string;
    readonly machineLearningStart: string;
    readonly mailService: string;
    readonly mlDocumentEnrichment: string;
    readonly searchApplicationsTemplates: string;
    readonly searchApplicationsSearchApi: string;
    readonly searchApplications: string;
    readonly searchApplicationsSearch: string;
    readonly searchLabs: string;
    readonly searchLabsRepo: string;
    readonly semanticSearch: string;
    readonly semanticSearchGetStarted: string;
    readonly searchTemplates: string;
    readonly semanticTextField: string;
    readonly esAsVectorDatabase: string;
    readonly vectorSearch: string;
    readonly vectorSearchEmbeddingModels: string;
    readonly vectorSearchBringOwnVectors: string;
    readonly vectorSearchStorageOptimization: string;
    readonly vectorSearchVectorsAndEmbeddings: string;
    readonly start: string;
    readonly supportedNlpModels: string;
    readonly syncRules: string;
    readonly syncRulesAdvanced: string;
    readonly trainedModels: string;
    readonly textEmbedding: string;
    readonly troubleshootSetup: string;
    readonly usersAccess: string;
    readonly upgrade9x: string;
  };
  readonly heartbeat: {
    readonly base: string;
    readonly monitorTags: string;
  };
  readonly libbeat: {
    readonly getStarted: string;
  };
  readonly logstash: {
    readonly base: string;
    readonly inputElasticAgent: string;
  };
  readonly winlogbeat: {
    readonly base: string;
  };
  readonly aggs: {
    readonly composite: string;
    readonly composite_missing_bucket: string;
    readonly date_histogram: string;
    readonly date_range: string;
    readonly date_format_pattern: string;
    readonly filter: string;
    readonly filters: string;
    readonly geohash_grid: string;
    readonly histogram: string;
    readonly ip_range: string;
    readonly range: string;
    readonly significant_terms: string;
    readonly terms: string;
    readonly terms_doc_count_error: string;
    readonly rare_terms: string;
    readonly avg: string;
    readonly avg_bucket: string;
    readonly max_bucket: string;
    readonly min_bucket: string;
    readonly sum_bucket: string;
    readonly cardinality: string;
    readonly count: string;
    readonly cumulative_sum: string;
    readonly derivative: string;
    readonly geo_bounds: string;
    readonly geo_centroid: string;
    readonly max: string;
    readonly median: string;
    readonly min: string;
    readonly moving_avg: string;
    readonly percentile_ranks: string;
    readonly serial_diff: string;
    readonly std_dev: string;
    readonly sum: string;
    readonly top_hits: string;
    readonly change_point: string;
  };
  readonly runtimeFields: {
    readonly overview: string;
    readonly mapping: string;
  };
  readonly scriptedFields: {
    readonly scriptFields: string;
    readonly scriptAggs: string;
    readonly painless: string;
    readonly painlessApi: string;
    readonly painlessLangSpec: string;
    readonly painlessSyntax: string;
    readonly painlessWalkthrough: string;
    readonly luceneExpressions: string;
  };
  readonly search: {
    readonly sessions: string;
    readonly sessionLimits: string;
  };
  readonly indexPatterns: {
    readonly introduction: string;
    readonly fieldFormattersNumber: string;
    readonly fieldFormattersString: string;
    readonly runtimeFields: string;
    readonly migrateOffScriptedFields: string;
  };
  readonly addData: string;
  readonly kibana: {
    readonly askElastic: string;
    readonly createGithubIssue: string;
    readonly feedback: string;
    readonly guide: string;
    readonly autocompleteSuggestions: string;
    readonly secureSavedObject: string;
    readonly xpackSecurity: string;
    readonly upgradeNotes: string;
  };
  readonly upgradeAssistant: {
    readonly overview: string;
    readonly batchReindex: string;
    readonly indexBlocks: string;
    readonly remoteReindex: string;
    readonly unfreezeApi: string;
    readonly reindexWithPipeline: string;
    readonly logsDatastream: string;
    readonly usingLogsDbIndexModeWithESSecurity: string;
    readonly dataStreamReindex: string;
  };
  readonly rollupJobs: string;
  readonly elasticsearch: Record<string, string>;
  readonly siem: {
    readonly privileges: string;
    readonly guide: string;
    readonly gettingStarted: string;
    readonly ml: string;
    readonly ruleChangeLog: string;
    readonly detectionsReq: string;
    readonly networkMap: string;
    readonly troubleshootGaps: string;
    readonly gapsTable: string;
    readonly ruleApiOverview: string;
    readonly configureAlertSuppression: string;
    readonly ingestDataToSecurity: string;
    readonly automaticImport: string;
    readonly attacksPage: string;
    readonly mitreCoverage: string;
  };
  readonly server: {
    readonly protocol: string;
    readonly publicBaseUrl: string;
    readonly troubleshootServerNotReady: string;
  };
  readonly logging: {
    readonly enableDeprecationHttpDebugLogs: string;
  };
  readonly securitySolution: {
    readonly aiAssistant: {
      home: string;
      knowledgeBaseHome: string;
      knowledgeBaseIndexEntries: string;
    };
    readonly cloudSecurityPosture: string;
    readonly installElasticDefend: string;
    readonly artifactControl: string;
    readonly avcResults: string;
    readonly bidirectionalIntegrations: string;
    readonly thirdPartyLlmProviders: string;
    readonly endpointExceptions: string;
    readonly trustedApps: string;
    readonly trustedDevices: string;
    readonly elasticAiFeatures: string;
    readonly eventFilters: string;
    readonly eventMerging: string;
    readonly blocklist: string;
    readonly endpointArtifacts: string;
    readonly endpointArtifactsNoEscaping: string;
    readonly scriptLibrary: string;
    readonly policyResponseTroubleshooting: {
      full_disk_access: string;
      macos_system_ext: string;
      linux_deadlock: string;
    };
    readonly packageActionTroubleshooting: {
      es_connection: string;
    };
    readonly threatIntelInt: string;
    readonly responseActions: string;
    readonly configureEndpointIntegrationPolicy: string;
    readonly exceptions: {
      value_lists: string;
    };
    readonly privileges: string;
    readonly manageDetectionRules: string;
    readonly createDetectionRules: string;
    readonly updatePrebuiltDetectionRules: string;
    readonly prebuiltRuleCustomizationPromoBlog: string;
    readonly resolvePrebuiltRuleConflicts: string;
    readonly createEsqlRuleType: string;
    readonly ruleUiAdvancedParams: string;
    readonly entityAnalytics: {
      readonly api: string;
      readonly riskScorePrerequisites: string;
      readonly entityRiskScoring: string;
      readonly assetCriticality: string;
      readonly privilegedUserMonitoring: string;
      readonly mlAnomalyDetection: string;
    };
    readonly detectionEngineOverview: string;
    readonly signalsMigrationApi: string;
    readonly siemMigrations: string;
    readonly llmPerformanceMatrix: string;
  };
  readonly query: {
    readonly eql: string;
    readonly kueryQuerySyntax: string;
    readonly luceneQuery: string;
    readonly luceneQuerySyntax: string;
    readonly percolate: string;
    readonly queryDsl: string;
    readonly queryESQL: string;
    readonly queryESQLExamples: string;
    readonly queryESQLApproximateResults: string;
    readonly queryESQLMultiValueControls: string;
    readonly queryESQLMvIntersects: string;
  };
  readonly date: {
    readonly dateMath: string;
    readonly dateMathIndexNames: string;
  };
  readonly management: Record<string, string>;
  readonly ml: Record<string, string>;
  readonly transforms: Record<string, string>;
  readonly visualize: Record<string, string>;
  readonly apis: Readonly<{
    bulkIndexAlias: string;
    indexStats: string;
    byteSizeUnits: string;
    createAutoFollowPattern: string;
    createFollower: string;
    createIndex: string;
    createSnapshotLifecyclePolicy: string;
    createRoleMapping: string;
    createRoleMappingTemplates: string;
    createRollupJobsRequest: string;
    createApiKey: string;
    createApiKeyMetadata: string;
    createApiKeyRoleDescriptors: string;
    createCrossClusterApiKey: string;
    createPipeline: string;
    createTransformRequest: string;
    cronExpressions: string;
    executeWatchActionModes: string;
    indexExists: string;
    inferTrainedModel: string;
    multiSearch: string;
    openIndex: string;
    putComponentTemplate: string;
    painlessExecute: string;
    painlessExecuteAPIContexts: string;
    putComponentTemplateMetadata: string;
    putSnapshotLifecyclePolicy: string;
    putIndexTemplateV1: string;
    putWatch: string;
    restApis: string;
    searchPreference: string;
    securityApis: string;
    simulatePipeline: string;
    tasks: string;
    timeUnits: string;
    updateTransform: string;
  }>;
  readonly observability: Readonly<{
    guide: string;
    infrastructureThreshold: string;
    logsThreshold: string;
    metricsThreshold: string;
    customThreshold: string;
    monitorStatus: string;
    monitorUptime: string;
    tlsCertificate: string;
    uptimeDurationAnomaly: string;
    monitorLogs: string;
    logsStreams: string;
    wiredStreams: string;
    analyzeMetrics: string;
    monitorUptimeSynthetics: string;
    userExperience: string;
    createAlerts: string;
    syntheticsAlerting: string;
    syntheticsCommandReference: string;
    syntheticsProjectMonitors: string;
    syntheticsMigrateFromIntegration: string;
    slo: string;
    sloBurnRateRule: string;
    aiAssistant: string;
    elasticManagedLlm: string;
    elasticManagedLlmUsageCost: string;
    elasticServerlessSearchManagedLlmUsageCost: string;
    downsamplingConcepts: string;
  }>;
  readonly alerting: Readonly<{
    authorization: string;
    guide: string;
    actionTypes: string;
    apmRulesErrorCount: string;
    apmRulesTransactionDuration: string;
    apmRulesTransactionError: string;
    apmRulesAnomaly: string;
    emailAction: string;
    emailActionConfig: string;
    emailExchangeClientSecretConfig: string;
    emailExchangeClientIdConfig: string;
    generalSettings: string;
    indexAction: string;
    esQuery: string;
    indexThreshold: string;
    maintenanceWindows: string;
    pagerDutyAction: string;
    preconfiguredConnectors: string;
    preconfiguredAlertHistoryConnector: string;
    serviceNowAction: string;
    serviceNowSIRAction: string;
    setupPrerequisites: string;
    slackAction: string;
    slackApiAction: string;
    teamsAction: string;
    casesWebhookAction: string;
    connectors: string;
  }>;
  readonly taskManager: Readonly<{
    healthMonitoring: string;
  }>;
  readonly maps: Readonly<{
    connectToEms: string;
    guide: string;
    importGeospatialPrivileges: string;
    gdalTutorial: string;
    termJoinsExample: string;
  }>;
  readonly monitoring: Record<string, string>;
  readonly reporting: Readonly<{
    cloudMinimumRequirements: string;
    browserSystemDependencies: string;
    browserSandboxDependencies: string;
  }>;
  readonly security: Readonly<{
    apiKeyServiceSettings: string;
    clusterPrivileges: string;
    definingRoles: string;
    elasticsearchSettings: string;
    elasticsearchEnableSecurity: string;
    elasticsearchEnableApiKeys: string;
    indicesPrivileges: string;
    kibanaTLS: string;
    kibanaPrivileges: string;
    mappingRoles: string;
    mappingRolesFieldRules: string;
    roles: string;
    runAsPrivilege: string;
    enableElasticSearchSecurityFeatures: string;
  }>;
  readonly spaces: Readonly<{
    kibanaLegacyUrlAliases: string;
    kibanaDisableLegacyUrlAliasesApi: string;
    kibanaManageSpaces: string;
  }>;
  readonly watcher: Record<string, string>;
  readonly ccs: Record<string, string>;
  readonly plugins: {
    azureRepo: string;
    gcsRepo: string;
    hdfsRepo: string;
    ingestAttachment: string;
    s3Repo: string;
    snapshotRestoreRepos: string;
    mapperSize: string;
  };
  readonly snapshotRestore: Record<string, string>;
  readonly ingest: Record<string, string>;
  readonly fleet: Readonly<{
    beatsAgentComparison: string;
    guide: string;
    fingerprint: string;
    fleetServer: string;
    fleetServerAddFleetServer: string;
    esSettings: string;
    settings: string;
    logstashSettings: string;
    kafkaSettings: string;
    kafkaOutputTopicsSettings: string;
    settingsFleetServerHostSettings: string;
    settingsFleetServerProxySettings: string;
    troubleshooting: string;
    elasticAgent: string;
    datastreams: string;
    datastreamsILM: string;
    datastreamsNamingScheme: string;
    datastreamsManualRollover: string;
    datastreamsTSDS: string;
    datastreamsTSDSMetrics: string;
    datastreamsDownsampling: string;
    installElasticAgent: string;
    installElasticAgentStandalone: string;
    grantESAccessToStandaloneAgents: string;
    packageSignatures: string;
    upgradeElasticAgent: string;
    learnMoreBlog: string;
    apiKeysLearnMore: string;
    onPremRegistry: string;
    secureLogstash: string;
    agentPolicy: string;
    agentlessIntegrations: string;
    api: string;
    managedOtlp: string;
    uninstallAgent: string;
    installAndUninstallIntegrationAssets: string;
    elasticAgentInputConfiguration: string;
    elasticAgentInputConditions: string;
    policySecrets: string;
    remoteESOoutput: string;
    performancePresets: string;
    scalingKubernetesResourcesAndLimits: string;
    roleAndPrivileges: string;
    proxiesSettings: string;
    unprivilegedMode: string;
    httpMonitoring: string;
    agentLevelLogging: string;
    remoteESOoutputTroubleshooting: string;
    agentReleaseProcess: string;
    fipsIngest: string;
    edotCollector: string;
    agentPolicyLimitCpu: string;
    agentDownloadTimeout: string;
    elasticAgentStandaloneDownload: string;
    elasticAgentStandaloneLoggingConfig: string;
    agentPolicyLogLevel: string;
    elasticAgentLogFileRetention: string;
  }>;
  readonly integrationDeveloper: {
    upload: string;
  };
  readonly ecs: {
    readonly guide: string;
    readonly dataStreams: string;
  };
  readonly clients: {
    readonly guide: string;
    readonly goConnecting: string;
    readonly goGettingStarted: string;
    readonly goIndex: string;
    readonly goOverview: string;
    readonly javaBasicAuthentication: string;
    readonly javaIndex: string;
    readonly javaInstallation: string;
    readonly javaIntroduction: string;
    readonly javaRestLow: string;
    readonly jsAdvancedConfig: string;
    readonly jsApiReference: string;
    readonly jsBasicConfig: string;
    readonly jsClientConnecting: string;
    readonly jsIntro: string;
    readonly netGuide: string;
    readonly netIntroduction: string;
    readonly netNest: string;
    readonly netSingleNode: string;
    readonly phpConfiguration: string;
    readonly phpConnecting: string;
    readonly phpGuide: string;
    readonly phpInstallation: string;
    readonly phpOverview: string;
    readonly pythonAuthentication: string;
    readonly pythonConfig: string;
    readonly pythonConnecting: string;
    readonly pythonGuide: string;
    readonly pythonOverview: string;
    readonly rubyAuthentication: string;
    readonly rubyAdvancedConfig: string;
    readonly rubyBasicConfig: string;
    readonly rubyExamples: string;
    readonly rubyOverview: string;
    readonly rustGuide: string;
    readonly rustOverview: string;
    readonly eland: string;
  };
  readonly endpoints: {
    readonly troubleshooting: string;
  };
  readonly legal: {
    readonly privacyStatement: string;
    readonly generalPrivacyStatement: string;
    readonly termsOfService: string;
    readonly dataUse: string;
  };
  readonly kibanaUpgradeSavedObjects: {
    readonly resolveMigrationFailures: string;
    readonly repeatedTimeoutRequests: string;
    readonly routingAllocationDisabled: string;
    readonly clusterShardLimitExceeded: string;
  };
  readonly searchUI: {
    readonly appSearch: string;
    readonly elasticsearch: string;
  };
  readonly serverlessClients: {
    readonly clientLib: string;
    readonly goApiReference: string;
    readonly goGettingStarted: string;
    readonly httpApis: string;
    readonly httpApiReferences: string;
    readonly jsApiReference: string;
    readonly jsGettingStarted: string;
    readonly phpApiReference: string;
    readonly phpGettingStarted: string;
    readonly pythonApiReference: string;
    readonly pythonGettingStarted: string;
    readonly pythonReferences: string;
    readonly rubyApiReference: string;
    readonly rubyGettingStarted: string;
  };
  readonly serverlessSearch: {
    readonly gettingStartedExplore: string;
    readonly gettingStartedIngest: string;
    readonly gettingStartedSearch: string;
    readonly integrations: string;
    readonly integrationsBeats: string;
    readonly integrationsConnectorClient: string;
    readonly integrationsConnectorClientAvailableConnectors: string;
    readonly integrationsConnectorClientRunFromSource: string;
    readonly integrationsConnectorClientRunWithDocker: string;
    readonly integrationsLogstash: string;
  };
  readonly serverlessSecurity: {
    readonly apiKeyPrivileges: string;
  };
  readonly synthetics: {
    readonly featureRoles: string;
  };
  readonly telemetry: {
    readonly settings: string;
  };
  readonly playground: {
    readonly chatPlayground: string;
    readonly retrievalOptimize: string;
    readonly retrieval: string;
    readonly context: string;
    readonly hiddenFields: string;
  };
  readonly inferenceManagement: {
    readonly inferenceAPIDocumentation: string;
    readonly featureSettings: string;
    readonly externalInference: string;
  };
  readonly synonyms: {
    readonly synonymsAPIDocumentation: string;
  };
  readonly queryRules: {
    readonly queryRulesAPIDocumentation: string;
  };
  readonly datasetQuality: {
    readonly failureStore: string;
  };
  readonly agentBuilder: {
    readonly agentBuilder: string;
    readonly getStarted: string;
    readonly models: string;
    readonly chat: string;
    readonly agentBuilderAgents: string;
    readonly agentBuilderSkills: string;
    readonly agentBuilderPlugins: string;
    readonly agentBuilderConnectors: string;
    readonly agentBuilderTools: string;
    readonly elasticCapabilities: string;
    readonly programmaticAccess: string;
    readonly kibanaApi: string;
    readonly mcpServer: string;
    readonly a2aServer: string;
    readonly limitationsKnownIssues: string;
    readonly learnMore: string;
  };
  readonly indexManagement: {
    readonly componentTemplate: string;
    readonly indexAlias: string;
  };
  readonly subscriptions: string;
  readonly cases: {
    readonly casesPermissions: string;
    readonly configureCaseSettings: string;
  };
}

export type BuildFlavor = 'serverless' | 'traditional';
