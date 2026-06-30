/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';

import type { IngestPipeline } from '@elastic/elasticsearch/lib/api/types';

import type {
  ASSETS_SAVED_OBJECT_TYPE,
  agentAssetTypes,
  dataTypes,
  monitoringTypes,
  installationStatuses,
} from '../../constants';
import type { CloudConnectors, ValueOf } from '..';

import type {
  PackageSpecManifest,
  PackageSpecIcon,
  PackageSpecCategory,
  RegistryVarGroup,
} from './package_spec';

export type InstallationStatus = typeof installationStatuses;

export enum InstallStatus {
  installed = 'installed',
  notInstalled = 'not_installed',
  installing = 'installing',
  reinstalling = 'reinstalling',
  uninstalling = 'uninstalling',
  rollingBack = 'rolling_back',
}

export interface DefaultPackagesInstallationError {
  installType: InstallType;
  error: Error;
}

export type InstallType = 'reinstall' | 'reupdate' | 'rollback' | 'update' | 'install' | 'unknown';
export type InstallSource = 'registry' | 'upload' | 'bundled' | 'custom';

export type EpmPackageInstallStatus = 'installed' | 'installing' | 'install_failed';
export type InstallResultStatus = 'installed' | 'already_installed';

export type ServiceName = 'kibana' | 'elasticsearch';
export type AgentAssetType = typeof agentAssetTypes;
export type DocAssetType = 'doc' | 'notice' | 'license';
export type AssetType =
  | KibanaAssetType
  | ElasticsearchAssetType
  | ValueOf<AgentAssetType>
  | DocAssetType;

/*
  Enum mapping of a saved object asset type to how it would appear in a package file path (snake cased)
*/
export enum KibanaAssetType {
  dashboard = 'dashboard',
  lens = 'lens',
  visualization = 'visualization',
  search = 'search',
  indexPattern = 'index_pattern',
  map = 'map',
  mlModule = 'ml_module',
  securityAIPrompt = 'security_ai_prompt',
  securityRule = 'security_rule',
  cloudSecurityPostureRuleTemplate = 'csp_rule_template',
  alertingRuleTemplate = 'alerting_rule_template',
  sloTemplate = 'slo_template',
  osqueryPackAsset = 'osquery_pack_asset',
  osquerySavedQuery = 'osquery_saved_query',
  tag = 'tag',
}

/*
 Enum of saved object types that are allowed to be installed
*/
export enum KibanaSavedObjectType {
  dashboard = 'dashboard',
  lens = 'lens',
  visualization = 'visualization',
  search = 'search',
  indexPattern = 'index-pattern',
  map = 'map',
  mlModule = 'ml-module',
  securityAIPrompt = 'security-ai-prompt',
  securityRule = 'security-rule',
  cloudSecurityPostureRuleTemplate = 'csp-rule-template',
  alertingRuleTemplate = 'alerting_rule_template',
  sloTemplate = 'slo_template',
  osqueryPackAsset = 'osquery-pack-asset',
  osquerySavedQuery = 'osquery-saved-query',
  tag = 'tag',
  alert = 'alert',
}

export enum ElasticsearchAssetType {
  index = 'index',
  indexTemplate = 'index_template',
  componentTemplate = 'component_template',
  ingestPipeline = 'ingest_pipeline',
  ilmPolicy = 'ilm_policy',
  dataStreamIlmPolicy = 'data_stream_ilm_policy',
  transform = 'transform',
  mlModel = 'ml_model',
  knowledgeBase = 'knowledge_base',
  esqlView = 'esql_view',
}

export type FleetElasticsearchAssetType = Exclude<
  ElasticsearchAssetType,
  ElasticsearchAssetType.index
>;

export type DisplayedAssetTypes = Array<`${KibanaSavedObjectType | ElasticsearchAssetType}`>;

// Defined as part of the removing public references to saved object schemas
export interface SimpleSOAssetType {
  id: string;
  type: ElasticsearchAssetType | KibanaSavedObjectType;
  updatedAt?: string;
  attributes: {
    service?: string;
    title?: string;
    description?: string;
  };
}

export interface AssetSOObject {
  id: string;
  type: ElasticsearchAssetType | KibanaSavedObjectType;
}

export type DataType = typeof dataTypes;
export type MonitoringType = typeof monitoringTypes;
export type InstallablePackage = RegistryPackage | ArchivePackage;

export type AssetsMap = Map<string, Buffer | undefined>;

export type PackagePolicyAssetsMap = AssetsMap & { __brand: 'PackagePolicyAssetsMap' };

export interface ArchiveEntry {
  path: string;
  buffer?: Buffer;
}

export interface ArchiveIterator {
  traverseEntries: (
    onEntry: (entry: ArchiveEntry) => Promise<void>,
    readBuffer?: (path: string) => boolean
  ) => Promise<void>;
  getPaths: () => Promise<string[]>;
}

export interface PackageInstallContext {
  packageInfo: InstallablePackage;
  paths: string[];
  archiveIterator: ArchiveIterator;
}

export type ArchivePackage = PackageSpecManifest &
  // should an uploaded package be able to specify `internal`?
  Pick<RegistryPackage, 'readme' | 'assets' | 'data_streams' | 'internal' | 'elasticsearch'>;

export interface BundledPackage {
  name: string;
  version: string;
  getBuffer: () => Promise<Buffer>;
}

export type RegistryPackage = PackageSpecManifest &
  Partial<RegistryOverridesToOptional> &
  RegistryAdditionalProperties &
  RegistryOverridePropertyValue;

// Registry packages do have extra fields.
// cf. type Package struct at https://github.com/elastic/package-registry/blob/master/util/package.go
type RegistryOverridesToOptional = Pick<PackageSpecManifest, 'title' | 'release'>;

// our current types have `download`, & `path` as required but they're are optional (have `omitempty`) according to
// https://github.com/elastic/package-registry/blob/master/util/package.go#L57
// & https://github.com/elastic/package-registry/blob/master/util/package.go#L80-L81
// However, they are always present in every registry response I checked. Chose to keep types unchanged for now
// and confirm with Registry if they are really optional. Can update types and ~4 places in code later if neccessary
interface RegistryAdditionalProperties {
  assets?: string[];
  download?: string;
  signature_path?: string;
  path?: string;
  readme?: string;
  internal?: boolean; // Registry addition[0] and EPM uses it[1] [0]: https://github.com/elastic/package-registry/blob/dd7b021893aa8d66a5a5fde963d8ff2792a9b8fa/util/package.go#L63 [1]
  data_streams?: RegistryDataStream[]; // Registry addition [0] [0]: https://github.com/elastic/package-registry/blob/dd7b021893aa8d66a5a5fde963d8ff2792a9b8fa/util/package.go#L65
  elasticsearch?: {
    privileges?: {
      cluster?: string[];
    };
  };
}
interface RegistryOverridePropertyValue {
  icons?: RegistryImage[];
  screenshots?: RegistryImage[];
}

export type RegistryRelease = NonNullable<PackageSpecManifest['release']>;
export interface RegistryImage extends PackageSpecIcon {
  path: string;
}

export interface DeploymentsModesDefault {
  enabled: boolean;
  is_default?: boolean;
}

// Ordering should be from least to most mature
export enum AgentlessDeploymentReleaseStatus {
  Beta = 'beta',
  GA = 'ga',
}

export interface DeploymentsModesAgentless extends DeploymentsModesDefault {
  organization?: string;
  division?: string;
  team?: string;
  cloud_connectors?: CloudConnectors;
  resources?: {
    requests: {
      cpu: string;
      memory: string;
    };
  };
  release?: AgentlessDeploymentReleaseStatus;
}
export interface DeploymentsModes {
  agentless: DeploymentsModesAgentless;
  default?: DeploymentsModesDefault;
}

type Action = 'action';
type NextStep = 'next_step';
export interface ConfigurationLink {
  title: string;
  url: string;
  type: Action | NextStep;
  content?: string;
}
export interface DeprecationInfo {
  description: string;
  since?: string;
  replaced_by?: Partial<
    Record<'package' | 'policyTemplate' | 'input' | 'dataStream' | 'variable', string>
  >;
}

/**
 * Cloud provider permission requirement declared in a package manifest.
 * Introduced in package-spec 3.7.0 (provider_permissions field).
 * Can appear at package, policy_template, input, and data_stream levels.
 */
export interface RegistryProviderPermissions {
  /** Cloud provider identifier, e.g. 'aws', 'gcp', 'azure', 'kubernetes'. */
  provider: string;
  /** Individual permission grants (e.g. 's3:GetObject', 'storage.objects.get'). */
  permissions?: string[];
  /** Pre-defined roles or managed policies to attach (e.g. 'SecurityAudit', 'roles/logging.viewer'). */
  roles?: string[];
}

export enum RegistryPolicyTemplateKeys {
  categories = 'categories',
  data_streams = 'data_streams',
  inputs = 'inputs',
  readme = 'readme',
  multiple = 'multiple',
  type = 'type',
  required_vars = 'required_vars',
  vars = 'vars',
  input = 'input',
  template_path = 'template_path',
  template_paths = 'template_paths',
  name = 'name',
  title = 'title',
  description = 'description',
  icons = 'icons',
  screenshots = 'screenshots',
  deployment_modes = 'deployment_modes',
  configuration_links = 'configuration_links',
  fips_compatible = 'fips_compatible',
  dynamic_signal_types = 'dynamic_signal_types',
  var_groups = 'var_groups',
  deprecated = 'deprecated',
  sections = 'sections',
  provider_permissions = 'provider_permissions',
}
interface BaseTemplate {
  [RegistryPolicyTemplateKeys.name]: string;
  [RegistryPolicyTemplateKeys.title]: string;
  [RegistryPolicyTemplateKeys.description]: string;
  [RegistryPolicyTemplateKeys.icons]?: RegistryImage[];
  [RegistryPolicyTemplateKeys.screenshots]?: RegistryImage[];
  [RegistryPolicyTemplateKeys.multiple]?: boolean;
  [RegistryPolicyTemplateKeys.deployment_modes]?: DeploymentsModes;
  [RegistryPolicyTemplateKeys.configuration_links]?: ConfigurationLink[];
  [RegistryPolicyTemplateKeys.fips_compatible]?: boolean | undefined;
  [RegistryPolicyTemplateKeys.deprecated]?: DeprecationInfo;
  [RegistryPolicyTemplateKeys.provider_permissions]?: RegistryProviderPermissions[];
}
export interface RegistryPolicyIntegrationTemplate extends BaseTemplate {
  [RegistryPolicyTemplateKeys.categories]?: Array<PackageSpecCategory | undefined>;
  [RegistryPolicyTemplateKeys.data_streams]?: string[];
  [RegistryPolicyTemplateKeys.inputs]?: RegistryInput[];
  [RegistryPolicyTemplateKeys.readme]?: string;
}

export interface RegistryPolicyInputOnlyTemplate extends BaseTemplate {
  [RegistryPolicyTemplateKeys.type]?: string;
  [RegistryPolicyTemplateKeys.input]: string;
  [RegistryPolicyTemplateKeys.template_path]?: string;
  [RegistryPolicyTemplateKeys.template_paths]?: string[];
  [RegistryPolicyTemplateKeys.required_vars]?: RegistryRequiredVars;
  [RegistryPolicyTemplateKeys.vars]?: RegistryVarsEntry[];
  [RegistryPolicyTemplateKeys.var_groups]?: RegistryVarGroup[];
  [RegistryPolicyTemplateKeys.sections]?: RegistrySection[];
  [RegistryPolicyTemplateKeys.dynamic_signal_types]?: boolean;
}

export type RegistryPolicyTemplate =
  | RegistryPolicyIntegrationTemplate
  | RegistryPolicyInputOnlyTemplate;

export enum RegistryInputKeys {
  name = 'name',
  type = 'type',
  title = 'title',
  description = 'description',
  template_path = 'template_path',
  template_paths = 'template_paths',
  input_group = 'input_group',
  required_vars = 'required_vars',
  vars = 'vars',
  var_groups = 'var_groups',
  deployment_modes = 'deployment_modes',
  hide_in_var_group_options = 'hide_in_var_group_options',
  deprecated = 'deprecated',
  migrate_from = 'migrate_from',
  dynamic_signal_types = 'dynamic_signal_types',
  show_divider = 'show_divider',
  sections = 'sections',
  provider_permissions = 'provider_permissions',
}

export type RegistryInputGroup = 'logs' | 'metrics';

export interface RegistryInput {
  /** Optional unique name within the policy template. When present, used as the discriminator for stream matching and keying instead of `type`. */
  [RegistryInputKeys.name]?: string;
  [RegistryInputKeys.type]: string;
  [RegistryInputKeys.title]: string;
  [RegistryInputKeys.description]: string;
  [RegistryInputKeys.template_path]?: string;
  [RegistryInputKeys.template_paths]?: string[];
  [RegistryInputKeys.input_group]?: RegistryInputGroup;
  [RegistryInputKeys.required_vars]?: RegistryRequiredVars;
  [RegistryInputKeys.vars]?: RegistryVarsEntry[];
  [RegistryInputKeys.var_groups]?: RegistryVarGroup[];
  [RegistryInputKeys.deployment_modes]?: string[];
  [RegistryInputKeys.hide_in_var_group_options]?: Record<string, string[]>;
  [RegistryInputKeys.deprecated]?: DeprecationInfo;
  [RegistryInputKeys.migrate_from]?: string;
  /** When true the data stream signal type (logs/metrics/traces) is determined at runtime by the agent. Valid for OTel collector inputs in composable integrations. */
  [RegistryInputKeys.dynamic_signal_types]?: boolean;
  /** When false, suppresses the automatic horizontal divider rendered after the input-level config section. Defaults to true. */
  [RegistryInputKeys.show_divider]?: boolean;
  [RegistryInputKeys.sections]?: RegistrySection[];
  [RegistryInputKeys.provider_permissions]?: RegistryProviderPermissions[];
}

export enum RegistryStreamKeys {
  input = 'input',
  title = 'title',
  description = 'description',
  enabled = 'enabled',
  required_vars = 'required_vars',
  vars = 'vars',
  template_path = 'template_path',
  template_paths = 'template_paths',
  ingestion_method = 'ingestion_method',
  var_groups = 'var_groups',
  deprecated = 'deprecated',
  migrate_from = 'migrate_from',
  sections = 'sections',
}

export interface RegistryStream {
  [RegistryStreamKeys.input]: string;
  [RegistryStreamKeys.title]: string;
  [RegistryStreamKeys.description]?: string;
  [RegistryStreamKeys.enabled]?: boolean;
  [RegistryStreamKeys.required_vars]?: RegistryRequiredVars;
  [RegistryStreamKeys.vars]?: RegistryVarsEntry[];
  [RegistryStreamKeys.template_path]?: string;
  [RegistryStreamKeys.template_paths]?: string[];
  [RegistryStreamKeys.ingestion_method]?: string;
  [RegistryStreamKeys.var_groups]?: RegistryVarGroup[];
  [RegistryStreamKeys.deprecated]?: DeprecationInfo;
  [RegistryStreamKeys.migrate_from]?: string;
  [RegistryStreamKeys.sections]?: RegistrySection[];
}

export type RegistryStreamWithDataStream = RegistryStream & { data_stream: RegistryDataStream };

// Registry's response types
// from /search
// https://github.com/elastic/package-registry/blob/master/docs/api/search.json
export type RegistrySearchResults = RegistrySearchResult[];
// from getPackageOutput at https://github.com/elastic/package-registry/blob/master/search.go
export type RegistrySearchResult = Pick<
  RegistryPackage,
  | 'name'
  | 'title'
  | 'version'
  | 'release'
  | 'description'
  | 'type'
  | 'download'
  | 'path'
  | 'icons'
  | 'internal'
  | 'data_streams'
  | 'policy_templates_behavior'
  | 'policy_templates'
  | 'categories'
  | 'discovery'
  | 'deprecated'
>;

// from /categories
// https://github.com/elastic/package-registry/blob/master/docs/api/categories.json
export type CategorySummaryList = CategorySummaryItem[];
export type CategoryId = string;
export interface CategorySummaryItem {
  id: CategoryId;
  title: string;
  count: number;
  parent_id?: string;
  parent_title?: string;
}

export type RequirementsByServiceName = PackageSpecManifest['conditions'];
export interface AssetParts {
  pkgkey: string;
  dataset?: string;
  service: ServiceName;
  type: AssetType;
  file: string;
}
export type AssetTypeToParts = KibanaAssetTypeToParts & ElasticsearchAssetTypeToParts;
export type AssetsGroupedByServiceByType = Record<
  Extract<ServiceName, 'kibana'>,
  KibanaAssetTypeToParts | undefined
> &
  Record<Extract<ServiceName, 'elasticsearch'>, ElasticsearchAssetTypeToParts | undefined>;

export type KibanaAssetParts = AssetParts & {
  service: Extract<ServiceName, 'kibana'>;
  type: KibanaAssetType;
};

export type ElasticsearchAssetParts = AssetParts & {
  service: Extract<ServiceName, 'elasticsearch'>;
  type: ElasticsearchAssetType;
};

export type KibanaAssetTypeToParts = Record<KibanaAssetType, KibanaAssetParts[]>;
export type ElasticsearchAssetTypeToParts = Record<
  FleetElasticsearchAssetType,
  ElasticsearchAssetParts[]
>;

export enum RegistryDataStreamKeys {
  type = 'type',
  ilm_policy = 'ilm_policy',
  hidden = 'hidden',
  dataset = 'dataset',
  title = 'title',
  release = 'release',
  streams = 'streams',
  package = 'package',
  path = 'path',
  ingest_pipeline = 'ingest_pipeline',
  elasticsearch = 'elasticsearch',
  dataset_is_prefix = 'dataset_is_prefix',
  routing_rules = 'routing_rules',
  lifecycle = 'lifecycle',
  agent = 'agent',
  provider_permissions = 'provider_permissions',
}

export interface RegistryDataStream {
  [key: string]: any;
  [RegistryDataStreamKeys.type]: string;
  [RegistryDataStreamKeys.ilm_policy]?: string;
  [RegistryDataStreamKeys.hidden]?: boolean;
  [RegistryDataStreamKeys.dataset]: string;
  [RegistryDataStreamKeys.title]: string;
  [RegistryDataStreamKeys.release]: RegistryRelease;
  [RegistryDataStreamKeys.streams]?: RegistryStream[];
  [RegistryDataStreamKeys.package]: string;
  [RegistryDataStreamKeys.path]: string;
  [RegistryDataStreamKeys.ingest_pipeline]?: string;
  [RegistryDataStreamKeys.elasticsearch]?: RegistryElasticsearch;
  [RegistryDataStreamKeys.dataset_is_prefix]?: boolean;
  [RegistryDataStreamKeys.routing_rules]?: RegistryDataStreamRoutingRules[];
  [RegistryDataStreamKeys.lifecycle]?: RegistryDataStreamLifecycle;
  [RegistryDataStreamKeys.lifecycle]?: RegistryDataStreamLifecycle;
  [RegistryDataStreamKeys.agent]?: RegistryAgent;
  [RegistryDataStreamKeys.provider_permissions]?: RegistryProviderPermissions[];
}

export type InputOnlyRegistryDataStream = Omit<
  Pick<RegistryDataStream, RegistryDataStreamKeys>,
  RegistryDataStreamKeys.type
> & {
  [RegistryDataStreamKeys.type]?: string;
};

export interface RegistryAgent {
  privileges?: { root?: boolean };
}

export interface RegistryElasticsearch {
  privileges?: RegistryDataStreamPrivileges;
  'index_template.settings'?: estypes.IndicesIndexSettings;
  'index_template.mappings'?: estypes.MappingTypeMapping;
  'index_template.data_stream'?: RegistryDataStreamProperties;
  'ingest_pipeline.name'?: string;
  source_mode?: 'default' | 'synthetic';
  index_mode?: 'time_series';
  dynamic_dataset?: boolean;
  dynamic_namespace?: boolean;
}

export interface RegistryDataStreamProperties {
  hidden?: boolean;
}

export interface RegistryDataStreamPrivileges {
  cluster?: string[];
  indices?: string[];
}

export interface RegistryDataStreamRoutingRules {
  source_dataset: string;
  rules: Array<{
    target_dataset: string;
    if: string;
    namespace?: string;
  }>;
}

export interface RegistryDataStreamLifecycle {
  data_retention: string;
}

export interface RegistryRequireVarConstraint {
  name: string;
  value?: string;
}

export interface RegistryRequiredVars {
  [key: string]: RegistryRequireVarConstraint[];
}

export type RegistryVarType =
  | 'integer'
  | 'bool'
  | 'password'
  | 'select'
  | 'text'
  | 'yaml'
  | 'string'
  | 'textarea'
  | 'duration'
  | 'url';

export interface RegistrySection {
  name: string;
  title: string;
  description?: string;
}
export enum RegistryVarsEntryKeys {
  name = 'name',
  title = 'title',
  description = 'description',
  type = 'type',
  required = 'required',
  show_user = 'show_user',
  multi = 'multi',
  options = 'options',
  default = 'default',
  os = 'os',
  secret = 'secret',
  hide_in_deployment_modes = 'hide_in_deployment_modes',
  full_width = 'full_width',
  min_duration = 'min_duration',
  max_duration = 'max_duration',
  url_allowed_schemes = 'url_allowed_schemes',
  deprecated = 'deprecated',
  migrate_from = 'migrate_from',
  section = 'section',
}

// EPR types this as `[]map[string]interface{}`
// which means the official/possible type is Record<string, any>
// but we effectively only see this shape
export interface RegistryVarsEntry {
  [RegistryVarsEntryKeys.name]: string;
  [RegistryVarsEntryKeys.title]?: string;
  [RegistryVarsEntryKeys.description]?: string;
  [RegistryVarsEntryKeys.type]: RegistryVarType;
  [RegistryVarsEntryKeys.required]?: boolean;
  [RegistryVarsEntryKeys.secret]?: boolean;
  [RegistryVarsEntryKeys.show_user]?: boolean;
  [RegistryVarsEntryKeys.multi]?: boolean;
  [RegistryVarsEntryKeys.options]?: Array<{ value: string; text: string }>;
  [RegistryVarsEntryKeys.default]?: string | string[] | boolean;
  [RegistryVarsEntryKeys.os]?: {
    [key: string]: {
      default: string | string[];
    };
  };
  [RegistryVarsEntryKeys.hide_in_deployment_modes]?: string[];
  [RegistryVarsEntryKeys.full_width]?: boolean;
  [RegistryVarsEntryKeys.min_duration]?: string;
  [RegistryVarsEntryKeys.max_duration]?: string;
  [RegistryVarsEntryKeys.url_allowed_schemes]?: string[];
  [RegistryVarsEntryKeys.deprecated]?: DeprecationInfo;
  // Accepts either the current object form or, for backwards compatibility, the original
  // string-shorthand form that named only the previous variable. The string form is treated
  // as `{ name: <string> }` at read time. New manifests should use the object form.
  [RegistryVarsEntryKeys.migrate_from]?: RegistryVarsMigrateFrom | string;
  [RegistryVarsEntryKeys.section]?: string;
}

/**
 * Declares that a variable was previously named differently or defined at a different scope.
 * At least one of `name` or `scope` must be set; both may be set together when a variable was
 * both renamed and moved between scopes.
 */
export interface RegistryVarsMigrateFrom {
  /** Previous name of the variable. Set when the variable was renamed between package versions. */
  name?: string;
  /**
   * The scope where this variable previously lived. Set when the variable moved between
   * input-level and stream-level within the same input type.
   */
  scope?: 'input' | 'stream';
  /**
   * Dataset name of the source stream when `scope` is "stream". Required when the source input
   * has more than one stream; may be omitted when the source input has exactly one stream.
   */
  stream?: string;
}

// Deprecated as part of the removing public references to saved object schemas
// See https://github.com/elastic/kibana/issues/149098
/**
 * @deprecated replaced with installationInfo
 */
export interface InstallableSavedObject {
  type: string;
  id: string;
  attributes: Installation;
  references?: SOReference[];
  created_at?: string;
  updated_at?: string;
  version?: string;
  coreMigrationVersion?: string;
  namespaces?: string[];
}
export type InstallationInfo = {
  type: string;
  created_at?: string;
  updated_at?: string;
  namespaces?: string[];
} & Omit<
  Installation,
  | 'package_assets'
  | 'es_index_patterns'
  | 'install_version'
  | 'install_started_at'
  | 'internal'
  | 'removable'
>;

// Deprecated as part of the removing public references to saved object schemas
// See https://github.com/elastic/kibana/issues/149098
/**
 * @deprecated
 */
interface SOReference {
  name: string;
  type: string;
  id: string;
}

// some properties are optional in Registry responses but required in EPM
// internal until we need them
export interface EpmPackageAdditions {
  title: string;
  latestVersion: string;
  assets: AssetsGroupedByServiceByType;
  notice?: string;
  licensePath?: string;
  keepPoliciesUpToDate?: boolean;
}

type Merge<FirstType, SecondType> = Omit<FirstType, Extract<keyof FirstType, keyof SecondType>> &
  SecondType;

// Managers public HTTP response types
export type PackageList = PackageListItem[];

// Remove savedObject when addressing the deprecation
export type PackageListItem = Installable<RegistrySearchResult> & {
  id: string;
  integration?: string;
  savedObject?: InstallableSavedObject;
  installationInfo?: InstallationInfo;
  packagePoliciesInfo?: { count: number };
};
export type PackagesGroupedByStatus = Record<ValueOf<InstallationStatus>, PackageList>;
export type PackageInfo =
  | Installable<Merge<RegistryPackage, EpmPackageAdditions>>
  | Installable<Merge<ArchivePackage, EpmPackageAdditions>>;

export interface PackageMetadata {
  has_policies: boolean;
}

export type IntegrationCardReleaseLabel = 'beta' | 'preview' | 'ga' | 'rc';

export type PackageVerificationStatus = 'verified' | 'unverified' | 'unknown';

// TODO - Expand this with other experimental indexing types
export type ExperimentalIndexingFeature =
  | 'synthetic_source'
  | 'tsdb'
  | 'doc_value_only_numeric'
  | 'doc_value_only_other';

export interface ExperimentalDataStreamFeature {
  data_stream: string;
  features: Partial<Record<ExperimentalIndexingFeature, boolean>>;
}

export interface FailedAttempt {
  created_at: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface InstallFailedAttempt extends FailedAttempt {
  target_version: string;
}

export interface CustomAssetFailedAttempt extends FailedAttempt {
  type: string;
  name: string;
}

export enum INSTALL_STATES {
  RESOLVE_DEPENDENCIES = 'resolve_dependencies',
  CREATE_RESTART_INSTALLATION = 'create_restart_installation',
  INSTALL_PRECHECK = 'install_precheck',
  INSTALL_ESQL_VIEWS = 'install_esql_views',
  INSTALL_KIBANA_ASSETS = 'install_kibana_assets',
  INSTALL_ILM_POLICIES = 'install_ilm_policies',
  CREATE_ALERTING_ASSETS = 'create_alerting_assets',
  INSTALL_ML_MODEL = 'install_ml_model',
  INSTALL_INDEX_TEMPLATE_PIPELINES = 'install_index_template_pipelines',
  REMOVE_LEGACY_TEMPLATES = 'remove_legacy_templates',
  UPDATE_CURRENT_WRITE_INDICES = 'update_current_write_indices',
  INSTALL_TRANSFORMS = 'install_transforms',
  DELETE_PREVIOUS_PIPELINES = 'delete_previous_pipelines',
  SAVE_ARCHIVE_ENTRIES = 'save_archive_entries_from_assets_map',
  SAVE_KNOWLEDGE_BASE = 'save_knowledge_base',
  RESOLVE_KIBANA_PROMISE = 'resolve_kibana_promise',
  UPDATE_SO = 'update_so',
}
type StatesKeys = keyof typeof INSTALL_STATES;
export type StateNames = (typeof INSTALL_STATES)[StatesKeys];

export interface LatestExecutedState<T> {
  name: T;
  started_at: string;
  error?: string;
}

export type InstallLatestExecutedState = LatestExecutedState<StateNames>;

export interface StateContext<T> {
  [key: string]: any;
  latestExecutedState?: LatestExecutedState<T>;
}

export type PackageDependencies = { name: string; version: string }[];

/** Packages (name, version) that have this package as a dependency */
export type IsDependencyOf = PackageDependencies;

export interface Installation {
  installed_kibana: KibanaAssetReference[];
  additional_spaces_installed_kibana?: Record<string, KibanaAssetReference[]>;
  installed_es: EsAssetReference[];
  package_assets?: PackageAssetReference[];
  es_index_patterns: Record<string, string>;
  name: string;
  version: string;
  install_status: EpmPackageInstallStatus;
  install_version: string;
  install_started_at: string;
  install_source: InstallSource;
  installed_kibana_space_id?: string;
  keep_policies_up_to_date?: boolean;
  install_format_schema_version?: string;
  verification_status: PackageVerificationStatus;
  verification_key_id?: string | null;
  experimental_data_stream_features?: ExperimentalDataStreamFeature[];
  internal?: boolean;
  removable?: boolean;
  latest_install_failed_attempts?: InstallFailedAttempt[];
  latest_uninstall_failed_attempts?: FailedAttempt[];
  latest_executed_state?: InstallLatestExecutedState;
  latest_custom_asset_install_failed_attempts?: { [asset: string]: CustomAssetFailedAttempt };
  previous_version?: string | null;
  rolled_back?: boolean;
  is_rollback_ttl_expired?: boolean;
  pending_upgrade_review?: {
    target_version: string;
    reason: 'deprecated';
    created_at: string;
    deprecation_details?: DeprecationInfo;
    action?: 'accepted' | 'declined' | 'pending';
  };
  dependencies?: PackageDependencies | null;
  /** Packages (name, version) that have this package as a dependency */
  is_dependency_of?: IsDependencyOf | null;
  /** Whether the package was installed as a dependency (not manually by a user) */
  installed_as_dependency?: boolean;
  /** Namespaces opted in for namespace-level customization for this package. */
  namespace_customization_enabled_for?: string[];
  /** Per-namespace managed settings (e.g. ILM policy) for this package. */
  namespace_customization_settings?: { [namespace: string]: { ilm_policy?: string } };
  /** Snapshot of dependency version changes made when this (composable) package was last installed/upgraded; used for rollback */
  previous_dependency_versions?: Array<{ name: string; previous_version: string | null }> | null;
}

export interface PackageUsageStats {
  agent_policy_count: number;
  package_policy_count: number;
}

export type Installable<T> =
  | InstallStatusExcluded<T>
  | InstalledRegistry<T>
  | Installing<T>
  | NotInstalled<T>
  | InstallFailed<T>;

export type InstallStatusExcluded<T = {}> = T & {
  status: undefined;
};

export type InstalledRegistry<T = {}> = T & {
  status: InstallationStatus['Installed'];
  savedObject?: InstallableSavedObject;
  installationInfo?: InstallationInfo;
};

export type Installing<T = {}> = T & {
  status: InstallationStatus['Installing'];
  savedObject?: InstallableSavedObject;
  installationInfo?: InstallationInfo;
};

export type NotInstalled<T = {}> = T & {
  status: InstallationStatus['NotInstalled'];
};

export type InstallFailed<T = {}> = T & {
  status: InstallationStatus['InstallFailed'];
};

export type AssetReference = KibanaAssetReference | EsAssetReference;

export interface KibanaAssetReference {
  id: string;
  originId?: string;
  type: KibanaSavedObjectType;
  deferred?: boolean;
}
export interface EsAssetReference {
  id: string;
  type: ElasticsearchAssetType;
  deferred?: boolean;
  customDataStreamOriginDataset?: string;
  customDataStreamOriginType?: string;
}

export interface PackageAssetReference {
  id: string;
  path?: string; // Package installed prior to 9.1.0 will not have that property
  type: typeof ASSETS_SAVED_OBJECT_TYPE;
}

export interface IndexTemplateMappings {
  properties: any;
  dynamic_templates?: any;
  runtime?: any;
  subobjects?: boolean;
}

// This is an index template v2, see https://github.com/elastic/elasticsearch/issues/53101
// until "proper" documentation of the new format is available.
// Fleet does not use nor support the legacy index template v1 format at all
export interface IndexTemplate {
  priority: number;
  index_patterns: string[];
  template: {
    settings: any;
    mappings: any;
    lifecycle?: any;
  };
  data_stream: { hidden?: boolean };
  composed_of: string[];
  ignore_missing_component_templates?: string[];
  _meta: object;

  // These properties are returned on ES read operations and
  // not allowed to be set on ES write operations
  created_date?: number;
  created_date_millis?: number;
  modified_date?: number;
  modified_date_millis?: number;
}

export interface IngestPipelineWithDateFields extends IngestPipeline {
  // These properties are returned on ES read operations and
  // not allowed to be set on ES write operations
  created_date?: number;
  created_date_millis?: number;
  modified_date?: number;
  modified_date_millis?: number;
}

export interface ESAssetMetadata {
  package?: {
    name: string;
  };
  managed_by: string;
  managed: boolean;
}
export interface TemplateMapEntry {
  _meta: ESAssetMetadata;
  template:
    | {
        mappings: NonNullable<RegistryElasticsearch['index_template.mappings']>;
      }
    | {
        settings: NonNullable<RegistryElasticsearch['index_template.settings']>;
      }
    | {
        lifecycle?: any;
      };
}

export type TemplateMap = Record<string, TemplateMapEntry>;
export interface IndexTemplateEntry {
  templateName: string;
  indexTemplate: IndexTemplate;
}

export interface KnowledgeBaseItem {
  fileName: string;
  content: string;
  path?: string;
  installed_at?: string;
  version?: string;
}

export interface PackageKnowledgeBase {
  package: {
    name: string;
  };

  items: KnowledgeBaseItem[];
}

// Experimental support for Otel integrations
export interface OTelCollectorConfig {
  extensions?: Record<OTelCollectorComponentID, any>;
  receivers?: Record<OTelCollectorComponentID, any>;
  processors?: Record<OTelCollectorComponentID, any>;
  connectors?: Record<OTelCollectorComponentID, any>;
  exporters?: Record<OTelCollectorComponentID, any>;
  service?: {
    extensions?: OTelCollectorComponentID[];
    pipelines?: Record<OTelCollectorPipelineID, OTelCollectorPipeline>;
  };
}

export interface OTelCollectorPipeline {
  receivers?: OTelCollectorComponentID[];
  processors?: OTelCollectorComponentID[];
  exporters?: OTelCollectorComponentID[];
}

export type OTelCollectorComponentID = string;

export type OTelCollectorPipelineGroup = 'logs' | 'metrics' | 'traces';
export type OTelCollectorPipelineID = OTelCollectorPipelineGroup | string;
