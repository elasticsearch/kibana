/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/* eslint-disable max-classes-per-file */

import { omit, partition, isEqual, cloneDeep, without, chunk } from 'lodash';
import { indexBy } from 'lodash/fp';
import { i18n } from '@kbn/i18n';
import { getFlattenedObject } from '@kbn/std';
import type {
  AuthenticatedUser,
  KibanaRequest,
  ElasticsearchClient,
  SavedObjectsClientContract,
  Logger,
  RequestHandlerContext,
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkUpdateObject,
  SavedObject,
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { SavedObjectsUtils } from '@kbn/core/server';
import { v4 as uuidv4 } from 'uuid';
import { parse } from 'yaml';
import { validateAgentConditionExpression } from '@kbn/elastic-agent-condition-language';
import semverGt from 'semver/functions/gt';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import pMap from 'p-map';

import type { SavedObjectError } from '@kbn/core-saved-objects-common';

import apm from 'elastic-apm-node';
import { withActiveSpan } from '@kbn/tracing-utils';

import { catchAndSetErrorStackTrace, rethrowIfInstanceOrWrap } from '../errors/utils';

import {
  packageToPackagePolicy,
  isPackageLimited,
  doesAgentPolicyAlreadyIncludePackage,
  validatePackagePolicy,
  validationHasErrors,
  isInputOnlyPolicyTemplate,
  getNormalizedDataStreams,
  getNormalizedInputs,
  isRootPrivilegesRequired,
  checkIntegrationFipsLooseCompatibility,
  hasMultipleEnabledPolicyTemplates,
  getInputEffectiveName,
  getRegistryStreamWithDataStreamForInputType,
  syncDataStreamTypeFromVar,
  validateFleetSavedObjectId,
} from '../../common/services';
import {
  SO_SEARCH_LIMIT,
  PACKAGES_SAVED_OBJECT_TYPE,
  DATASET_VAR_NAME,
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  DATA_STREAM_TYPE_VAR_NAME,
  OTEL_COLLECTOR_INPUT_TYPE,
} from '../../common/constants';
import type {
  PostDeletePackagePoliciesResponse,
  UpgradePackagePolicyResponse,
  PackagePolicyInput,
  NewPackagePolicyInput,
  PackagePolicyConfigRecord,
  PackagePolicyConfigRecordEntry,
  PackagePolicyInputStream,
  PackageInfo,
  ListWithKuery,
  ListResult,
  UpgradePackagePolicyDryRunResponseItem,
  RegistryDataStream,
  Installation,
  DeletePackagePoliciesResponse,
  SecretReference,
  AgentPolicy,
  PackagePolicyAssetsMap,
  PreconfiguredInputs,
  CloudProvider,
  CloudConnector,
  CloudConnectorVars,
  CloudConnectorSecretVar,
  AwsCloudConnectorVars,
  ArchiveEntry,
} from '../../common/types';
import type {
  AzureCloudConnectorVars,
  CloudConnectorVar,
  GcpCloudConnectorVars,
} from '../../common/types/models/cloud_connector';
import {
  FleetError,
  fleetErrorToResponseOptions,
  PackagePolicyValidationError,
  PackagePolicyRestrictionRelatedError,
  PackagePolicyNotFoundError,
  HostedAgentPolicyRestrictionRelatedError,
  FleetUnauthorizedError,
  PackagePolicyNameExistsError,
  AgentPolicyNotFoundError,
  InputNotFoundError,
  StreamNotFoundError,
  FleetNotFoundError,
  PackageRollbackError,
  CloudConnectorInvalidVarsError,
  CloudConnectorCreateError,
  CloudConnectorUpdateError,
} from '../errors';
import { NewPackagePolicySchema, PackagePolicySchema, UpdatePackagePolicySchema } from '../types';
import type {
  NewPackagePolicy,
  UpdatePackagePolicy,
  PackagePolicy,
  PackagePolicySOAttributes,
  DryRunPackagePolicy,
  PostPackagePolicyCreateCallback,
  PostPackagePolicyPostCreateCallback,
  PutPackagePolicyPostUpdateCallback,
  AssetsMap,
} from '../types';
import type { ExternalCallback } from '..';

import {
  MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS,
  MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_10,
  MAX_CONCURRENT_PACKAGE_ASSETS,
} from '../constants';

import {
  validateDeploymentModesForInputs,
  isAgentlessIntegration,
} from '../../common/services/agentless_policy_helper';

import {
  AWS_CREDENTIALS_EXTERNAL_ID_VAR_NAME,
  AWS_ROLE_ARN_VAR_NAME,
  AZURE_TENANT_ID_VAR_NAME,
  AZURE_CLIENT_ID_VAR_NAME,
  AZURE_CREDENTIALS_CLOUD_CONNECTOR_ID_VAR_NAME,
  TENANT_ID_VAR_NAME,
  CLIENT_ID_VAR_NAME,
  AZURE_CREDENTIALS_CLOUD_CONNECTOR_ID,
  GCP_SERVICE_ACCOUNT_VAR_NAME,
  GCP_AUDIENCE_VAR_NAME,
  GCP_CREDENTIALS_CLOUD_CONNECTOR_ID_VAR_NAME,
  SERVICE_ACCOUNT_VAR_NAME,
  AUDIENCE_VAR_NAME,
  GCP_CREDENTIALS_CLOUD_CONNECTOR_ID,
} from '../../common/constants/cloud_connector';

import { createSoFindIterable } from './utils/create_so_find_iterable';

import type { FleetAuthzRouteConfig } from './security';

import { getAuthzFromRequest, doesNotHaveRequiredFleetAuthz } from './security';

import { agentPolicyService, getAgentPolicySavedObjectType } from './agent_policy';
import { getPackageInfo, ensureInstalledPackage, getInstallationObject } from './epm/packages';
import { getAssetsDataFromAssetsMap } from './epm/packages/assets';
import {
  compileTemplate,
  getMetaVariables,
  mergeCompiledTemplates,
  type MetaVariable,
} from './epm/agent/agent';
import { escapeSearchQueryPhrase, normalizeKuery } from './saved_object';
import { appContextService, cloudConnectorService } from '.';
import { removeOldAssets } from './epm/packages/cleanup';
import type { PackageUpdateEvent, UpdateEventType } from './upgrade_sender';
import { sendTelemetryEvents } from './upgrade_sender';
import {
  canDeployCustomPackageAsAgentlessOrThrow,
  handleExperimentalDatastreamFeatureOptIn,
  mapPackagePolicySavedObjectToPackagePolicy,
  preflightCheckPackagePolicy,
} from './package_policies';
import type {
  PackagePolicyClient,
  PackagePolicyClientBulkUpdateOptions,
  PackagePolicyClientDeleteOptions,
  PackagePolicyClientFetchAllItemsOptions,
  PackagePolicyClientFindAllForAgentPolicyOptions,
  PackagePolicyClientGetByIdsOptions,
  PackagePolicyClientGetOptions,
  PackagePolicyClientListIdsOptions,
  PackagePolicyClientRollbackOptions,
  PackagePolicyService,
  RollbackResult,
  RunExternalCallbacksPackagePolicyArgument,
  RunExternalCallbacksPackagePolicyResponse,
} from './package_policy_service';
import {
  installAssetsForInputPackagePolicy,
  installAssetsForCustomDatasetPolicy,
} from './epm/packages/input_type_packages';
import { auditLoggingService } from './audit_logging';
import {
  extractAndUpdateSecrets,
  extractAndWriteSecrets,
  deleteSecretsIfNotReferenced as deleteSecrets,
  isSecretStorageEnabled,
} from './secrets';
import { extractAccountType } from './cloud_connectors/integration_helpers';
import { getAgentTemplateAssetsMap } from './epm/packages/get';
import { validateAgentPolicyOutputForIntegration } from './agent_policies/outputs_helpers';
import type { PackagePolicyClientFetchAllItemIdsOptions } from './package_policy_service';
import {
  validateAdditionalDatastreamsPermissionsForSpace,
  validatePolicyNamespaceForSpace,
} from './spaces/policy_namespaces';
import {
  getSpaceForPackagePolicy,
  getSpaceForPackagePolicySO,
  isSpaceAwarenessEnabled,
  isSpaceAwarenessMigrationPending,
} from './spaces/helpers';
import { updatePackagePolicySpaces } from './spaces/package_policy';
import {
  _packagePoliciesGetUpgradeDryRunDiff,
  _packagePoliciesBulkUpgrade,
  _packagePoliciesUpgrade,
} from './package_policies/upgrade';

import { getInputsWithIds } from './package_policies/get_input_with_ids';
import { runWithCache } from './epm/packages/cache';
import {
  getAgentVersionsForVersionSpecificPolicies,
  hasAgentVersionConditionInInputTemplate,
} from './utils/version_specific_policies';
import { recompileInputsWithAgentVersion } from './agent_policies/package_policies_to_agent_inputs';
import {
  findInputForMigration,
  applyInputLevelMigration,
  migrateStreamVars,
  applyStreamLevelMigration,
  applyVarScopeMigration,
  deepMergeVars,
  getUpdatedGlobalVars,
  removeStaleVars,
} from './package_policy_migration_helpers';

export type InputsOverride = Partial<NewPackagePolicyInput> & {
  vars?: Array<NewPackagePolicyInput['vars'] & { name: string }>;
};

const ASYNC_DEPLOY_POLICIES_THRESHOLD = 100;

async function getPkgInfoAssetsMap({
  savedObjectsClient,
  packageInfos,
  logger,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  packageInfos: PackageInfo[];
  logger: Logger;
}) {
  const packageInfosandAssetsMap = new Map<
    string,
    { assetsMap: PackagePolicyAssetsMap; pkgInfo: PackageInfo }
  >();
  await pMap(
    packageInfos,
    async (pkgInfo) => {
      const assetsMap = await getAgentTemplateAssetsMap({
        logger,
        packageInfo: pkgInfo,
        savedObjectsClient,
      });
      packageInfosandAssetsMap.set(`${pkgInfo.name}-${pkgInfo.version}`, {
        assetsMap,
        pkgInfo,
      });
    },
    { concurrency: MAX_CONCURRENT_PACKAGE_ASSETS }
  );

  return packageInfosandAssetsMap;
}

export async function getPackagePolicySavedObjectType() {
  return (await isSpaceAwarenessEnabled())
    ? PACKAGE_POLICY_SAVED_OBJECT_TYPE
    : LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE;
}

/**
 * Returns the union of all agent version keys stored in inputs_for_versions across every
 * package policy that belongs to the given agent policy. Used by deployPolicies to ensure
 * non-default agent versions (e.g. 9.1 from an enrolled agent) get updated .fleet-policies
 * documents when the agent policy changes, not just the common default versions.
 */
export async function getCompiledVersionsForAgentPolicy(
  soClient: SavedObjectsClientContract,
  agentPolicyId: string
): Promise<string[]> {
  if (!appContextService.getExperimentalFeatures().enableVersionSpecificPolicies) {
    return [];
  }
  const savedObjectType = await getPackagePolicySavedObjectType();
  const packagePolicySOs = await soClient.find<PackagePolicySOAttributes>({
    type: savedObjectType,
    filter: buildCurrentRevisionFilter(
      savedObjectType,
      `${savedObjectType}.attributes.policy_ids:${escapeSearchQueryPhrase(agentPolicyId)}`
    ),
    perPage: SO_SEARCH_LIMIT,
  });

  const versionKeys = new Set<string>();
  for (const so of packagePolicySOs.saved_objects) {
    for (const version of Object.keys(so.attributes.inputs_for_versions ?? {})) {
      versionKeys.add(version);
    }
  }
  return [...versionKeys];
}

/**
 * Returns a kuery string that excludes package policies with latest_revision:false,
 * optionally AND-ing with an additional kuery clause.
 */
export function buildCurrentRevisionFilter(savedObjectType: string, kuery?: string): string {
  const base = `NOT ${savedObjectType}.attributes.latest_revision:false`;
  return kuery ? `${base} AND (${kuery})` : base;
}

export function _normalizePackagePolicyKuery(savedObjectType: string, kuery: string) {
  if (savedObjectType === LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE) {
    return normalizeKuery(
      savedObjectType,
      kuery.replace(
        new RegExp(`${PACKAGE_POLICY_SAVED_OBJECT_TYPE}\\.`, 'g'),
        `${savedObjectType}.`
      )
    );
  } else {
    return normalizeKuery(
      savedObjectType,
      kuery.replace(
        new RegExp(`${LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE}\\.`, 'g'),
        `${savedObjectType}.`
      )
    );
  }
}

/**
 * Validates package policy variables and extracts cloud connector configuration.
 *
 * Currently supports AWS cloud connector only. This function checks for both:
 * - `aws.role_arn` and `aws.credentials.external_id` (CSPM and Asset Discovery)
 * - `role_arn` and `external_id` (direct cloud connector variables)
 *
 * This is a temporary implementation pending the generic solution proposed by the
 * Package Spec team. Once approved, this function should be updated to use the
 * standardized approach.
 *
 * @see https://github.com/elastic/security-team/issues/13277#issuecomment-3245273903 for updates
 * @todo Remove hardcoded checks for `aws.role_arn` and `aws.credentials.external_id`
 *       and implement the generic Package Spec solution once approved.
 */

const extractPackagePolicyVars = (
  cloudProvider: CloudProvider,
  packagePolicy: NewPackagePolicy,
  logger: Logger
): CloudConnectorVars | undefined => {
  logger.get('extract package policy vars');

  if (packagePolicy.supports_cloud_connector && cloudProvider === 'aws') {
    const vars = packagePolicy.inputs.find((input) => input.enabled)?.streams[0]?.vars;

    if (!vars) {
      logger.error('Package policy must contain vars');
      throw new CloudConnectorInvalidVarsError('Package policy must contain vars');
    }

    const roleArn: string = vars.role_arn?.value || vars[AWS_ROLE_ARN_VAR_NAME]?.value;

    if (roleArn) {
      const externalId: CloudConnectorSecretVar = (
        vars.external_id?.value?.isSecretRef
          ? vars.external_id
          : vars[AWS_CREDENTIALS_EXTERNAL_ID_VAR_NAME]
      ) as CloudConnectorSecretVar;

      const awsCloudConnectorVars: AwsCloudConnectorVars = {
        role_arn: { type: 'text', value: roleArn },
        external_id: externalId,
      };

      return awsCloudConnectorVars;
    }
  }

  if (packagePolicy.supports_cloud_connector && cloudProvider === 'azure') {
    const vars = packagePolicy.inputs.find((input) => input.enabled)?.streams[0]?.vars;

    if (!vars) {
      logger.error('Package policy must contain vars');
      throw new CloudConnectorInvalidVarsError('Package policy must contain vars');
    }

    const tenantId = vars[TENANT_ID_VAR_NAME] || vars[AZURE_TENANT_ID_VAR_NAME];
    const clientId = vars[CLIENT_ID_VAR_NAME] || vars[AZURE_CLIENT_ID_VAR_NAME];
    const azureCredentials =
      vars[AZURE_CREDENTIALS_CLOUD_CONNECTOR_ID] ||
      vars[AZURE_CREDENTIALS_CLOUD_CONNECTOR_ID_VAR_NAME];

    if (tenantId && clientId && azureCredentials) {
      // Type assertions are needed because PackagePolicyConfigRecordEntry in packagePolicy.inputs.streams[0].vars has loose types (type?: string, value?: any)
      // while CloudConnectorSecretVar/CloudConnectorVar in CloudConnectorVars expect specific literal types (type?: 'password' | 'text').
      // Runtime validation occurs in cloudConnectorService.validateCloudConnectorDetails()
      const azureCloudConnectorVars: AzureCloudConnectorVars = {
        tenant_id: tenantId as CloudConnectorSecretVar,
        client_id: clientId as CloudConnectorSecretVar,
        azure_credentials_cloud_connector_id: azureCredentials as CloudConnectorVar,
      };

      logger.debug(
        `Extracted Azure cloud connector vars: tenant_id=${!!tenantId}, client_id=${!!clientId}, azure_credentials=[REDACTED]`
      );

      return azureCloudConnectorVars;
    } else {
      logger.error(
        `Missing required Azure vars: tenant_id=${!!tenantId}, client_id=${!!clientId}, azure_credentials=[REDACTED]`
      );
    }
  }

  if (packagePolicy.supports_cloud_connector && cloudProvider === 'gcp') {
    const vars = packagePolicy.inputs.find((input) => input.enabled)?.streams[0]?.vars;

    if (!vars) {
      logger.error('Package policy must contain vars');
      throw new CloudConnectorInvalidVarsError('Package policy must contain vars');
    }

    const serviceAccount = vars[SERVICE_ACCOUNT_VAR_NAME] || vars[GCP_SERVICE_ACCOUNT_VAR_NAME];
    const audience = vars[AUDIENCE_VAR_NAME] || vars[GCP_AUDIENCE_VAR_NAME];
    const gcpCredentials =
      vars[GCP_CREDENTIALS_CLOUD_CONNECTOR_ID] || vars[GCP_CREDENTIALS_CLOUD_CONNECTOR_ID_VAR_NAME];

    if (serviceAccount && audience && gcpCredentials) {
      // Type assertions are needed because PackagePolicyConfigRecordEntry has loose types (type?: string, value?: any)
      // service_account and audience are non-secret text fields (CloudConnectorVar);
      // only gcp_credentials_cloud_connector_id is a secret (CloudConnectorSecretVar).
      // Runtime validation occurs in cloudConnectorService.validateCloudConnectorDetails()
      const gcpCloudConnectorVars: GcpCloudConnectorVars = {
        service_account: serviceAccount as CloudConnectorVar,
        audience: audience as CloudConnectorVar,
        gcp_credentials_cloud_connector_id: gcpCredentials as CloudConnectorSecretVar,
      };

      logger.debug(
        `Extracted GCP cloud connector vars: service_account=${!!serviceAccount}, audience=${!!audience}, gcp_credentials=[REDACTED]`
      );

      return gcpCloudConnectorVars;
    } else {
      logger.error(
        `Missing required GCP vars: service_account=${!!serviceAccount}, audience=${!!audience}, gcp_credentials=[REDACTED]`
      );
    }
  }
};

function validateAgentlessForPackagePolicy(
  packagePolicy: { supports_agentless?: boolean | null; inputs: NewPackagePolicyInput[] },
  agentPolicy: { supports_agentless?: boolean | null } | undefined,
  pkgInfo: PackageInfo | undefined
): void {
  const isAgentless = Boolean(agentPolicy?.supports_agentless || packagePolicy.supports_agentless);

  if (pkgInfo) {
    canDeployCustomPackageAsAgentlessOrThrow(packagePolicy, pkgInfo);
  }

  if (isAgentless && pkgInfo && !isAgentlessIntegration(pkgInfo)) {
    throw new PackagePolicyValidationError(
      `Package "${pkgInfo.name}" does not support agentless deployment mode`
    );
  }

  validateDeploymentModesForInputs(
    packagePolicy.inputs,
    isAgentless ? 'agentless' : 'default',
    pkgInfo
  );
}

class PackagePolicyClientImpl implements PackagePolicyClient {
  protected getLogger(...childContextPaths: string[]): Logger {
    return appContextService.getLogger().get('PackagePolicyClient', ...childContextPaths);
  }

  public async create(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicy: NewPackagePolicy,
    options: {
      spaceId?: string;
      id?: string;
      user?: AuthenticatedUser;
      bumpRevision?: boolean;
      force?: boolean;
      skipEnsureInstalled?: boolean;
      skipUniqueNameVerification?: boolean;
      overwrite?: boolean;
      packageInfo?: PackageInfo;
      createDatasetTemplates?: boolean;
    } = {},
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<PackagePolicy> {
    const logger = this.getLogger('create');

    validateFleetSavedObjectId(options?.id);

    logger.debug(
      () =>
        `Creating [${
          packagePolicy.package?.name
        }] package policy with soClient scoped to [${soClient.getCurrentNamespace()}] and options.spaceId [${
          options.spaceId
        }]`
    );

    const useSpaceAwareness = await isSpaceAwarenessEnabled();
    const packagePolicyId = options?.id || uuidv4();

    const savedObjectType = await getPackagePolicySavedObjectType();
    const basePkgInfo =
      options?.packageInfo ??
      (packagePolicy.package
        ? await getPackageInfo({
            savedObjectsClient: soClient,
            pkgName: packagePolicy.package.name,
            pkgVersion: packagePolicy.package.version,
            ignoreUnverified: true,
            prerelease: true,
          })
        : undefined);

    auditLoggingService.writeCustomSoAuditLog({
      action: 'create',
      id: packagePolicyId,
      name: packagePolicy.name,
      savedObjectType,
    });

    let secretReferences: SecretReference[] | undefined;

    this.keepPolicyIdInSync(packagePolicy);

    syncDataStreamTypeFromVar(packagePolicy);
    await preflightCheckPackagePolicy(soClient, packagePolicy, basePkgInfo);

    let enrichedPackagePolicy = await packagePolicyService.runExternalCallbacks(
      'packagePolicyCreate',
      packagePolicy,
      soClient,
      esClient,
      context,
      request
    );

    const agentPolicies: AgentPolicy[] = [];

    for (const policyId of enrichedPackagePolicy.policy_ids) {
      const agentPolicy = await agentPolicyService.get(soClient, policyId, true);
      if (!agentPolicy) {
        throw new AgentPolicyNotFoundError('Agent policy not found');
      }

      agentPolicies.push(agentPolicy);

      // If package policy did not set an output_id, see if the agent policy's output is compatible
      if (!packagePolicy.output_id && agentPolicy && enrichedPackagePolicy.package?.name) {
        await validateAgentPolicyOutputForIntegration(
          soClient,
          agentPolicy,
          packagePolicy,
          enrichedPackagePolicy.package?.name
        );
      }

      validateIsNotHostedPolicy(agentPolicy, options?.force);
      if (useSpaceAwareness) {
        validateReusableIntegrationsAndSpaceAwareness(enrichedPackagePolicy, agentPolicies);
      }

      validateAgentlessForPackagePolicy(packagePolicy, agentPolicy, basePkgInfo);
    }

    if (
      packagePolicy.global_data_tags?.length &&
      !(
        agentPolicies.every((policy) => policy?.supports_agentless) ||
        packagePolicy.supports_agentless
      )
    ) {
      throw new PackagePolicyValidationError(
        '`global_data_tags` can only be set on agentless integration policies'
      );
    }

    const spaceIds = agentPolicies.flatMap((ap) => ap.space_ids ?? []);
    // trailing whitespace causes issues creating API keys
    enrichedPackagePolicy.name = enrichedPackagePolicy.name.trim();
    if (!options?.skipUniqueNameVerification) {
      await requireUniqueName(soClient, enrichedPackagePolicy, undefined, spaceIds);
    }
    if (enrichedPackagePolicy.namespace) {
      await validatePolicyNamespaceForSpace({
        namespace: enrichedPackagePolicy.namespace,
        spaceId: soClient.getCurrentNamespace(),
      });
    }
    await validateAdditionalDatastreamsPermissionsForSpace({
      additionalDatastreamsPermissions: enrichedPackagePolicy.additional_datastreams_permissions,
      spaceId: soClient.getCurrentNamespace(),
    });

    // Make sure the associated package is installed
    if (!enrichedPackagePolicy.package?.name) {
      throw new FleetError(
        `Package policy "${enrichedPackagePolicy.name}" without package are not supported`
      );
    }
    if (!options?.skipEnsureInstalled) {
      await ensureInstalledPackage({
        esClient,
        spaceId: options?.spaceId || DEFAULT_SPACE_ID,
        savedObjectsClient: soClient,
        pkgName: enrichedPackagePolicy.package.name,
        pkgVersion: enrichedPackagePolicy.package.version,
        force: options?.force,
        request,
      });
    }

    // Handle component template/mappings updates for experimental features, e.g. synthetic source
    await handleExperimentalDatastreamFeatureOptIn({
      soClient,
      esClient,
      packagePolicy: enrichedPackagePolicy,
    });

    const pkgInfo =
      options?.packageInfo ??
      (await getPackageInfo({
        savedObjectsClient: soClient,
        pkgName: enrichedPackagePolicy.package.name,
        pkgVersion: enrichedPackagePolicy.package.version,
        prerelease: true,
      }));

    let inputs = getInputsWithIds(enrichedPackagePolicy, packagePolicyId, undefined, pkgInfo);

    // Check if it is a limited package, and if so, check that the corresponding agent policy does not
    // already contain a package policy for this package
    if (isPackageLimited(pkgInfo)) {
      for (const agentPolicy of agentPolicies) {
        if (agentPolicy && doesAgentPolicyAlreadyIncludePackage(agentPolicy, pkgInfo.name)) {
          throw new FleetError(
            `Unable to create integration policy. Integration '${pkgInfo.name}' already exists on this agent policy.`
          );
        }
      }
    }
    validatePackagePolicyOrThrow(enrichedPackagePolicy, pkgInfo);

    if (await isSecretStorageEnabled(esClient, soClient)) {
      const secretsRes = await extractAndWriteSecrets({
        packagePolicy: { ...enrichedPackagePolicy, inputs },
        packageInfo: pkgInfo,
        esClient,
      });

      enrichedPackagePolicy = secretsRes.packagePolicy;
      secretReferences = secretsRes.secretReferences;

      // Create cloud connector for package policy if it is supported and package supports agentless
      if (
        enrichedPackagePolicy?.supports_agentless &&
        enrichedPackagePolicy?.supports_cloud_connector
      ) {
        const cloudConnector = await this.createCloudConnectorForPackagePolicy(
          soClient,
          enrichedPackagePolicy,
          agentPolicies[0],
          pkgInfo
        );
        if (cloudConnector) {
          enrichedPackagePolicy.cloud_connector_id = cloudConnector.id;
        }
      }

      inputs = enrichedPackagePolicy.inputs as PackagePolicyInput[];
    }

    const assetsMap = await getAgentTemplateAssetsMap({
      logger,
      packageInfo: pkgInfo,
      savedObjectsClient: soClient,
    });
    inputs = _compilePackagePolicyInputs(
      pkgInfo,
      enrichedPackagePolicy.vars || {},
      inputs,
      assetsMap
    );

    const elasticsearchPrivileges = pkgInfo.elasticsearch?.privileges;

    const shouldCreateDatasetTemplates =
      options?.createDatasetTemplates ?? pkgInfo.type === 'input';

    if (shouldCreateDatasetTemplates) {
      await installAssetsForCustomDatasetPolicy({
        soClient,
        esClient,
        pkgInfo,
        packagePolicy: enrichedPackagePolicy,
        force: !!options?.force,
        logger,
      });
    }

    const requiresRoot = isRootPrivilegesRequired(pkgInfo);
    if (enrichedPackagePolicy.package && requiresRoot) {
      enrichedPackagePolicy.package = {
        ...enrichedPackagePolicy.package,
        requires_root: requiresRoot,
        fips_compatible: checkIntegrationFipsLooseCompatibility(pkgInfo?.name, pkgInfo),
      };
    }

    const isoDate = new Date().toISOString();
    const newSo = await soClient
      .create<PackagePolicySOAttributes>(
        savedObjectType,
        {
          ...omit(enrichedPackagePolicy, 'cloud_connector_name'),
          ...(enrichedPackagePolicy.package
            ? { package: omit(enrichedPackagePolicy.package, 'experimental_data_stream_features') }
            : {}),
          inputs,
          ...(elasticsearchPrivileges && {
            elasticsearch: { privileges: elasticsearchPrivileges },
          }),
          ...(secretReferences?.length && { secret_references: secretReferences }),
          latest_revision: true,
          revision: 1,
          created_at: isoDate,
          created_by: options?.user?.username ?? 'system',
          updated_at: isoDate,
          updated_by: options?.user?.username ?? 'system',
          package_agent_version_condition: pkgInfo.conditions?.agent?.version,
        },

        { ...options, id: packagePolicyId }
      )
      .catch(
        catchAndSetErrorStackTrace.withMessage(
          `attempt to create package policy saved object failed`
        )
      );

    for (const agentPolicy of agentPolicies) {
      if (
        useSpaceAwareness &&
        agentPolicy &&
        agentPolicy.space_ids &&
        (agentPolicy.space_ids.length > 1 || agentPolicy.space_ids.includes(ALL_SPACES_ID))
      ) {
        await updatePackagePolicySpaces({
          packagePolicyId: newSo.id,
          currentSpaceId: soClient.getCurrentNamespace() ?? DEFAULT_SPACE_ID,
          newSpaceIds: agentPolicy.space_ids,
        });
      }
    }

    await this.compilePackagePolicyForVersions(
      soClient,
      pkgInfo,
      assetsMap,
      mapPackagePolicySavedObjectToPackagePolicy(newSo)
    );

    if (options?.bumpRevision ?? true) {
      await this.bumpAgentPoliciesRevision(
        { soClient, esClient },
        enrichedPackagePolicy.policy_ids,
        {
          user: options?.user,
        }
      );
    }

    const createdPackagePolicy = mapPackagePolicySavedObjectToPackagePolicy(newSo);
    logger.debug(`Created new package policy with id ${newSo.id} and version ${newSo.version}`);

    return packagePolicyService.runExternalCallbacks(
      'packagePolicyPostCreate',
      createdPackagePolicy,
      soClient,
      esClient
    );
  }

  public async compilePackagePolicyForVersions(
    soClient: SavedObjectsClientContract,
    packageInfo: PackageInfo,
    assetsMap: PackagePolicyAssetsMap,
    packagePolicy: PackagePolicy,
    agentVersions?: string[]
  ) {
    if (!appContextService.getExperimentalFeatures().enableVersionSpecificPolicies) {
      return;
    }
    if (!hasAgentVersionConditionInInputTemplate(assetsMap)) {
      return;
    }
    return withActiveSpan(
      'compile-package-policy-versions',
      { attributes: { 'transaction.type': 'fleet' } },
      async () => {
        const t = apm.startTransaction('compile-package-policy-versions', 'fleet');

        const savedObjectType = await getPackagePolicySavedObjectType();

        const packagePolicySO = await soClient.get<PackagePolicySOAttributes>(
          savedObjectType,
          packagePolicy.id
        );

        const existingInputsForVersions = packagePolicySO.attributes.inputs_for_versions ?? {};

        let versionsToCompile: string[];
        if (agentVersions) {
          // Async task path: skip versions already compiled to avoid unnecessary recompilation and
          // deployment. The stored inputs are guaranteed to be current because the create/update
          // path (below) recompiles all previously stored versions whenever the package policy changes.
          versionsToCompile = agentVersions.filter((v) => !existingInputsForVersions[v]);
          if (versionsToCompile.length === 0) {
            t.end();
            return;
          }
        } else {
          // Create/update path: compile default common agent versions plus any extra versions already
          // stored in inputs_for_versions (e.g. from agents that enrolled on older versions), so
          // that all stored inputs stay current after a package policy configuration change.
          const defaultVersions = await getAgentVersionsForVersionSpecificPolicies();
          const existingVersionKeys = Object.keys(existingInputsForVersions);
          versionsToCompile = [...new Set([...defaultVersions, ...existingVersionKeys])];
        }

        const inputsForVersions: Record<string, PackagePolicyInput[]> = {};
        for (const version of versionsToCompile) {
          const inputs = await recompileInputsWithAgentVersion(
            packageInfo!,
            packagePolicy,
            version,
            soClient!
          );
          inputsForVersions[version] = inputs;
        }

        await soClient
          .update<PackagePolicySOAttributes>(savedObjectType, packagePolicy.id, {
            inputs_for_versions: {
              ...existingInputsForVersions,
              ...inputsForVersions,
            },
          })
          .catch(
            catchAndSetErrorStackTrace.withMessage(
              `attempt to update package policy saved object with inputs_for_versions failed`
            )
          );
        t.end();
      }
    );
  }

  private async bumpAgentPoliciesRevision(
    deps: { soClient: SavedObjectsClientContract; esClient: ElasticsearchClient },
    policyIds: string[],
    options: {
      user?: AuthenticatedUser;
      removeProtectionFn?: (policyId: string) => undefined | boolean;
      asyncDeploy?: boolean;
    } = {}
  ) {
    return runWithCache(() =>
      pMap(
        policyIds,
        (policyId) =>
          agentPolicyService.bumpRevision(deps.soClient, deps.esClient, policyId, {
            user: options?.user,
            asyncDeploy: options.asyncDeploy || policyIds.length > ASYNC_DEPLOY_POLICIES_THRESHOLD,
            removeProtection: options.removeProtectionFn
              ? options.removeProtectionFn(policyId)
              : undefined,
          }),
        {
          concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_10,
        }
      )
    );
  }

  keepPolicyIdInSync(packagePolicy: NewPackagePolicy): void {
    if (packagePolicy.policy_ids) {
      if (packagePolicy.policy_ids.length === 0 && packagePolicy.policy_id !== undefined) {
        packagePolicy.policy_id = null;
      }
    } else {
      packagePolicy.policy_ids = [];
    }
    if (packagePolicy.policy_id && !packagePolicy.policy_ids?.[0]) {
      packagePolicy.policy_ids = [packagePolicy.policy_id];
    } else if (!packagePolicy.policy_id && packagePolicy.policy_ids[0]) {
      packagePolicy.policy_id = packagePolicy.policy_ids[0];
    }
  }

  public async bulkCreate(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicies: NewPackagePolicyWithId[],
    options?: {
      user?: AuthenticatedUser;
      bumpRevision?: boolean;
      force?: true;
      asyncDeploy?: boolean;
      overwrite?: boolean;
    },
    request?: KibanaRequest
  ): Promise<{
    created: PackagePolicy[];
    failed: Array<{ packagePolicy: NewPackagePolicy; error?: Error | SavedObjectError }>;
  }> {
    const [useSpaceAwareness, savedObjectType, packageInfos] = await Promise.all([
      isSpaceAwarenessEnabled(),
      getPackagePolicySavedObjectType(),
      getPackageInfoForPackagePolicies(packagePolicies, soClient),
    ]);

    await pMap(packagePolicies, async (packagePolicy) => {
      const basePkgInfo = packagePolicy.package
        ? packageInfos.get(`${packagePolicy.package.name}-${packagePolicy.package.version}`)
        : undefined;
      if (!packagePolicy.id) {
        packagePolicy.id = SavedObjectsUtils.generateId();
      }
      auditLoggingService.writeCustomSoAuditLog({
        action: 'create',
        id: packagePolicy.id,
        name: packagePolicy.name,
        savedObjectType,
      });

      this.keepPolicyIdInSync(packagePolicy);
      syncDataStreamTypeFromVar(packagePolicy);
      await preflightCheckPackagePolicy(soClient, packagePolicy, basePkgInfo);
    });

    const agentPolicyIds = new Set(packagePolicies.flatMap((pkgPolicy) => pkgPolicy.policy_ids));

    const agentPolicies = await agentPolicyService.getByIds(soClient, [...agentPolicyIds]);
    const agentPoliciesIndexById = indexBy('id', agentPolicies);
    for (const agentPolicy of agentPolicies) {
      validateIsNotHostedPolicy(agentPolicy, options?.force);
    }
    if (useSpaceAwareness) {
      for (const packagePolicy of packagePolicies) {
        validateReusableIntegrationsAndSpaceAwareness(
          packagePolicy,
          packagePolicy.policy_ids
            .map((policyId) => agentPoliciesIndexById[policyId])
            .filter((policy) => policy !== undefined)
        );
      }
    }

    const isoDate = new Date().toISOString();

    const policiesToCreate: Array<SavedObjectsBulkCreateObject<PackagePolicySOAttributes>> = [];
    const failedPolicies: Array<{
      packagePolicy: NewPackagePolicyWithId;
      error: Error | SavedObjectError;
    }> = [];

    const logger = this.getLogger('bulkCreate');
    logger.debug(`Starting bulk create of package policy`);

    const packagePoliciesWithIds = packagePolicies.map((p) => {
      if (!p.id) {
        p.id = SavedObjectsUtils.generateId();
      }
      return p;
    });

    const packageInfosandAssetsMap = await getPkgInfoAssetsMap({
      logger,
      packageInfos: [...packageInfos.values()],
      savedObjectsClient: soClient,
    });

    await pMap(packagePoliciesWithIds, async (packagePolicy) => {
      try {
        const packagePolicyId = packagePolicy.id ?? uuidv4();
        const agentPolicyIdsOfPackagePolicy = packagePolicy.policy_ids;

        if (!packagePolicy.package) {
          throw new FleetError(
            `Package policy "${packagePolicy.name}" without package are not supported`
          );
        }

        const { id, ...pkgPolicyWithoutId } = packagePolicy;

        const packageInfoAndAsset = packageInfosandAssetsMap.get(
          `${packagePolicy.package.name}-${packagePolicy.package.version}`
        );
        if (!packageInfoAndAsset) {
          throw new FleetError(
            `Package info and assets not found: ${packagePolicy.package.name}-${packagePolicy.package.version}`
          );
        }

        const { pkgInfo, assetsMap } = packageInfoAndAsset;

        let inputs = getInputsWithIds(packagePolicy, packagePolicyId, undefined, pkgInfo);

        validatePackagePolicyOrThrow(packagePolicy, pkgInfo);

        for (const policyId of agentPolicyIdsOfPackagePolicy) {
          validateAgentlessForPackagePolicy(
            packagePolicy,
            agentPoliciesIndexById[policyId],
            pkgInfo
          );
        }

        inputs = pkgInfo
          ? await _compilePackagePolicyInputs(pkgInfo, packagePolicy.vars || {}, inputs, assetsMap)
          : inputs;

        const elasticsearch = pkgInfo?.elasticsearch;

        const requiresRoot = isRootPrivilegesRequired(pkgInfo);
        if (packagePolicy.package && requiresRoot) {
          packagePolicy.package = {
            ...packagePolicy.package,
            requires_root: requiresRoot,
            fips_compatible: checkIntegrationFipsLooseCompatibility(pkgInfo?.name, pkgInfo),
          };
        }

        policiesToCreate.push({
          type: savedObjectType,
          id: packagePolicyId,
          attributes: {
            ...pkgPolicyWithoutId,
            ...(packagePolicy.package
              ? { package: omit(packagePolicy.package, 'experimental_data_stream_features') }
              : {}),
            inputs,
            elasticsearch,
            policy_id: agentPolicyIdsOfPackagePolicy[0],
            policy_ids: agentPolicyIdsOfPackagePolicy,
            latest_revision: true,
            revision: 1,
            created_at: isoDate,
            created_by: options?.user?.username ?? 'system',
            updated_at: isoDate,
            updated_by: options?.user?.username ?? 'system',
          },
        });
      } catch (error) {
        failedPolicies.push({ packagePolicy, error });
        logger.error(error);
      }
    });

    const { saved_objects: createdObjects } = await soClient
      .bulkCreate<PackagePolicySOAttributes>(policiesToCreate, { overwrite: options?.overwrite })
      .catch(catchAndSetErrorStackTrace.withMessage('failed to bulk create package policies'));

    // Filter out invalid SOs
    const newSos = createdObjects.filter((so) => !so.error && so.attributes);

    packagePoliciesWithIds.forEach((packagePolicy) => {
      const hasCreatedSO = newSos.find((so) => so.id === packagePolicy.id);
      const hasFailed = failedPolicies.some(
        ({ packagePolicy: failedPackagePolicy }) => failedPackagePolicy.id === packagePolicy.id
      );
      if (hasCreatedSO?.error && !hasFailed) {
        failedPolicies.push({
          packagePolicy,
          error: hasCreatedSO?.error ?? new FleetError('Failed to create package policy.'),
        });
      }
    });

    if (useSpaceAwareness) {
      for (const newSo of newSos) {
        // Do not support multpile spaces for reusable integrations
        if (newSo.attributes.policy_ids.length > 1) {
          continue;
        }
        const agentPolicy = agentPoliciesIndexById[newSo.attributes.policy_ids[0]];
        if (
          agentPolicy &&
          agentPolicy.space_ids &&
          (agentPolicy.space_ids.length > 1 || agentPolicy.space_ids.includes(ALL_SPACES_ID))
        ) {
          await updatePackagePolicySpaces({
            packagePolicyId: newSo.id,
            currentSpaceId: soClient.getCurrentNamespace() ?? DEFAULT_SPACE_ID,
            newSpaceIds: agentPolicy.space_ids,
          });
        }
      }
    }

    for (const newSo of newSos) {
      const pkgInfo = packageInfos.get(
        `${newSo.attributes.package?.name}-${newSo.attributes.package?.version}`
      )!;
      await this.compilePackagePolicyForVersions(
        soClient,
        pkgInfo,
        packageInfosandAssetsMap.get(`${pkgInfo.name}-${pkgInfo.version}`)?.assetsMap!,
        mapPackagePolicySavedObjectToPackagePolicy(newSo)
      );
    }

    // Assign it to the given agent policy

    if (options?.bumpRevision ?? true) {
      await this.bumpAgentPoliciesRevision({ soClient, esClient }, [...agentPolicyIds], {
        user: options?.user,
        asyncDeploy: options?.asyncDeploy,
      });
    }
    logger.debug(`Created new package policies`);
    return {
      created: newSos.map((newSo) => mapPackagePolicySavedObjectToPackagePolicy(newSo)),
      failed: failedPolicies,
    };
  }

  /** Purpose of this function is to take a package policy and compile the inputs
   This is primarily used by the Synthetics UI to display the inputs which are passed to agent
   Purpose is to debug the inputs which are passed to the agent and also compared them to the config
   which is passed to public service locations */
  public async inspect(
    soClient: SavedObjectsClientContract,
    packagePolicy: NewPackagePolicyWithId
  ): Promise<NewPackagePolicy> {
    if (!packagePolicy.id) {
      packagePolicy.id = SavedObjectsUtils.generateId();
    }

    const packageInfos = await getPackageInfoForPackagePolicies([packagePolicy], soClient);

    if (!packagePolicy.package) {
      throw new FleetError(
        `Package policy "${packagePolicy.name}" without package are not supported`
      );
    }

    const pkgInfo = packageInfos.get(
      `${packagePolicy.package.name}-${packagePolicy.package.version}`
    );
    if (!pkgInfo) {
      throw new FleetError(
        `Package info and assets not found: ${packagePolicy.package.name}-${packagePolicy.package.version}`
      );
    }
    let inputs = getInputsWithIds(packagePolicy, packagePolicy.id, undefined, pkgInfo);
    const { id, ...pkgPolicyWithoutId } = packagePolicy;

    const assetsMap = await getAgentTemplateAssetsMap({
      logger: this.getLogger('inspect'),
      packageInfo: pkgInfo,
      savedObjectsClient: soClient,
    });
    inputs = pkgInfo
      ? await _compilePackagePolicyInputs(pkgInfo, packagePolicy.vars || {}, inputs, assetsMap)
      : inputs;

    const elasticsearch = pkgInfo?.elasticsearch;

    return {
      id: packagePolicy.id,
      ...pkgPolicyWithoutId,
      ...(packagePolicy.package
        ? { package: omit(packagePolicy.package, 'experimental_data_stream_features') }
        : {}),
      inputs,
      elasticsearch,
    };
  }

  public async get(
    soClient: SavedObjectsClientContract,
    id: string,
    options: PackagePolicyClientGetOptions = {}
  ): Promise<PackagePolicy | null> {
    const logger = this.getLogger('get');

    logger.debug(
      () =>
        `Getting package policy [${id}] for space [${
          options.spaceId ?? soClient.getCurrentNamespace()
        }]`
    );

    // We're using `getByIds()` here, instead of just `soClient.get()`, because when using an unscoped
    // SO client we are not able to use `*` in the `esClient.get()` `options.namespace`.
    const [packagePolicy] = await this.getByIDs(soClient, [id], {
      spaceIds: options.spaceId ? [options.spaceId] : undefined,
    }).catch(async (err) => {
      // Emulate prior implementation that threw a Saved Objects error so that backwards compatibility is maintained
      if (err instanceof FleetNotFoundError) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(
          await getAgentPolicySavedObjectType(),
          id
        );
      }

      throw SavedObjectsErrorHelpers.createBadRequestError(err.message);
    });

    if (!packagePolicy) {
      logger.debug(`Package Policy [${id}] was not found`);
      return null;
    }

    if (packagePolicy.package?.name) {
      const installation = await soClient
        .get<Installation>(PACKAGES_SAVED_OBJECT_TYPE, packagePolicy.package?.name)
        .catch(
          catchAndSetErrorStackTrace.withMessage(
            `Failed to get package [${packagePolicy.package.name}]`
          )
        );

      // If possible, return the experimental features map for the package policy's `package` field
      if (
        installation &&
        !installation.error &&
        installation.attributes?.experimental_data_stream_features
      ) {
        packagePolicy.package.experimental_data_stream_features =
          installation.attributes?.experimental_data_stream_features;
      }
    }

    return packagePolicy;
  }

  public async findAllForAgentPolicy(
    soClient: SavedObjectsClientContract,
    agentPolicyId: string,
    options: PackagePolicyClientFindAllForAgentPolicyOptions = {}
  ): Promise<PackagePolicy[]> {
    const logger = this.getLogger('findAllForAgentPolicy');
    const isSpacesEnabled = await isSpaceAwarenessEnabled();

    logger.debug(
      () =>
        `Finding all package policies for agent policy [${agentPolicyId}] with options [${JSON.stringify(
          options
        )}], soClient scoped to [${soClient.getCurrentNamespace()}]`
    );

    const savedObjectType = await getPackagePolicySavedObjectType();
    const packagePolicySO = await soClient
      .find<PackagePolicySOAttributes>({
        type: savedObjectType,
        filter: buildCurrentRevisionFilter(
          savedObjectType,
          `${savedObjectType}.attributes.policy_ids:${escapeSearchQueryPhrase(agentPolicyId)}`
        ),
        perPage: SO_SEARCH_LIMIT,
        namespaces: isSpacesEnabled ? options.spaceIds : undefined,
      })
      .catch(
        catchAndSetErrorStackTrace.withMessage(
          `Error encountered while attempting to get all package policies for agent policy [${agentPolicyId}]`
        )
      );

    if (!packagePolicySO) {
      logger.debug(() => `No package policies found for agent policy id [${agentPolicyId}]`);
      return [];
    }

    const packagePolicies = packagePolicySO.saved_objects.map((so) =>
      mapPackagePolicySavedObjectToPackagePolicy(so)
    );

    for (const packagePolicy of packagePolicies) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'find',
        id: packagePolicy.id,
        name: packagePolicy.name,
        savedObjectType,
      });
    }

    logger.debug(
      () =>
        `returning ${packagePolicies.length} package policies for agent policy [${agentPolicyId}]`
    );

    return packagePolicies;
  }

  public async getByIDs(
    soClient: SavedObjectsClientContract,
    ids: string[],
    options: PackagePolicyClientGetByIdsOptions = {}
  ): Promise<PackagePolicy[]> {
    const logger = this.getLogger('getByIDs');
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();

    logger.debug(
      () =>
        `Retrieving package policies [${ids.join(
          ', '
        )}] using soClient scoped to [${soClient.getCurrentNamespace()}] and options [${JSON.stringify(
          options
        )}]`
    );

    const packagePolicySO = await soClient
      .bulkGet<PackagePolicySOAttributes>(
        ids.map((id) => ({
          id,
          type: savedObjectType,
          namespaces: isSpacesEnabled ? options.spaceIds : undefined,
        }))
      )
      .catch(catchAndSetErrorStackTrace.withMessage('bulkGet of package policies failed'));

    const packagePolicies = packagePolicySO.saved_objects
      .map((so): PackagePolicy | null => {
        if (so.error) {
          if (options.ignoreMissing && so.error.statusCode === 404) {
            return null;
          } else if (so.error.statusCode === 404) {
            throw new PackagePolicyNotFoundError(`Package policy ${so.id} not found`, {
              packagePolicyId: so.id,
            });
          } else {
            throw new FleetError(so.error.message);
          }
        }

        return mapPackagePolicySavedObjectToPackagePolicy(so);
      })
      .filter((packagePolicy): packagePolicy is PackagePolicy => packagePolicy !== null);

    for (const packagePolicy of packagePolicies) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'get',
        id: packagePolicy.id,
        name: packagePolicy.name,
        savedObjectType,
      });
    }

    logger.debug(`returning [${packagePolicies.length}] package policies`);

    return packagePolicies;
  }

  public async list(
    soClient: SavedObjectsClientContract,
    options: ListWithKuery & { spaceId?: string }
  ): Promise<ListResult<PackagePolicy>> {
    const logger = this.getLogger('list');
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();

    const {
      page = 1,
      perPage = 20,
      sortField = 'updated_at',
      sortOrder = 'desc',
      kuery,
      fields,
    } = options;

    logger.debug(
      () =>
        `Retrieving list of package policies with soClient scoped to [${soClient.getCurrentNamespace()}] and options:${JSON.stringify(
          options
        )}`
    );

    const filter = _normalizePackagePolicyKuery(
      savedObjectType,
      buildCurrentRevisionFilter(savedObjectType, kuery)
    );

    const packagePolicies = await soClient
      .find<PackagePolicySOAttributes>({
        type: savedObjectType,
        sortField,
        sortOrder,
        page,
        perPage,
        fields,
        filter,
        namespaces: isSpacesEnabled && options.spaceId ? [options.spaceId] : undefined,
      })
      .catch(catchAndSetErrorStackTrace.withMessage('failed to find package policies'));

    for (const packagePolicy of packagePolicies?.saved_objects ?? []) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'find',
        id: packagePolicy.id,
        name: packagePolicy.attributes?.name,
        savedObjectType,
      });
    }

    const response = {
      items: packagePolicies?.saved_objects.map((so) =>
        mapPackagePolicySavedObjectToPackagePolicy(so)
      ),
      total: packagePolicies?.total,
      page,
      perPage,
    };

    logger.debug(
      `Query matched [${response.total}] package policies - returning page [${page}] with [${response.items.length}] polices`
    );

    return response;
  }

  public async listIds(
    soClient: SavedObjectsClientContract,
    options: PackagePolicyClientListIdsOptions
  ): Promise<ListResult<string>> {
    const logger = this.getLogger('listIds');
    const { page = 1, perPage = 20, sortField = 'updated_at', sortOrder = 'desc', kuery } = options;
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();

    logger.debug(
      () =>
        `Fetching list of package policies IDs with soClient scoped to [${soClient.getCurrentNamespace()}] using options [${JSON.stringify(
          options
        )}]`
    );

    const filter = _normalizePackagePolicyKuery(
      savedObjectType,
      buildCurrentRevisionFilter(savedObjectType, kuery)
    );

    const packagePolicies = await soClient
      .find<{ name: string }>({
        type: savedObjectType,
        sortField,
        sortOrder,
        page,
        perPage,
        fields: ['name'],
        filter,
        namespaces: isSpacesEnabled ? options.spaceIds : undefined,
      })
      .catch(catchAndSetErrorStackTrace.withMessage('failed to find package policies IDs'));

    for (const packagePolicy of packagePolicies.saved_objects) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'find',
        id: packagePolicy.id,
        name: packagePolicy.attributes?.name,
        savedObjectType,
      });
    }

    const response = {
      items: packagePolicies.saved_objects.map((packagePolicySO) => packagePolicySO.id),
      total: packagePolicies.total,
      page,
      perPage,
    };

    logger.debug(
      `Found [${response.total}] package policies - returning page [${page}] with [${response.items.length}] polices IDs`
    );

    return response;
  }

  public async update(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    packagePolicyUpdate: UpdatePackagePolicy,
    options?: {
      user?: AuthenticatedUser;
      force?: boolean;
      skipUniqueNameVerification?: boolean;
      bumpRevision?: boolean;
    }
  ): Promise<PackagePolicy> {
    const logger = this.getLogger('update');

    logger.debug(
      () =>
        `Updating package policy [${id}] with soClient scoped to [${soClient.getCurrentNamespace()}]`
    );

    const savedObjectType = await getPackagePolicySavedObjectType();
    auditLoggingService.writeCustomSoAuditLog({
      action: 'update',
      id,
      name: packagePolicyUpdate.name,
      savedObjectType,
    });

    this.keepPolicyIdInSync(packagePolicyUpdate);
    await preflightCheckPackagePolicy(soClient, packagePolicyUpdate);

    let enrichedPackagePolicy: UpdatePackagePolicy;
    let secretReferences: SecretReference[] | undefined;
    let secretsToDelete: SecretReference[] | undefined;

    try {
      logger.debug(`Starting update of package policy ${id}`);
      enrichedPackagePolicy = await packagePolicyService.runExternalCallbacks(
        'packagePolicyUpdate',
        packagePolicyUpdate,
        soClient,
        esClient
      );
    } catch (error) {
      logger.error(`An error occurred executing "packagePolicyUpdate" callback: ${error}`);
      logger.error(error);
      if (error.apiPassThrough) {
        throw error;
      }
      enrichedPackagePolicy = packagePolicyUpdate;
    }

    const packagePolicy = { ...enrichedPackagePolicy, name: enrichedPackagePolicy.name.trim() };
    const oldPackagePolicy = await this.get(soClient, id);

    if (packagePolicyUpdate.is_managed && !options?.force) {
      throw new PackagePolicyRestrictionRelatedError(`Cannot update package policy ${id}`);
    }
    if (!oldPackagePolicy) {
      throw new PackagePolicyNotFoundError('Package policy not found');
    } else {
      this.keepPolicyIdInSync(oldPackagePolicy);
    }

    const agentPolicies: AgentPolicy[] = [];

    for (const policyId of packagePolicyUpdate.policy_ids) {
      const agentPolicy = await agentPolicyService.get(soClient, policyId, false);
      if (!agentPolicy) {
        throw new AgentPolicyNotFoundError('Agent policy not found');
      }

      agentPolicies.push(agentPolicy);
    }

    const spaceIds = agentPolicies.flatMap((ap) => ap.space_ids ?? []);

    if (
      packagePolicy.name &&
      packagePolicy.name !== oldPackagePolicy.name &&
      !options?.skipUniqueNameVerification
    ) {
      await requireUniqueName(soClient, enrichedPackagePolicy, id, spaceIds);
    }

    if (packagePolicy.namespace) {
      await validatePolicyNamespaceForSpace({
        namespace: packagePolicy.namespace,
        spaceId: soClient.getCurrentNamespace(),
      });
    }
    await validateAdditionalDatastreamsPermissionsForSpace({
      additionalDatastreamsPermissions: enrichedPackagePolicy.additional_datastreams_permissions,
      spaceId: soClient.getCurrentNamespace(),
    });

    // eslint-disable-next-line prefer-const
    let { version, ...restOfPackagePolicy } = packagePolicy;

    if (!packagePolicy.package?.name) {
      throw new FleetError(
        `Package policy "${packagePolicy.name}" without package are not supported`
      );
    }

    const pkgInfo = await getPackageInfo({
      savedObjectsClient: soClient,
      pkgName: packagePolicy.package.name,
      pkgVersion: packagePolicy.package.version,
      prerelease: true,
    });

    let inputs = getInputsWithIds(restOfPackagePolicy, oldPackagePolicy.id, undefined, pkgInfo);

    inputs = enforceFrozenInputs(oldPackagePolicy.inputs, inputs, options?.force);

    _validateRestrictedFieldsNotModifiedOrThrow({
      oldPackagePolicy,
      packagePolicyUpdate,
    });
    validatePackagePolicyOrThrow(packagePolicy, pkgInfo);

    if (await isSecretStorageEnabled(esClient, soClient)) {
      const secretsRes = await extractAndUpdateSecrets({
        oldPackagePolicy,
        packagePolicyUpdate: { ...restOfPackagePolicy, inputs },
        packageInfo: pkgInfo,
        esClient,
      });
      restOfPackagePolicy = secretsRes.packagePolicyUpdate;
      secretReferences = secretsRes.secretReferences;
      secretsToDelete = secretsRes.secretsToDelete;
      inputs = restOfPackagePolicy.inputs as PackagePolicyInput[];
    }
    const assetsMap = await getAgentTemplateAssetsMap({
      logger,
      packageInfo: pkgInfo,
      savedObjectsClient: soClient,
    });

    inputs = _compilePackagePolicyInputs(
      pkgInfo,
      restOfPackagePolicy.vars || {},
      inputs,
      assetsMap
    );
    const elasticsearchPrivileges = pkgInfo.elasticsearch?.privileges;

    const requiresRoot = isRootPrivilegesRequired(pkgInfo);
    if (restOfPackagePolicy.package && requiresRoot) {
      restOfPackagePolicy.package = {
        ...restOfPackagePolicy.package,
        requires_root: requiresRoot,
        fips_compatible: checkIntegrationFipsLooseCompatibility(pkgInfo?.name, pkgInfo),
      };
    }

    for (const agentPolicy of agentPolicies) {
      if (agentPolicy) {
        validateReusableIntegrationsAndSpaceAwareness(packagePolicy, [agentPolicy]);
      }

      validateAgentlessForPackagePolicy(packagePolicy, agentPolicy, pkgInfo);

      // Validate that global_data_tags is only set on agentless package policies
      if (
        packagePolicy.global_data_tags?.length &&
        !(packagePolicy.supports_agentless || agentPolicy?.supports_agentless)
      ) {
        throw new PackagePolicyValidationError(
          '`global_data_tags` can only be set on agentless integration policies'
        );
      }
    }

    // Handle component template/mappings updates for experimental features, e.g. synthetic source
    await handleExperimentalDatastreamFeatureOptIn({
      soClient,
      esClient,
      packagePolicy: restOfPackagePolicy,
    });

    // If the package version has increased, save the previous package policy revision.
    if (
      appContextService.getExperimentalFeatures().enablePackageRollback &&
      packagePolicy.package &&
      oldPackagePolicy.package &&
      semverGt(packagePolicy.package.version, oldPackagePolicy.package.version)
    ) {
      logger.debug(
        `Saving previous revision of package policy ${id} with package version ${oldPackagePolicy.version}`
      );
      const currentPackagePolicySO = await soClient.get<PackagePolicySOAttributes>(
        savedObjectType,
        id
      );
      const previousRevisionSO = {
        ...currentPackagePolicySO,
        id: `${id}:prev`,
        attributes: {
          ...currentPackagePolicySO.attributes,
          latest_revision: false,
        },
      };
      try {
        await soClient.update<PackagePolicySOAttributes>(
          savedObjectType,
          `${id}:prev`,
          previousRevisionSO.attributes
        );
      } catch (error) {
        if (error.output.statusCode === 404) {
          await soClient.create<PackagePolicySOAttributes>(
            savedObjectType,
            previousRevisionSO.attributes,
            {
              id: `${id}:prev`,
            }
          );
        } else {
          throw error;
        }
      }
    }

    logger.debug(`Updating SO with revision ${oldPackagePolicy.revision + 1}`);
    await soClient
      .update<PackagePolicySOAttributes>(
        savedObjectType,
        id,
        {
          ...restOfPackagePolicy,
          ...(restOfPackagePolicy.package
            ? { package: omit(restOfPackagePolicy.package, 'experimental_data_stream_features') }
            : {}),
          inputs,
          ...(elasticsearchPrivileges && {
            elasticsearch: { privileges: elasticsearchPrivileges },
          }),
          ...(secretReferences?.length && { secret_references: secretReferences }),
          revision: oldPackagePolicy.revision + 1,
          updated_at: new Date().toISOString(),
          updated_by: options?.user?.username ?? 'system',
          package_agent_version_condition: pkgInfo?.conditions?.agent?.version,
        },
        {
          version,
        }
      )
      .catch(catchAndSetErrorStackTrace.withMessage(`update of package policy [${id}] failed`));

    const newPolicy = (await this.get(soClient, id)) as PackagePolicy;

    // if we have moved to an input package we need to create the index templates
    // for the package policy as input packages create index templates per package policy
    if (
      pkgInfo &&
      pkgInfo.type === 'input' &&
      oldPackagePolicy.package &&
      oldPackagePolicy.package?.version !== pkgInfo.version
    ) {
      if (oldPackagePolicy.package) {
        const oldPackage = await getPackageInfo({
          savedObjectsClient: soClient,
          pkgName: oldPackagePolicy.package?.name,
          pkgVersion: oldPackagePolicy.package?.version,
          prerelease: true,
        });

        if (oldPackage.type === 'integration') {
          await installAssetsForInputPackagePolicy({
            logger,
            soClient,
            esClient,
            pkgInfo,
            packagePolicy: newPolicy,
            force: true,
          });
        }
      }
    }

    await this.compilePackagePolicyForVersions(soClient, pkgInfo, assetsMap, newPolicy);

    // Bump revision of all associated agent policies (old and new)
    const associatedPolicyIds = new Set([...oldPackagePolicy.policy_ids, ...newPolicy.policy_ids]);
    logger.debug(`Bumping revision of associated agent policies ${associatedPolicyIds}`);

    const bumpPromise = this.bumpAgentPoliciesRevision(
      { soClient, esClient },
      [...associatedPolicyIds],
      {
        user: options?.user,
        removeProtectionFn: (policyId) => {
          const isEndpointPolicy = newPolicy.package?.name === 'endpoint';

          if (!isEndpointPolicy) {
            return undefined;
          }

          const assignedInOldPolicy = oldPackagePolicy.policy_ids.includes(policyId);
          const assignedInNewPolicy = newPolicy.policy_ids.includes(policyId);

          return (
            (assignedInOldPolicy && !assignedInNewPolicy) ||
            (!assignedInOldPolicy && assignedInNewPolicy)
          );
        },
      }
    );

    const assetRemovePromise = removeOldAssets({
      soClient,
      pkgName: newPolicy.package!.name,
      currentVersion: newPolicy.package!.version,
    });
    const deleteSecretsPromise = secretsToDelete?.length
      ? deleteSecrets({ esClient, soClient, ids: secretsToDelete.map((s) => s.id) })
      : Promise.resolve();

    await Promise.all([bumpPromise, assetRemovePromise, deleteSecretsPromise]);

    sendUpdatePackagePolicyTelemetryEvent(soClient, [packagePolicyUpdate], [oldPackagePolicy]);

    // Run external post-update callbacks and return
    const response = packagePolicyService.runExternalCallbacks(
      'packagePolicyPostUpdate',
      newPolicy,
      soClient,
      esClient
    );

    logger.debug(`Package policy ${id} update completed`);
    return response;
  }

  public async bulkUpdate(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicyUpdates: Array<NewPackagePolicy & { version?: string; id: string }>,
    options: PackagePolicyClientBulkUpdateOptions = {}
  ): Promise<{
    updatedPolicies: PackagePolicy[] | null;
    failedPolicies: Array<{
      packagePolicy: NewPackagePolicyWithId;
      error: Error | SavedObjectError;
    }>;
  }> {
    const logger = this.getLogger('bulkUpdate');
    const savedObjectType = await getPackagePolicySavedObjectType();

    logger.debug(
      () =>
        `Processing [${
          packagePolicyUpdates.length
        }] updates with soClient scoped to [${soClient.getCurrentNamespace()}]`
    );

    for (const packagePolicy of packagePolicyUpdates) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'update',
        id: packagePolicy.id,
        name: packagePolicy.name,
        savedObjectType,
      });
    }

    const oldPackagePolicies = options?.oldPackagePolicies
      ? options?.oldPackagePolicies
      : await this.getByIDs(
          soClient,
          packagePolicyUpdates.map((p) => p.id)
        );

    if (!oldPackagePolicies || oldPackagePolicies.length === 0) {
      throw new PackagePolicyNotFoundError('Package policy not found');
    }

    const agentPolicyIds = new Set(packagePolicyUpdates.flatMap((p) => p.policy_ids ?? []));
    const agentPoliciesForBulkUpdate = await agentPolicyService.getByIds(soClient, [
      ...agentPolicyIds,
    ]);
    const agentPoliciesIndexByIdForBulkUpdate = indexBy('id', agentPoliciesForBulkUpdate);

    const packageInfos = await getPackageInfoForPackagePolicies(
      packagePolicyUpdates,
      soClient,
      true
    );

    const oldPackageInfos = await getPackageInfoForPackagePolicies(
      oldPackagePolicies,
      soClient,
      true
    );

    const allPackageInfos = [...packageInfos.entries(), ...oldPackageInfos.entries()].reduce(
      (acc, [pkgKey, pkgInfo]) => {
        acc.set(pkgKey, pkgInfo);

        return acc;
      },
      new Map<string, PackageInfo>()
    );

    const allSecretsToDelete: SecretReference[] = [];

    const packageInfosandAssetsMap = await getPkgInfoAssetsMap({
      logger,
      packageInfos: [...packageInfos.values()],
      savedObjectsClient: soClient,
    });

    const policiesToUpdate: Array<SavedObjectsBulkUpdateObject<PackagePolicySOAttributes>> = [];
    const failedPolicies: Array<{
      packagePolicy: NewPackagePolicyWithId;
      error: Error | SavedObjectError;
    }> = [];
    const previousPolicyRevisionsToCreate: Array<
      SavedObjectsBulkCreateObject<PackagePolicySOAttributes>
    > = [];
    const previousPolicyRevisionsToUpdate: Array<
      SavedObjectsBulkUpdateObject<PackagePolicySOAttributes>
    > = [];

    const secretStorageEnabled = await isSecretStorageEnabled(esClient, soClient);

    const assetsToInstallFn: Array<() => Promise<void>> = [];

    await pMap(packagePolicyUpdates, async (packagePolicyUpdate) => {
      try {
        const id = packagePolicyUpdate.id;
        this.keepPolicyIdInSync(packagePolicyUpdate);
        let enrichedPackagePolicy: UpdatePackagePolicy;
        try {
          logger.debug(`Starting update of package policy ${id}`);
          enrichedPackagePolicy = await packagePolicyService.runExternalCallbacks(
            'packagePolicyUpdate',
            packagePolicyUpdate,
            soClient,
            esClient
          );
        } catch (error) {
          logger.error(`An error occurred executing "packagePolicyUpdate" callback: ${error}`);
          logger.error(error);
          if (error.apiPassThrough) {
            throw error;
          }
          enrichedPackagePolicy = packagePolicyUpdate;
        }

        const packagePolicy = { ...enrichedPackagePolicy, name: enrichedPackagePolicy.name.trim() };

        await preflightCheckPackagePolicy(soClient, packagePolicy);
        const oldPackagePolicy = oldPackagePolicies.find((p) => p.id === id);
        if (!oldPackagePolicy) {
          throw new PackagePolicyNotFoundError(`Package policy [${id}] not found`, {
            packagePolicyId: id,
          });
        } else {
          this.keepPolicyIdInSync(oldPackagePolicy);
        }

        // If the package version has increased, save the previous package policy revision.
        if (
          appContextService.getExperimentalFeatures().enablePackageRollback &&
          packagePolicy.package &&
          oldPackagePolicy.package &&
          semverGt(packagePolicy.package.version, oldPackagePolicy.package.version) &&
          !packagePolicyUpdate.is_managed
        ) {
          const internalSoClientWithoutSpaceExtension =
            appContextService.getInternalUserSOClientWithoutSpaceExtension();
          // checking is_managed flag on agent policy, it is not always set on package policy
          const agentPolicies = await agentPolicyService.getByIds(
            internalSoClientWithoutSpaceExtension,
            packagePolicy.policy_ids.map((policyId) => ({ id: policyId, spaceId: '*' }))
          );

          validateReusableIntegrationsAndSpaceAwareness(packagePolicy, agentPolicies);

          if (!agentPolicies.some((policy) => policy.is_managed)) {
            logger.debug(
              `Saving previous revision of package policy ${id} with package version ${oldPackagePolicy.version}`
            );
            const currentPackagePolicySO = await soClient.get<PackagePolicySOAttributes>(
              savedObjectType,
              id
            );
            const previousRevisionSO = {
              ...currentPackagePolicySO,
              id: `${id}:prev`,
              attributes: {
                ...currentPackagePolicySO.attributes,
                latest_revision: false,
              },
            };
            try {
              await soClient.get<PackagePolicySOAttributes>(savedObjectType, `${id}:prev`);
              previousPolicyRevisionsToUpdate.push(previousRevisionSO);
            } catch (error) {
              if (error.output.statusCode === 404) {
                previousPolicyRevisionsToCreate.push(previousRevisionSO);
              } else {
                throw error;
              }
            }
          }
        }

        let secretReferences: SecretReference[] | undefined;

        const { version } = packagePolicyUpdate;
        // id and version are not part of the saved object attributes
        // eslint-disable-next-line prefer-const
        let { version: _version, id: _id, ...restOfPackagePolicy } = packagePolicy;

        if (packagePolicyUpdate.is_managed && !options?.force) {
          throw new PackagePolicyRestrictionRelatedError(`Cannot update package policy ${id}`);
        }

        if (!packagePolicy.package?.name) {
          throw new FleetError(
            `Package policy "${packagePolicy.name}" without package are not supported`
          );
        }
        const pkgInfoAndAsset = packageInfosandAssetsMap.get(
          `${packagePolicy.package.name}-${packagePolicy.package.version}`
        );
        if (!pkgInfoAndAsset) {
          throw new FleetError(
            `Package info and assets not found: ${packagePolicy.package.name}-${packagePolicy.package.version}`
          );
        }
        const { pkgInfo, assetsMap } = pkgInfoAndAsset;
        let inputs = getInputsWithIds(restOfPackagePolicy, oldPackagePolicy.id, undefined, pkgInfo);
        inputs = enforceFrozenInputs(oldPackagePolicy.inputs, inputs, options?.force);

        validatePackagePolicyOrThrow(packagePolicy, pkgInfo);

        for (const policyId of packagePolicy.policy_ids ?? []) {
          validateAgentlessForPackagePolicy(
            packagePolicy,
            agentPoliciesIndexByIdForBulkUpdate[policyId],
            pkgInfo
          );
        }

        if (secretStorageEnabled) {
          const secretsRes = await extractAndUpdateSecrets({
            oldPackagePolicy,
            packagePolicyUpdate: { ...restOfPackagePolicy, inputs },
            packageInfo: pkgInfo,
            esClient,
          });

          restOfPackagePolicy = secretsRes.packagePolicyUpdate;
          secretReferences = secretsRes.secretReferences;
          allSecretsToDelete.push(...secretsRes.secretsToDelete);
          inputs = restOfPackagePolicy.inputs as PackagePolicyInput[];
        }
        inputs = _compilePackagePolicyInputs(
          pkgInfo,
          restOfPackagePolicy.vars || {},
          inputs,
          assetsMap
        );
        const elasticsearchPrivileges = pkgInfo.elasticsearch?.privileges;

        const requiresRoot = isRootPrivilegesRequired(pkgInfo);
        if (restOfPackagePolicy.package && requiresRoot) {
          restOfPackagePolicy.package = {
            ...restOfPackagePolicy.package,
            requires_root: requiresRoot,
            fips_compatible: checkIntegrationFipsLooseCompatibility(pkgInfo?.name, pkgInfo),
          };
        }

        if (
          pkgInfo &&
          pkgInfo.type === 'input' &&
          oldPackagePolicy.package &&
          oldPackagePolicy.package.version !== pkgInfo.version
        ) {
          const oldPackageInfo = allPackageInfos.get(
            `${oldPackagePolicy.package.name}-${oldPackagePolicy.package.version}`
          );
          if (oldPackageInfo?.type === 'integration') {
            assetsToInstallFn.push(async () => {
              const updatedPackagePolicy = await this.get(soClient, id);

              if (!updatedPackagePolicy) {
                return;
              }

              await installAssetsForInputPackagePolicy({
                logger,
                soClient,
                esClient,
                pkgInfo,
                packagePolicy: updatedPackagePolicy,
                force: true,
              });
            });
          }
        }

        if (!options?.fromBulkUpgrade) {
          // Handle component template/mappings updates for experimental features, e.g. synthetic source
          await handleExperimentalDatastreamFeatureOptIn({ soClient, esClient, packagePolicy });
        }

        policiesToUpdate.push({
          type: savedObjectType,
          id,
          attributes: {
            ...restOfPackagePolicy,
            ...(restOfPackagePolicy.package
              ? { package: omit(restOfPackagePolicy.package, 'experimental_data_stream_features') }
              : {}),
            inputs,
            ...(elasticsearchPrivileges && {
              elasticsearch: { privileges: elasticsearchPrivileges },
            }),
            ...(secretReferences?.length && { secret_references: secretReferences }),
            revision: oldPackagePolicy.revision + 1,
            updated_at: new Date().toISOString(),
            updated_by: options?.user?.username ?? 'system',
          },
          version,
        });

        logger.debug(`saved object update document for package policy [${id}] was built`);
      } catch (error) {
        logger.debug(
          () =>
            `Preparing update to package policy [${
              packagePolicyUpdate.id
            }] failed:\n${JSON.stringify(error)}`
        );

        failedPolicies.push({
          packagePolicy: packagePolicyUpdate,
          error,
        });
      }
    });

    // Store previous revision.
    if (appContextService.getExperimentalFeatures().enablePackageRollback) {
      if (previousPolicyRevisionsToCreate.length > 0) {
        await soClient
          .bulkCreate<PackagePolicySOAttributes>(previousPolicyRevisionsToCreate)
          .catch(
            catchAndSetErrorStackTrace.withMessage(
              'Saved objects bulk create of previous package policy revisions failed'
            )
          );
      }
      if (previousPolicyRevisionsToUpdate.length > 0) {
        await soClient
          .bulkUpdate<PackagePolicySOAttributes>(previousPolicyRevisionsToUpdate)
          .catch(
            catchAndSetErrorStackTrace.withMessage(
              'Saved objects bulk update of previous package policy revisions failed'
            )
          );
      }
    }

    // Update package policies SO.
    const { saved_objects: updatedPolicies } = await soClient
      .bulkUpdate<PackagePolicySOAttributes>(policiesToUpdate)
      .catch(catchAndSetErrorStackTrace.withMessage(`Saved objects bulk update failed`));

    for (const updatedPolicy of updatedPolicies) {
      const pkgInfo = packageInfos.get(
        `${updatedPolicy.attributes.package?.name}-${updatedPolicy.attributes.package?.version}`
      )!;
      await this.compilePackagePolicyForVersions(
        soClient,
        pkgInfo,
        packageInfosandAssetsMap.get(`${pkgInfo.name}-${pkgInfo.version}`)?.assetsMap!,
        mapPackagePolicySavedObjectToPackagePolicy(updatedPolicy as any)
      );
    }

    // Bump revision of all associated agent policies (old and new)
    const associatedPolicyIds = new Set([
      ...packagePolicyUpdates.flatMap((p) => p.policy_ids),
      ...oldPackagePolicies.flatMap((p) => p.policy_ids),
    ]);

    const [endpointPackagePolicyUpdatesIds, endpointOldPackagePoliciesIds] = [
      packagePolicyUpdates,
      oldPackagePolicies,
    ].map(
      (packagePolicies) =>
        new Set(
          packagePolicies
            .filter((p) => p.package?.name === 'endpoint')
            .map((p) => p.policy_ids)
            .flat()
        )
    );

    const installAssetsPromise = pMap(assetsToInstallFn, (fn) => fn(), {
      concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_10,
    });

    const bumpPromise = this.bumpAgentPoliciesRevision(
      { soClient, esClient },
      [...associatedPolicyIds],
      {
        user: options?.user,
        asyncDeploy: options?.asyncDeploy,
        removeProtectionFn: (agentPolicyId) => {
          // Check if the agent policy is in both old and updated package policies
          const assignedInOldPolicies = endpointOldPackagePoliciesIds.has(agentPolicyId);
          const assignedInUpdatedPolicies = endpointPackagePolicyUpdatesIds.has(agentPolicyId);

          // Remove protection if policy is unassigned (in old but not in updated) or policy is assigned (in updated but not in old)
          const removeProtection =
            (assignedInOldPolicies && !assignedInUpdatedPolicies) ||
            (!assignedInOldPolicies && assignedInUpdatedPolicies);

          return removeProtection;
        },
      }
    ).finally(() => {
      logger.debug(`bumping of revision for associated agent policies done`);
    });

    const pkgVersions: Record<string, { name: string; version: string }> = {};
    packagePolicyUpdates.forEach(({ package: pkg }) => {
      if (pkg) {
        pkgVersions[pkg.name + '-' + pkg.version] = {
          name: pkg.name,
          version: pkg.version,
        };
      }
    });

    const removeAssetPromise = pMap(Object.keys(pkgVersions), async (pkgVersion) => {
      const { name, version } = pkgVersions[pkgVersion];
      await removeOldAssets({
        soClient,
        pkgName: name,
        currentVersion: version,
      });
    });

    const deleteSecretsPromise = allSecretsToDelete.length
      ? deleteSecrets({ esClient, soClient, ids: allSecretsToDelete.map((s) => s.id) })
      : Promise.resolve();

    await Promise.all([
      bumpPromise,
      removeAssetPromise,
      deleteSecretsPromise,
      installAssetsPromise,
    ]);

    sendUpdatePackagePolicyTelemetryEvent(soClient, packagePolicyUpdates, oldPackagePolicies);

    updatedPolicies.forEach((policy) => {
      if (policy.error) {
        const hasAlreadyFailed = failedPolicies.some(
          (failedPolicy) => failedPolicy.packagePolicy.id === policy.id
        );
        if (!hasAlreadyFailed) {
          failedPolicies.push({
            packagePolicy: packagePolicyUpdates.find((p) => p.id === policy.id)!,
            error: policy.error,
          });
        }
      }
    });

    let updatedPoliciesSuccess = updatedPolicies
      .filter((policy) => !policy.error && policy.attributes)
      .map((soPolicy) =>
        mapPackagePolicySavedObjectToPackagePolicy(
          soPolicy as SavedObject<PackagePolicySOAttributes>
        )
      );

    updatedPoliciesSuccess = (
      await pMap(
        chunk(updatedPoliciesSuccess, MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS),
        async (updatedPoliciesChunk) => {
          const updatedPoliciesComplete = await this.getByIDs(
            soClient,
            updatedPoliciesChunk.map((p) => p.id)
          );
          return pMap(updatedPoliciesComplete, (packagePolicy) =>
            packagePolicyService.runExternalCallbacks(
              'packagePolicyPostUpdate',
              packagePolicy,
              soClient,
              esClient
            )
          );
        },
        { concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_10 }
      )
    ).flat();

    logger.debug(
      () =>
        `Done. Successful updates: [${updatedPoliciesSuccess.length}] | Failures: [${failedPolicies.length}]`
    );

    return { updatedPolicies: updatedPoliciesSuccess, failedPolicies };
  }

  public async delete(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    ids: string[],
    options?: PackagePolicyClientDeleteOptions,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<PostDeletePackagePoliciesResponse> {
    const savedObjectType = await getPackagePolicySavedObjectType();
    for (const id of ids) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'delete',
        id,
        savedObjectType,
      });
    }

    const result: PostDeletePackagePoliciesResponse = [];
    const logger = this.getLogger('delete');
    logger.debug(`Deleting package policies ${ids}`);

    const packagePolicies = await this.getByIDs(soClient, ids, {
      ignoreMissing: true,
      spaceIds: options?.spaceIds,
    });

    if (!packagePolicies || packagePolicies.length === 0) {
      logger.debug(`No package policies to delete`);
      return [];
    }

    try {
      await packagePolicyService.runDeleteExternalCallbacks(
        packagePolicies,
        soClient,
        esClient,
        context,
        request
      );
    } catch (error) {
      logger.error(`An error occurred executing "packagePolicyDelete" callback: ${error}`);
      logger.error(error);
    }

    const uniqueAgentPolicyIds = [
      ...new Set(packagePolicies.flatMap((packagePolicy) => packagePolicy.policy_ids)),
    ];

    const hostedAgentPolicies: string[] = [];
    const agentlessAgentPolicies: string[] = [];

    for (const agentPolicyId of uniqueAgentPolicyIds) {
      try {
        const agentPolicy = await agentPolicyService.get(soClient, agentPolicyId);
        if (!agentPolicy) {
          throw new AgentPolicyNotFoundError('Agent policy not found');
        }

        validateIsNotHostedPolicy(
          agentPolicy,
          options?.force,
          'Cannot remove integrations of hosted agent policy'
        );
        // collect agentless agent policies to delete
        if (agentPolicy.supports_agentless) {
          agentlessAgentPolicies.push(agentPolicyId);
        }
      } catch (e) {
        logger.error(
          `An error occurred while checking if policies are hosted: ${e?.output?.payload?.message}`
        );
        // in case of orphaned policies don't add the id to the hostedAgentPolicies array
        if (e?.output?.statusCode !== 404) hostedAgentPolicies.push(agentPolicyId);
      }
    }

    const idsToDelete: string[] = [];

    ids.forEach((id) => {
      try {
        const packagePolicy = packagePolicies.find((p) => p.id === id);

        if (!packagePolicy) {
          throw new PackagePolicyNotFoundError(`Saved object [${savedObjectType}/${id}] not found`);
        }

        if (packagePolicy.is_managed && !options?.force) {
          throw new PackagePolicyRestrictionRelatedError(`Cannot delete package policy ${id}`);
        }

        if (packagePolicy.policy_ids.some((policyId) => hostedAgentPolicies.includes(policyId))) {
          throw new HostedAgentPolicyRestrictionRelatedError(
            'Cannot remove integrations of hosted agent policy'
          );
        }

        idsToDelete.push(id);
      } catch (error) {
        if (options?.ignoreMissing && error instanceof PackagePolicyNotFoundError) {
          result.push({
            id,
            success: false,
            statusCode: 404,
            body: { message: error.message },
          });
        } else {
          result.push({
            id,
            success: false,
            ...fleetErrorToResponseOptions(error),
          });
        }
      }
    });

    const secretsToDelete: string[] = [];
    if (idsToDelete.length > 0) {
      const { statuses } = await soClient
        .bulkDelete(
          idsToDelete.map((id) => ({ id, type: savedObjectType })),
          {
            force: true, // need to delete through multiple space
          }
        )
        .catch(
          catchAndSetErrorStackTrace.withMessage(
            `Bulk delete of package policies [${idsToDelete.join(', ')}] failed`
          )
        );

      // delete previous versions
      const response = await soClient
        .bulkDelete(
          idsToDelete.map((id) => ({ id: `${id}:prev`, type: savedObjectType })),
          {
            force: true, // need to delete through multiple space
          }
        )
        .catch((error) => logger.error(`Error deleting previous versions: ${error}`));
      logger.debug(`Attempted to delete previous versions ${JSON.stringify(response)}`);

      statuses.forEach(({ id, success, error }) => {
        const packagePolicy = packagePolicies.find((p) => p.id === id);
        if (success && packagePolicy) {
          result.push({
            id,
            name: packagePolicy.name,
            success: true,
            package: {
              name: packagePolicy.package?.name || '',
              title: packagePolicy.package?.title || '',
              version: packagePolicy.package?.version || '',
            },
            policy_id: packagePolicy.policy_id,
            policy_ids: packagePolicy.policy_ids,
          });
          // Only delete secrets that belong to the package policy itself,
          // not to cloud connectors (which manage their own secret lifecycle)
          if (packagePolicy?.secret_references?.length) {
            if (!packagePolicy.cloud_connector_id) {
              // Regular package policy secrets - safe to delete
              secretsToDelete.push(...packagePolicy.secret_references.map((s) => s.id));
            } else {
              // Cloud connector secrets - managed by cloud connector lifecycle
              logger.debug(
                `Skipping secret deletion for package policy ${packagePolicy.id} - secrets are managed by cloud connector ${packagePolicy.cloud_connector_id}`
              );
            }
          }
        } else if (!success && error) {
          result.push({
            id,
            success: false,
            statusCode: error.statusCode,
            body: {
              message: error.message,
            },
          });
        }
      });
    }

    if (!options?.skipUnassignFromAgentPolicies) {
      let uniquePolicyIdsR = [
        ...new Set(
          result
            .filter((r) => r.success && r.policy_ids && r.policy_ids.length > 0)
            .flatMap((r) => r.policy_ids!)
        ),
      ];
      uniquePolicyIdsR = without(uniquePolicyIdsR, ...agentlessAgentPolicies);

      const agentPoliciesWithEndpointPackagePolicies = result.reduce((acc, cur) => {
        if (cur.success && cur.policy_ids && cur.package?.name === 'endpoint') {
          for (const policyId of cur.policy_ids) {
            acc.add(policyId);
          }
        }
        return acc;
      }, new Set());

      const agentPolicies = await agentPolicyService.getByIds(soClient, uniquePolicyIdsR);

      await this.bumpAgentPoliciesRevision(
        { soClient, esClient },
        agentPolicies.map((p) => p.id),
        {
          user: options?.user,
          removeProtectionFn: (policyId) => agentPoliciesWithEndpointPackagePolicies.has(policyId),
        }
      );
    }

    if (secretsToDelete.length > 0) {
      await deleteSecrets({ esClient, soClient, ids: secretsToDelete });
    }

    try {
      await packagePolicyService.runPostDeleteExternalCallbacks(
        result,
        soClient,
        esClient,
        context,
        request
      );
      logger.debug(`Deleted package policies ${ids}`);
    } catch (error) {
      logger.error(`An error occurred executing "packagePolicyPostDelete" callback: ${error}`);
      logger.error(error);
    }

    return result;
  }

  public async bulkUpgrade(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    ids: string[],
    options?: { user?: AuthenticatedUser; force?: boolean },
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyResponse> {
    return _packagePoliciesBulkUpgrade({
      packagePolicyService: this,
      soClient,
      esClient,
      ids,
      options,
      pkgVersion,
    });
  }

  public async upgrade(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    options?: { user?: AuthenticatedUser; force?: boolean },
    packagePolicy?: PackagePolicy,
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyResponse> {
    return _packagePoliciesUpgrade({
      packagePolicyService: this,
      soClient,
      esClient,
      id,
      options,
      packagePolicy,
      pkgVersion,
    });
  }

  public async getUpgradeDryRunDiff(
    soClient: SavedObjectsClientContract,
    id: string,
    packagePolicy?: PackagePolicy,
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyDryRunResponseItem> {
    return _packagePoliciesGetUpgradeDryRunDiff({
      packagePolicyService: this,
      soClient,
      id,
      packagePolicy,
      pkgVersion,
    });
  }

  public async enrichPolicyWithDefaultsFromPackage(
    soClient: SavedObjectsClientContract,
    newPolicy: NewPackagePolicy
  ): Promise<NewPackagePolicy> {
    let newPackagePolicy: NewPackagePolicy = newPolicy;
    if (newPolicy.package) {
      const newPP = await this.buildPackagePolicyFromPackageWithVersion(
        soClient,
        newPolicy.package.name,
        newPolicy.package.version
      );
      if (newPP) {
        const inputs = newPolicy.inputs.map((input) => {
          const effectiveName = getInputEffectiveName(input);
          const defaultInput = newPP.inputs.find(
            (i) =>
              getInputEffectiveName(i) === effectiveName &&
              (!input.policy_template || input.policy_template === i.policy_template)
          );
          return {
            ...defaultInput,
            enabled: input.enabled,
            type: input.type,
            // to propagate "enabled: false" to streams
            streams: defaultInput?.streams?.map((stream) => ({
              ...stream,
              enabled: input.enabled,
            })),
          } as NewPackagePolicyInput;
        });

        newPackagePolicy = {
          ...newPP,
          name: newPolicy.name,
          namespace: newPolicy?.namespace ?? '',
          description: newPolicy.description ?? '',
          enabled: newPolicy.enabled ?? true,
          package: {
            ...newPP.package!,
            experimental_data_stream_features: newPolicy.package?.experimental_data_stream_features,
          },
          policy_id: newPolicy.policy_id ?? undefined,
          policy_ids: newPolicy.policy_ids ?? undefined,
          output_id: newPolicy.output_id,
          inputs: newPolicy.inputs[0]?.streams ? newPolicy.inputs : inputs,
          vars: newPolicy.vars || newPP.vars,
          var_group_selections: newPolicy.var_group_selections,
          supports_agentless: newPolicy.supports_agentless,
          supports_cloud_connector: newPolicy.supports_cloud_connector,
          cloud_connector_id: newPolicy.cloud_connector_id,
          cloud_connector_name: newPolicy.cloud_connector_name,
          additional_datastreams_permissions: newPolicy.additional_datastreams_permissions,
          condition: newPolicy.condition,
        };
      }
    }
    return newPackagePolicy;
  }

  private async buildPackagePolicyFromPackageWithVersion(
    soClient: SavedObjectsClientContract,
    pkgName: string,
    pkgVersion: string
  ): Promise<NewPackagePolicy | undefined> {
    const packageInfo = await getPackageInfo({
      savedObjectsClient: soClient,
      pkgName,
      pkgVersion,
      skipArchive: true,
      prerelease: true,
    });
    if (packageInfo) {
      return packageToPackagePolicy(packageInfo, '');
    }
  }

  public async buildPackagePolicyFromPackage(
    soClient: SavedObjectsClientContract,
    pkgName: string,
    options?: { logger?: Logger; installMissingPackage?: boolean }
  ): Promise<NewPackagePolicy | undefined> {
    const pkgInstallObj = await getInstallationObject({
      savedObjectsClient: soClient,
      pkgName,
      logger: options?.logger,
    });
    let pkgInstall = pkgInstallObj?.attributes;
    if (!pkgInstall && options?.installMissingPackage) {
      const esClient = await appContextService.getInternalUserESClient();
      const result = await ensureInstalledPackage({
        esClient,
        pkgName,
        savedObjectsClient: soClient,
      });
      if (result.package) {
        pkgInstall = result.package;
      }
    }
    if (pkgInstall) {
      const packageInfo = await getPackageInfo({
        savedObjectsClient: soClient,
        pkgName: pkgInstall.name,
        pkgVersion: pkgInstall.version,
        prerelease: true,
      });

      if (packageInfo) {
        return packageToPackagePolicy(packageInfo, '');
      }
    }
  }

  public async runExternalCallbacks<A extends ExternalCallback[0]>(
    externalCallbackType: A,
    packagePolicy: RunExternalCallbacksPackagePolicyArgument<A>,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<RunExternalCallbacksPackagePolicyResponse<A>> {
    const logger = this.getLogger('runExternalCallbacks');
    const numberOfCallbacks = appContextService.getExternalCallbacks(externalCallbackType)?.size;
    let runResult: any;

    logger.debug(`Running [${numberOfCallbacks}] external callbacks for [${externalCallbackType}]`);

    try {
      if (externalCallbackType === 'packagePolicyPostDelete') {
        runResult = await this.runPostDeleteExternalCallbacks(
          packagePolicy as PostDeletePackagePoliciesResponse,
          soClient,
          esClient,
          context,
          request
        );
      } else if (externalCallbackType === 'packagePolicyDelete') {
        runResult = await this.runDeleteExternalCallbacks(
          packagePolicy as DeletePackagePoliciesResponse,
          soClient,
          esClient
        );
      } else {
        if (!Array.isArray(packagePolicy)) {
          let newData = packagePolicy;
          const externalCallbacks = appContextService.getExternalCallbacks(externalCallbackType);

          if (externalCallbacks && externalCallbacks.size > 0) {
            let updatedNewData: any = newData;

            for (const callback of externalCallbacks) {
              let thisCallbackResponse;

              try {
                if (externalCallbackType === 'packagePolicyPostCreate') {
                  thisCallbackResponse = await (callback as PostPackagePolicyPostCreateCallback)(
                    updatedNewData as PackagePolicy,
                    soClient,
                    esClient,
                    context,
                    request
                  );
                  updatedNewData = PackagePolicySchema.validate(
                    omit(thisCallbackResponse, 'spaceIds')
                  );
                } else if (externalCallbackType === 'packagePolicyPostUpdate') {
                  thisCallbackResponse = await (callback as PutPackagePolicyPostUpdateCallback)(
                    updatedNewData as PackagePolicy,
                    soClient,
                    esClient,
                    context,
                    request
                  );
                  updatedNewData = PackagePolicySchema.validate(
                    omit(thisCallbackResponse, 'spaceIds')
                  );
                } else {
                  thisCallbackResponse = await (callback as PostPackagePolicyCreateCallback)(
                    updatedNewData as NewPackagePolicy,
                    soClient,
                    esClient,
                    context,
                    request
                  );
                }

                if (externalCallbackType === 'packagePolicyCreate') {
                  updatedNewData = NewPackagePolicySchema.validate(
                    omit(thisCallbackResponse, 'spaceIds')
                  );
                } else if (externalCallbackType === 'packagePolicyUpdate') {
                  const omitted = {
                    ...omit(thisCallbackResponse, [
                      'id',
                      'spaceIds',
                      'version',
                      'revision',
                      'updated_at',
                      'updated_by',
                      'created_at',
                      'created_by',
                      'elasticsearch',
                    ]),
                    inputs: thisCallbackResponse.inputs.map((input) =>
                      omit(input, ['compiled_input'])
                    ),
                  };

                  updatedNewData = UpdatePackagePolicySchema.validate(omitted);
                }
              } catch (callbackError) {
                logger.debug(
                  () =>
                    `The following [${externalCallbackType}] external callback threw an error (first 1k characters of callback):\n${callback
                      .toString()
                      .substring(0, 1000)}`
                );

                // Convert schema validation errors to Fleet errors
                if (
                  callbackError.constructor.name === 'ValidationError' ||
                  callbackError.name === 'ValidationError'
                ) {
                  throw new PackagePolicyValidationError(callbackError.message);
                }

                throw callbackError;
              }
            }

            newData = updatedNewData;
          }

          runResult = newData;
        }
      }
    } catch (error) {
      logger.error(`Error running external callbacks for [${externalCallbackType}]:`);
      logger.error(error);
      throw error;
    }

    logger.debug(`Running of [${externalCallbackType}] external callbacks done`);

    return runResult as unknown as RunExternalCallbacksPackagePolicyResponse<A>;
  }

  public async runPostDeleteExternalCallbacks(
    deletedPackagePolicies: PostDeletePackagePoliciesResponse,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<void> {
    const logger = this.getLogger('runPostDeleteExternalCallbacks');
    const externalCallbacks = appContextService.getExternalCallbacks('packagePolicyPostDelete');
    const errorsThrown: Error[] = [];

    logger.debug(`Running [${externalCallbacks?.size}] external callbacks`);

    if (externalCallbacks && externalCallbacks.size > 0) {
      for (const callback of externalCallbacks) {
        // Failures from an external callback should not prevent other external callbacks from being
        // executed. Errors (if any) will be collected and `throw`n after processing the entire set
        try {
          await callback(deletedPackagePolicies, soClient, esClient, context, request);
        } catch (error) {
          logger.debug(
            () =>
              `The following external callback threw error:\n${error.message}\n${
                error.stack
              }\nFirst 1k characters of callback:\n${callback.toString().substring(0, 1000)}`
          );
          errorsThrown.push(error);
        }
      }

      if (errorsThrown.length > 0) {
        throw new FleetError(
          `${errorsThrown.length} errors encountered while executing package post delete external callbacks`,
          errorsThrown
        );
      }
    }

    logger.debug(`Running of external callbacks done`);
  }

  public async runDeleteExternalCallbacks(
    deletedPackagePolices: DeletePackagePoliciesResponse,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient
  ): Promise<void> {
    const logger = this.getLogger('runDeleteExternalCallbacks');
    const externalCallbacks = appContextService.getExternalCallbacks('packagePolicyDelete');
    const errorsThrown: Error[] = [];

    logger.debug(`Running [${externalCallbacks?.size}] external callbacks`);

    if (externalCallbacks && externalCallbacks.size > 0) {
      for (const callback of externalCallbacks) {
        // Failures from an external callback should not prevent other external callbacks from being
        // executed. Errors (if any) will be collected and `throw`n after processing the entire set
        try {
          await callback(deletedPackagePolices, soClient, esClient);
        } catch (error) {
          logger.debug(
            () =>
              `The following external callback threw error:\n${error.message}\n${
                error.stack
              }\nFirst 1k characters of callback:\n${callback.toString().substring(0, 1000)}`
          );
          errorsThrown.push(error);
        }
      }

      if (errorsThrown.length > 0) {
        throw new FleetError(
          `${errorsThrown.length} errors encountered while executing package delete external callbacks`,
          errorsThrown
        );
      }
    }

    logger.debug(`Running of package policy delete external callbacks done`);
  }

  public async removeOutputFromAll(
    esClient: ElasticsearchClient,
    outputId: string,
    options?: { force?: boolean }
  ) {
    const savedObjectType = await getPackagePolicySavedObjectType();
    const packagePolicies = (
      await appContextService
        .getInternalUserSOClientWithoutSpaceExtension()
        .find<PackagePolicySOAttributes>({
          type: savedObjectType,
          fields: ['name', 'enabled', 'policy_ids', 'inputs', 'output_id'],
          searchFields: ['output_id'],
          search: escapeSearchQueryPhrase(outputId),
          perPage: SO_SEARCH_LIMIT,
          namespaces: ['*'],
        })
    ).saved_objects.map((so) => mapPackagePolicySavedObjectToPackagePolicy(so));

    if (packagePolicies.length > 0) {
      const getPackagePolicyUpdate = (packagePolicy: PackagePolicy) => ({
        name: packagePolicy.name,
        enabled: packagePolicy.enabled,
        policy_ids: packagePolicy.policy_ids,
        inputs: packagePolicy.inputs,
        output_id: packagePolicy.output_id === outputId ? null : packagePolicy.output_id,
        package: packagePolicy.package,
      });

      // Validate that the new cleared/default output is valid for the package policies
      // (from each of the associated agent policies) before updating any of them
      await pMap(
        packagePolicies,
        async (packagePolicy) => {
          const soClient = appContextService.getInternalUserSOClientForSpaceId(
            getSpaceForPackagePolicy(packagePolicy)
          );
          const existingPackagePolicy = await this.get(soClient, packagePolicy.id);

          if (!existingPackagePolicy) {
            throw new PackagePolicyNotFoundError('Package policy not found');
          }

          for (const policyId of packagePolicy.policy_ids) {
            if (packagePolicy.package?.name) {
              const agentPolicy = await agentPolicyService.get(soClient, policyId, true);
              if (agentPolicy) {
                await validateAgentPolicyOutputForIntegration(
                  soClient,
                  agentPolicy,
                  packagePolicy,
                  packagePolicy.package.name,
                  false
                );
              }
            }
          }
        },
        {
          concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS,
        }
      );
      await pMap(
        packagePolicies,
        (packagePolicy) => {
          const soClient = appContextService.getInternalUserSOClientForSpaceId(
            getSpaceForPackagePolicy(packagePolicy)
          );
          return this.update(
            soClient,
            esClient,
            packagePolicy.id,
            getPackagePolicyUpdate(packagePolicy),
            {
              force: options?.force,
            }
          );
        },
        {
          concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS,
        }
      );
    }
  }

  async fetchAllItemIds(
    soClient: SavedObjectsClientContract,
    { perPage = 1000, kuery, spaceIds }: PackagePolicyClientFetchAllItemIdsOptions = {}
  ): Promise<AsyncIterable<string[]>> {
    const logger = this.getLogger('fetchAllItemIds');
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();
    const namespaces = isSpacesEnabled ? spaceIds : undefined;

    logger.debug(
      () =>
        `fetching all items ids using soClient scoped to [${soClient.getCurrentNamespace()}] and kuery [${kuery}] and spaceIds [${spaceIds?.join(
          ', '
        )}]`
    );

    const filter = _normalizePackagePolicyKuery(
      savedObjectType,
      buildCurrentRevisionFilter(savedObjectType, kuery)
    );

    return createSoFindIterable<{}>({
      soClient,
      findRequest: {
        type: savedObjectType,
        perPage,
        sortField: 'created_at',
        sortOrder: 'asc',
        fields: [],
        filter,
        namespaces,
      },
      resultsMapper: (data) => {
        return data.saved_objects.map((packagePolicySO) => packagePolicySO.id);
      },
    });
  }

  async fetchAllItems(
    soClient: SavedObjectsClientContract,
    options: PackagePolicyClientFetchAllItemsOptions = {}
  ): Promise<AsyncIterable<PackagePolicy[]>> {
    const logger = this.getLogger('fetchAllItems');

    logger.debug(
      () =>
        `Fetching all items using soClient scoped to [${soClient.getCurrentNamespace()}] and options: ${JSON.stringify(
          options
        )}`
    );

    const {
      perPage = 1000,
      kuery,
      sortOrder = 'asc',
      sortField = 'created_at',
      spaceIds,
    } = options;
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();
    const namespaces = isSpacesEnabled ? spaceIds : undefined;

    const filter = _normalizePackagePolicyKuery(
      savedObjectType,
      buildCurrentRevisionFilter(savedObjectType, kuery)
    );

    return createSoFindIterable<PackagePolicySOAttributes>({
      soClient,
      findRequest: {
        type: savedObjectType,
        sortField,
        sortOrder,
        perPage,
        filter,
        namespaces,
      },
      resultsMapper(data) {
        return data.saved_objects.map((packagePolicySO) => {
          auditLoggingService.writeCustomSoAuditLog({
            action: 'find',
            id: packagePolicySO.id,
            name: packagePolicySO.attributes.name,
            savedObjectType,
          });

          return mapPackagePolicySavedObjectToPackagePolicy(packagePolicySO);
        });
      },
    });
  }

  public async getPackagePolicySavedObjects(
    soClient: SavedObjectsClientContract,
    options: PackagePolicyClientRollbackOptions = {}
  ): Promise<SavedObjectsFindResponse<PackagePolicySOAttributes, unknown>> {
    const { perPage = SO_SEARCH_LIMIT, spaceIds } = options;
    const savedObjectType = await getPackagePolicySavedObjectType();
    const isSpacesEnabled = await isSpaceAwarenessEnabled();
    const namespaces = isSpacesEnabled ? spaceIds : undefined;

    const packagePolicies = await soClient
      .find<PackagePolicySOAttributes>({
        ...(options || {}),
        type: savedObjectType,
        perPage,
        namespaces,
      })
      .catch(catchAndSetErrorStackTrace.withMessage('failed to find package policies'));

    for (const packagePolicy of packagePolicies?.saved_objects ?? []) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'find',
        id: packagePolicy.id,
        name: packagePolicy.attributes.name,
        savedObjectType,
      });
    }

    return packagePolicies;
  }

  public async rollback(
    soClient: SavedObjectsClientContract,
    packagePolicies: Array<SavedObjectsFindResult<PackagePolicySOAttributes>>,
    previousVersion: string
  ): Promise<RollbackResult> {
    const savedObjectType = await getPackagePolicySavedObjectType();

    // Need to break down policies by namespace for bulk operations.
    // Create temporary SOs with id `id:copy` to allow cancellation in case rollback fails.
    const policiesToCreate: Record<
      string,
      Array<SavedObjectsFindResult<PackagePolicySOAttributes> & { initialNamespaces?: string[] }>
    > = {};
    const policiesToUpdate: Record<
      string,
      Array<SavedObjectsFindResult<PackagePolicySOAttributes>>
    > = {};
    const previousVersionPolicies: Record<
      string,
      Array<SavedObjectsFindResult<PackagePolicySOAttributes>>
    > = {};

    packagePolicies.forEach((policy) => {
      const namespace = getSpaceForPackagePolicySO(policy);

      if (
        !policy.id.endsWith(':prev') &&
        policy.attributes.package?.version &&
        semverGt(policy.attributes.package.version, previousVersion)
      ) {
        const previousRevision = packagePolicies.find((p) => p.id === `${policy.id}:prev`);
        if (previousRevision?.attributes) {
          if (!policiesToCreate[namespace]) {
            policiesToCreate[namespace] = [];
          }
          policiesToCreate[namespace].push({
            ...policy,
            id: `${policy.id}:copy`,
            initialNamespaces: policy.namespaces,
          });
          if (!policiesToUpdate[namespace]) {
            policiesToUpdate[namespace] = [];
          }
          policiesToUpdate[namespace].push({
            ...policy,
            attributes: {
              ...previousRevision?.attributes,
              inputs_for_versions: previousRevision?.attributes.inputs_for_versions ?? {},
              revision: (policy?.attributes.revision ?? 0) + 1, // Bump revision
              latest_revision: true,
            },
          });
        }
      } else if (policy.id.endsWith(':prev')) {
        if (!previousVersionPolicies[namespace]) {
          previousVersionPolicies[namespace] = [];
        }
        previousVersionPolicies[namespace].push(policy);
      }
    });

    // Create temporary saved objects.
    for (const [namespace, policies] of Object.entries(policiesToCreate)) {
      await soClient
        .bulkCreate<PackagePolicySOAttributes>(policies, { namespace })
        .catch(catchAndSetErrorStackTrace.withMessage('failed to bulk create package policies'));

      for (const policy of policies) {
        auditLoggingService.writeCustomSoAuditLog({
          action: 'create',
          id: policy.id,
          savedObjectType,
        });
      }
    }

    // Update policies with previous revision data.
    for (const [namespace, policies] of Object.entries(policiesToUpdate)) {
      await soClient
        .bulkUpdate<PackagePolicySOAttributes>(policies, { namespace })
        .catch(catchAndSetErrorStackTrace.withMessage(`Saved objects bulk update failed`));
      for (const policy of policies) {
        auditLoggingService.writeCustomSoAuditLog({
          action: 'update',
          id: policy.id,
          savedObjectType,
        });
      }
    }

    return {
      updatedPolicies: policiesToUpdate,
      copiedPolicies: policiesToCreate,
      previousVersionPolicies,
    };
  }

  public async restoreRollback(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ) {
    const savedObjectType = await getPackagePolicySavedObjectType();
    const { copiedPolicies } = rollbackResult;

    for (const [namespace, policies] of Object.entries(copiedPolicies)) {
      // Update policies with copied data.
      const policiesToUpdate = policies.map((policy) => ({
        ...omit(policy, 'initialNamespaces'),
        id: policy.id.replace(':copy', ''),
      }));
      await soClient
        .bulkUpdate<PackagePolicySOAttributes>(policiesToUpdate, { namespace })
        .catch(catchAndSetErrorStackTrace.withMessage(`Saved objects bulk update failed`));
      for (const policy of policies) {
        auditLoggingService.writeCustomSoAuditLog({
          action: 'update',
          id: policy.id.replace(':copy', ''),
          savedObjectType,
        });
      }

      // Delete temporary saved objects.
      await this.deleteRollbackSavedObjects(soClient, namespace, policies);
    }
  }

  public async cleanupRollbackSavedObjects(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ) {
    const { copiedPolicies, previousVersionPolicies } = rollbackResult;
    // Delete temporary saved objects.
    for (const [namespace, policies] of Object.entries(copiedPolicies)) {
      await this.deleteRollbackSavedObjects(soClient, namespace, policies);
    }
    // Delete previous revisions saved objects.
    for (const [namespace, policies] of Object.entries(previousVersionPolicies)) {
      await this.deleteRollbackSavedObjects(soClient, namespace, policies);
    }
  }

  private async deleteRollbackSavedObjects(
    soClient: SavedObjectsClientContract,
    namespace: string,
    policies: Array<SavedObjectsFindResult<PackagePolicySOAttributes>>
  ) {
    const savedObjectType = await getPackagePolicySavedObjectType();
    const objects = policies.map((policy) => ({ id: policy.id, type: savedObjectType }));

    const { statuses } = await soClient
      .bulkDelete(objects, { force: true, namespace })
      .catch(
        catchAndSetErrorStackTrace.withMessage(
          `Bulk delete of package policies [${policies.map((p) => p.id).join(', ')}] failed`
        )
      );
    for (const policy of policies) {
      auditLoggingService.writeCustomSoAuditLog({
        action: 'delete',
        id: policy.id,
        savedObjectType,
      });
    }
    if (statuses.some((status) => !status.success)) {
      throw new PackageRollbackError(
        `Failed to delete some previous package policy revisions: ${statuses
          .filter((status) => !status.success)
          .map((status) => status.error?.message || 'Unknown error')
          .join(', ')}`
      );
    }
  }

  public async bumpAgentPolicyRevisionAfterRollback(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ) {
    const { updatedPolicies } = rollbackResult;
    for (const [namespace, policies] of Object.entries(updatedPolicies)) {
      const agentPolicyIds = policies.flatMap((policy) => policy.attributes.policy_ids || []);
      await agentPolicyService.bumpAgentPoliciesByIds(agentPolicyIds, {}, namespace);
    }
  }

  public async createCloudConnectorForPackagePolicy(
    soClient: SavedObjectsClientContract,
    enrichedPackagePolicy: NewPackagePolicy,
    agentPolicy: AgentPolicy,
    packageInfo: PackageInfo
  ): Promise<CloudConnector | undefined> {
    const logger = this.getLogger('createCloudConnectorForPackagePolicy');

    const cloudProvider = agentPolicy.agentless?.cloud_connectors?.target_csp as CloudProvider;
    const agentlessCloudConnectorsEnabled = agentPolicy.agentless?.cloud_connectors?.enabled;

    if (!agentlessCloudConnectorsEnabled) {
      logger.debug('No agentless cloud connectors enabled for cloud provider');
      return;
    }

    const cloudConnectorVars = extractPackagePolicyVars(
      cloudProvider,
      enrichedPackagePolicy,
      logger
    );

    if (cloudConnectorVars && enrichedPackagePolicy?.supports_cloud_connector) {
      if (enrichedPackagePolicy?.cloud_connector_id) {
        // Update the existing cloud connector with new vars
        logger.info(`Updating cloud connector: ${enrichedPackagePolicy.cloud_connector_id}`);
        try {
          const cloudConnector = await cloudConnectorService.update(
            soClient,
            enrichedPackagePolicy.cloud_connector_id,
            {
              vars: cloudConnectorVars,
            }
          );
          logger.info(`Successfully updated cloud connector: ${cloudConnector.id}`);
          return cloudConnector;
        } catch (e) {
          logger.error(`Error updating cloud connector: ${e}`);
          throw new CloudConnectorUpdateError(`${e}`);
        }
      } else {
        logger.info(`Creating cloud connector: ${enrichedPackagePolicy.cloud_connector_id}`);
        // Extract account type from package policy vars
        const accountType = extractAccountType(cloudProvider, enrichedPackagePolicy, packageInfo);
        try {
          // Extract cloud connector name from package policy
          const cloudConnectorName = enrichedPackagePolicy.cloud_connector_name;

          const cloudConnector = await cloudConnectorService.create(soClient, {
            name:
              cloudConnectorName ||
              `${cloudProvider}-cloud-connector: ${enrichedPackagePolicy.name}`,
            vars: cloudConnectorVars,
            cloudProvider,
            accountType,
          });
          logger.info(`Successfully created cloud connector: ${cloudConnector.id}`);
          return cloudConnector;
        } catch (error) {
          logger.error(`Error creating cloud connector: ${error}`);
          rethrowIfInstanceOrWrap(error, CloudConnectorCreateError);
        }
      }
    }
  }
}

export class PackagePolicyServiceImpl
  extends PackagePolicyClientImpl
  implements PackagePolicyService
{
  public asScoped(request: KibanaRequest): PackagePolicyClient {
    const preflightCheck = async ({ fleetAuthz: fleetRequiredAuthz }: FleetAuthzRouteConfig) => {
      const authz = await getAuthzFromRequest(request);

      if (doesNotHaveRequiredFleetAuthz(authz, fleetRequiredAuthz)) {
        throw new FleetUnauthorizedError('Not authorized to this action on integration policies');
      }

      if ((await isSpaceAwarenessMigrationPending()) === true) {
        throw new FleetError('Migration to space awareness is pending');
      }
    };

    return new PackagePolicyClientWithAuthz(preflightCheck);
  }

  public get asInternalUser() {
    const preflightCheck = async () => {
      if ((await isSpaceAwarenessMigrationPending()) === true) {
        throw new FleetError('Migration to space awareness is pending');
      }
    };
    return new PackagePolicyClientWithAuthz(preflightCheck);
  }
}

class PackagePolicyClientWithAuthz extends PackagePolicyClientImpl {
  constructor(
    private readonly preflightCheck?: (
      fleetAuthzConfig: FleetAuthzRouteConfig
    ) => void | Promise<void>
  ) {
    super();
  }

  #runPreflight = async (fleetAuthzConfig: FleetAuthzRouteConfig) => {
    if (this.preflightCheck) {
      return await this.preflightCheck(fleetAuthzConfig);
    }
  };

  async bulkCreate(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicies: NewPackagePolicyWithId[],
    options?:
      | {
          user?: AuthenticatedUser | undefined;
          bumpRevision?: boolean | undefined;
          force?: true | undefined;
          asyncDeploy?: boolean;
        }
      | undefined
  ): Promise<{
    created: PackagePolicy[];
    failed: Array<{ packagePolicy: NewPackagePolicy; error?: Error | SavedObjectError }>;
  }> {
    await this.#runPreflight({
      fleetAuthz: {
        integrations: { writeIntegrationPolicies: true },
      },
    });
    return super.bulkCreate(soClient, esClient, packagePolicies, options);
  }

  async update(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    packagePolicyUpdate: UpdatePackagePolicy,
    options?:
      | {
          user?: AuthenticatedUser | undefined;
          force?: boolean | undefined;
          skipUniqueNameVerification?: boolean | undefined;
        }
      | undefined
  ): Promise<PackagePolicy> {
    await this.#runPreflight({
      fleetAuthz: {
        integrations: { writeIntegrationPolicies: true },
      },
    });

    return super.update(soClient, esClient, id, packagePolicyUpdate, options);
  }

  async create(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicy: NewPackagePolicy,
    options?: {
      spaceId?: string;
      id?: string;
      user?: AuthenticatedUser;
      bumpRevision?: boolean;
      force?: boolean;
      skipEnsureInstalled?: boolean;
      skipUniqueNameVerification?: boolean;
      overwrite?: boolean;
      packageInfo?: PackageInfo;
      createDatasetTemplates?: boolean;
    },
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<PackagePolicy> {
    await this.#runPreflight({
      fleetAuthz: {
        integrations: { writeIntegrationPolicies: true },
      },
    });

    // Add debug logging
    const logger = appContextService.getLogger();
    logger.debug(
      `PackagePolicyService.create called with supports_agentless: ${packagePolicy.supports_agentless}`
    );

    return super.create(soClient, esClient, packagePolicy, options, context, request);
  }
}

function validateConditionPlacement(packagePolicy: NewPackagePolicy) {
  const isAgentless = packagePolicy.supports_agentless === true;
  const throwAgentless = () => {
    throw new PackagePolicyValidationError(
      i18n.translate('xpack.fleet.packagePolicyConditionNotAllowedAgentless', {
        defaultMessage: '`condition` is not supported on agentless package policies.',
      })
    );
  };
  const throwOtel = () => {
    throw new PackagePolicyValidationError(
      i18n.translate('xpack.fleet.packagePolicyConditionNotAllowedOtel', {
        defaultMessage: '`condition` is not supported on `{otelcol}` inputs or their streams.',
        values: { otelcol: OTEL_COLLECTOR_INPUT_TYPE },
      })
    );
  };

  if (packagePolicy.condition) {
    if (isAgentless) throwAgentless();
  }

  for (const input of packagePolicy.inputs) {
    const isOtel = input.type === OTEL_COLLECTOR_INPUT_TYPE;
    if (input.condition) {
      if (isAgentless) throwAgentless();
      if (isOtel) throwOtel();
    }
    for (const stream of input.streams) {
      if (!stream.condition) continue;
      if (isAgentless) throwAgentless();
      if (isOtel) throwOtel();
    }
  }
}

function validatePackagePolicyOrThrow(packagePolicy: NewPackagePolicy, pkgInfo: PackageInfo) {
  validateConditionPlacement(packagePolicy);
  const validationResults = validatePackagePolicy(packagePolicy, pkgInfo, {
    safeLoadYaml: parse,
    conditionValidator: validateAgentConditionExpression,
  });
  if (validationHasErrors(validationResults)) {
    const responseFormattedValidationErrors = Object.entries(getFlattenedObject(validationResults))
      .map(([key, value]) => {
        try {
          const message = !!value ? JSON.stringify(value) : value;
          return { key, message };
        } catch (e) {
          return {
            key,
            message: value,
          };
        }
      })
      .filter(({ message }) => !!message);

    if (responseFormattedValidationErrors.length) {
      throw new PackagePolicyValidationError(
        i18n.translate('xpack.fleet.packagePolicyInvalidError', {
          defaultMessage: 'Package policy is invalid: {errors}',
          values: {
            errors: responseFormattedValidationErrors
              .map(({ key, message }) => `${key}: ${message}`)
              .join('\n'),
          },
        })
      );
    }
  }

  if (
    pkgInfo.policy_templates_behavior === 'individual_policies' &&
    hasMultipleEnabledPolicyTemplates(packagePolicy)
  ) {
    throw new FleetError(
      `Unable to create integration policy. Package '${pkgInfo.name}' with individual policy templates cannot have enabled inputs from multiple policy templates.`
    );
  }
}

export function _compilePackagePolicyInputs(
  pkgInfo: PackageInfo,
  vars: PackagePolicy['vars'],
  inputs: PackagePolicyInput[],
  assetsMap: PackagePolicyAssetsMap,
  agentVersion?: string
): PackagePolicyInput[] {
  return inputs
    .filter((input) => !agentVersion || input.enabled)
    .map((input) => {
      if (agentVersion) {
        const hasVersionConditionInInputTemplate =
          hasAgentVersionConditionInInputTemplate(assetsMap);
        // skip recompile input if there is no agent version condition in any of the templates
        if (!hasVersionConditionInInputTemplate) {
          return input;
        }
      }
      const span = apm.startSpan(
        `_compilePackagePolicyInputs ${pkgInfo.name}-${pkgInfo.version} ${agentVersion}`,
        'full-agent-policy'
      );
      const compiledInput = _compilePackagePolicyInput(
        pkgInfo,
        vars,
        input,
        assetsMap,
        agentVersion
      );
      const compiledStreams = _compilePackageStreams(pkgInfo, vars, input, assetsMap, agentVersion);
      span?.end();
      return {
        ...input,
        compiled_input: compiledInput,
        streams: compiledStreams,
      };
    });
}

function _compileAndMergeTemplatePaths(
  templates: string[],
  templateVars: PackagePolicyConfigRecord,
  metaVars: MetaVariable
): Record<string, any> {
  let compiled: Record<string, any> = {};
  for (const templateStr of templates) {
    const result = compileTemplate(templateVars, metaVars, templateStr);
    compiled = mergeCompiledTemplates(compiled, result);
  }
  return compiled;
}

function _compilePackagePolicyInput(
  pkgInfo: PackageInfo,
  vars: PackagePolicy['vars'],
  input: PackagePolicyInput,
  assetsMap: PackagePolicyAssetsMap,
  agentVersion?: string
) {
  const packagePolicyTemplate = input.policy_template
    ? pkgInfo.policy_templates?.find(
        (policyTemplate) => policyTemplate.name === input.policy_template
      )
    : pkgInfo.policy_templates?.[0];

  if (!input.enabled || !packagePolicyTemplate) {
    return undefined;
  }

  const packageInputs = getNormalizedInputs(packagePolicyTemplate);

  if (!packageInputs.length) {
    return undefined;
  }

  const packageInput = packageInputs.find((pkgInput) => pkgInput.type === input.type);
  if (!packageInput) {
    throw new InputNotFoundError(
      `Input template not found, unable to find input type ${input.type}`
    );
  }

  const templateVars = Object.assign({}, vars, input.vars);
  const metaVars = getMetaVariables(pkgInfo, input, undefined, agentVersion);

  if (packageInput.template_paths?.length) {
    const templates = packageInput.template_paths.map((tp) => {
      const [asset] = getAssetsDataFromAssetsMap(pkgInfo, assetsMap, (path: string) =>
        path.endsWith(`/agent/input/${tp}`)
      );
      if (!asset || !asset.buffer) {
        throw new InputNotFoundError(`Unable to load input template at /agent/input/${tp}`);
      }
      return asset.buffer.toString();
    });
    return _compileAndMergeTemplatePaths(templates, templateVars, metaVars);
  }

  if (!packageInput.template_path) {
    return undefined;
  }

  const [pkgInputTemplate] = getAssetsDataFromAssetsMap(pkgInfo, assetsMap, (path: string) =>
    path.endsWith(`/agent/input/${packageInput.template_path!}`)
  );

  if (!pkgInputTemplate || !pkgInputTemplate.buffer) {
    throw new InputNotFoundError(
      `Unable to load input template at /agent/input/${packageInput.template_path!}`
    );
  }

  return compileTemplate(
    // Populate template variables from package- and input-level vars
    templateVars,
    metaVars,
    pkgInputTemplate.buffer.toString()
  );
}

function _compilePackageStreams(
  pkgInfo: PackageInfo,
  vars: PackagePolicy['vars'],
  input: PackagePolicyInput,
  assetsMap: PackagePolicyAssetsMap,
  agentVersion?: string
) {
  return input.streams.map((stream) =>
    _compilePackageStream(pkgInfo, vars, input, stream, assetsMap, agentVersion)
  );
}

// temporary export to enable testing pending refactor https://github.com/elastic/kibana/issues/112386
// TODO: Move this logic into `package_policies_to_agent_permissions.ts` since this is not a package policy concern
// and is based entirely on the package contents
export function _applyIndexPrivileges(
  packageDataStream: RegistryDataStream,
  stream: PackagePolicyInputStream
): PackagePolicyInputStream {
  const streamOut = cloneDeep(stream);

  if (packageDataStream?.elasticsearch?.dynamic_dataset) {
    streamOut.data_stream.elasticsearch = streamOut.data_stream.elasticsearch ?? {};
    streamOut.data_stream.elasticsearch.dynamic_dataset =
      packageDataStream.elasticsearch.dynamic_dataset;
  }
  if (packageDataStream?.elasticsearch?.dynamic_namespace) {
    streamOut.data_stream.elasticsearch = streamOut.data_stream.elasticsearch ?? {};
    streamOut.data_stream.elasticsearch.dynamic_namespace =
      packageDataStream.elasticsearch.dynamic_namespace;
  }

  const indexPrivileges = packageDataStream?.elasticsearch?.privileges?.indices;

  if (!indexPrivileges?.length) {
    return streamOut;
  }

  const isServerless = appContextService.getCloud()?.isServerlessEnabled;
  const DATA_STREAM_ALLOWED_INDEX_PRIVILEGES = new Set([
    'auto_configure',
    'create_doc',
    'maintenance',
    'monitor',
    'read',
    ...(isServerless ? [] : ['read_cross_cluster']),
  ]);
  const [valid, invalid] = partition(indexPrivileges, (permission) =>
    DATA_STREAM_ALLOWED_INDEX_PRIVILEGES.has(permission)
  );

  if (invalid.length) {
    appContextService
      .getLogger()
      .warn(
        `Ignoring invalid or forbidden index privilege(s) in "${stream.id}" data stream: ${invalid}`
      );
  }

  if (valid.length) {
    streamOut.data_stream.elasticsearch = streamOut.data_stream.elasticsearch ?? {};
    streamOut.data_stream.elasticsearch.privileges = {
      indices: valid,
    };
  }

  return streamOut;
}

export function _getAssetForTemplatePath(
  pkgInfo: PackageInfo,
  assetsMap: AssetsMap,
  datasetPath: string,
  templatePath: string
): ArchiveEntry {
  const assets = getAssetsDataFromAssetsMap(
    pkgInfo,
    assetsMap,
    (path: string) => path.endsWith(`/agent/stream/${templatePath}`),
    datasetPath
  );
  if (assets.length === 1) {
    return assets[0];
  }

  // fallback to old path structure for backward compatibility
  const [fallbackPkgStreamTemplate] = getAssetsDataFromAssetsMap(
    pkgInfo,
    assetsMap,
    (path: string) => path.endsWith(templatePath),
    datasetPath
  );
  return fallbackPkgStreamTemplate;
}

function _compilePackageStream(
  pkgInfo: PackageInfo,
  vars: PackagePolicy['vars'],
  input: PackagePolicyInput,
  streamIn: PackagePolicyInputStream,
  assetsMap: PackagePolicyAssetsMap,
  agentVersion?: string
) {
  let stream = streamIn;

  if (!stream.enabled) {
    return { ...stream, compiled_stream: undefined };
  }

  const packageDataStreams = getNormalizedDataStreams(pkgInfo);
  if (!packageDataStreams) {
    throw new StreamNotFoundError('Stream template not found, no data streams');
  }

  const packageDataStream = packageDataStreams.find(
    (pkgDataStream) => pkgDataStream.dataset === stream.data_stream.dataset
  );

  if (!packageDataStream) {
    throw new StreamNotFoundError(
      `Stream template not found, unable to find dataset ${stream.data_stream.dataset}`
    );
  }

  stream = _applyIndexPrivileges(packageDataStream, streamIn);

  const effectiveInputName = getInputEffectiveName(input);
  const streamFromPkg = (packageDataStream.streams || []).find(
    (pkgStream) => pkgStream.input === effectiveInputName
  );
  if (!streamFromPkg) {
    throw new StreamNotFoundError(
      `Stream template not found, unable to find stream for input ${effectiveInputName} (type: ${input.type})`
    );
  }

  const datasetPath = packageDataStream.path;
  const templateVars = Object.assign({}, vars, input.vars, stream.vars);
  const metaVars = getMetaVariables(pkgInfo, input, streamIn, agentVersion);

  if (streamFromPkg.template_paths?.length) {
    const templates = streamFromPkg.template_paths.map((tp) => {
      const asset = _getAssetForTemplatePath(pkgInfo, assetsMap, datasetPath, tp);
      if (!asset || !asset.buffer) {
        throw new StreamNotFoundError(
          `Unable to load stream template ${tp} for dataset ${stream.data_stream.dataset}`
        );
      }
      return asset.buffer.toString();
    });
    stream.compiled_stream = _compileAndMergeTemplatePaths(templates, templateVars, metaVars);
    return { ...stream };
  }

  if (!streamFromPkg.template_path) {
    throw new StreamNotFoundError(
      `Neither template_path nor template_paths found for dataset ${stream.data_stream.dataset}`
    );
  }

  const pkgStreamTemplate = _getAssetForTemplatePath(
    pkgInfo,
    assetsMap,
    datasetPath,
    streamFromPkg.template_path
  );

  if (!pkgStreamTemplate || !pkgStreamTemplate.buffer) {
    throw new StreamNotFoundError(
      `Unable to load stream template ${streamFromPkg.template_path} for dataset ${stream.data_stream.dataset}`
    );
  }

  const yaml = compileTemplate(
    // Populate template variables from package-, input-, and stream-level vars
    templateVars,
    metaVars,
    pkgStreamTemplate.buffer.toString()
  );

  stream.compiled_stream = yaml;

  return { ...stream };
}

function enforceFrozenInputs(
  oldInputs: PackagePolicyInput[],
  newInputs: PackagePolicyInput[],
  force = false
) {
  const resultInputs = [...newInputs];

  for (const input of resultInputs) {
    const oldInput = oldInputs.find(
      (i) => getInputEffectiveName(i) === getInputEffectiveName(input)
    );
    if (oldInput?.keep_enabled) input.enabled = oldInput.enabled;
    if (input.vars && oldInput?.vars) {
      input.vars = _enforceFrozenVars(oldInput.vars, input.vars, force);
    }
    if (input.streams && oldInput?.streams) {
      for (const stream of input.streams) {
        const oldStream = oldInput.streams.find((s) => s.id === stream.id);
        if (oldStream?.keep_enabled) stream.enabled = oldStream.enabled;
        if (stream.vars && oldStream?.vars) {
          stream.vars = _enforceFrozenVars(oldStream.vars, stream.vars, force);
        }
      }
    }
  }

  return resultInputs;
}

function _enforceFrozenVars(
  oldVars: Record<string, PackagePolicyConfigRecordEntry>,
  newVars: Record<string, PackagePolicyConfigRecordEntry>,
  force = false
) {
  const resultVars: Record<string, PackagePolicyConfigRecordEntry> = {};
  for (const [key, val] of Object.entries(newVars)) {
    if (oldVars[key]?.frozen) {
      if (force) {
        resultVars[key] = val;
      } else if (!isEqual(oldVars[key].value, val.value) || oldVars[key].type !== val.type) {
        throw new PackagePolicyValidationError(
          `${key} is a frozen variable and cannot be modified`
        );
      } else {
        resultVars[key] = oldVars[key];
      }
    } else {
      resultVars[key] = val;
    }
  }
  for (const [key, val] of Object.entries(oldVars)) {
    if (!newVars[key] && val.frozen) {
      resultVars[key] = val;
    }
  }
  return resultVars;
}

export interface NewPackagePolicyWithId extends NewPackagePolicy {
  id?: string;
  policy_id?: string | null;
  version?: string;
}

export const packagePolicyService: PackagePolicyClient = new PackagePolicyClientImpl();

async function getPackageInfoForPackagePolicies(
  packagePolicies: NewPackagePolicyWithId[],
  soClient: SavedObjectsClientContract,
  ignoreMissing?: boolean
) {
  const pkgInfoMap = new Map<string, { name: string; version: string }>();

  packagePolicies.forEach(({ package: pkg }) => {
    if (pkg) {
      pkgInfoMap.set(`${pkg.name}-${pkg.version}`, pkg);
    }
  });

  const resultMap = new Map<string, PackageInfo>();

  await pMap(pkgInfoMap.keys(), async (pkgKey) => {
    const pkgInfo = pkgInfoMap.get(pkgKey);
    if (pkgInfo) {
      try {
        const pkgInfoData = await getPackageInfo({
          savedObjectsClient: soClient,
          pkgName: pkgInfo.name,
          pkgVersion: pkgInfo.version,
          prerelease: true,
        });

        resultMap.set(pkgKey, pkgInfoData);
      } catch (error) {
        if (!ignoreMissing) {
          throw error;
        }
      }
    }
  });

  return resultMap;
}

export function updatePackageInputs(
  basePackagePolicy: NewPackagePolicy,
  packageInfo: PackageInfo,
  inputsUpdated?: InputsOverride[],
  dryRun?: boolean
): DryRunPackagePolicy {
  if (!inputsUpdated) return basePackagePolicy;

  const availablePolicyTemplates = packageInfo.policy_templates ?? [];
  const limitedPackage = isPackageLimited(packageInfo);

  const inputs = [
    ...basePackagePolicy.inputs.filter((input) => {
      if (!input.policy_template) {
        return true;
      }

      const policyTemplate = availablePolicyTemplates.find(
        ({ name }) => name === input.policy_template
      );

      // Ignore any policy templates removed in the new package version
      if (!policyTemplate) {
        return false;
      }

      // Ignore any inputs removed from this policy template in the new package version.
      // Match by id ?? type on both sides so that inputs with explicit ids are correctly
      // retained or pruned when the new package version changes its input list.
      const policyInputEffectiveId = getInputEffectiveName(input);
      const policyTemplateStillIncludesInput = isInputOnlyPolicyTemplate(policyTemplate)
        ? policyTemplate.input === input.type
        : policyTemplate.inputs?.some(
            (policyTemplateInput) =>
              getInputEffectiveName(policyTemplateInput) === policyInputEffectiveId
          ) ?? false;
      return policyTemplateStillIncludesInput;
    }),
  ];

  for (const update of inputsUpdated) {
    let originalInput: NewPackagePolicyInput | undefined;

    // Pre-compute registry definitions for this input type so var-level migrate_from renaming
    // can be applied in both Path A and Path B migration calls below.
    const updateType = (update as NewPackagePolicyInput).type;
    const registryStreams = updateType
      ? getRegistryStreamWithDataStreamForInputType(updateType, packageInfo)
      : undefined;
    const registryInputVarDefs = updateType
      ? (update.policy_template
          ? packageInfo.policy_templates?.filter((pt) => pt.name === update.policy_template)
          : packageInfo.policy_templates
        )
          ?.flatMap((pt) => getNormalizedInputs(pt))
          .find(
            (ri) =>
              getInputEffectiveName(ri) === getInputEffectiveName(update as NewPackagePolicyInput)
          )?.vars
      : undefined;

    if (update.policy_template) {
      // If the updated value defines a policy template, try to find an original input
      // with the same policy template value. Match by name ?? type on both sides
      // so that inputs with explicit ids are correctly matched during upgrade.
      const updateEffectiveId = getInputEffectiveName(update as NewPackagePolicyInput);
      const matchingInput = inputs.find(
        (i) =>
          getInputEffectiveName(i) === updateEffectiveId &&
          i.policy_template === update.policy_template
      );

      // If we didn't find an input with the same policy template, try to look for one
      // with the same effective id, but with an undefined policy template. This ensures
      // we catch cases where we're upgrading an older policy from before policy template
      // was reliably defined on package policy inputs.
      originalInput =
        matchingInput ||
        inputs.find((i) => getInputEffectiveName(i) === updateEffectiveId && !i.policy_template);
    } else {
      // For inputs that don't specify a policy template, just grab the first input
      // that matches its effective id
      originalInput = inputs.find(
        (i) => getInputEffectiveName(i) === getInputEffectiveName(update as NewPackagePolicyInput)
      );
    }

    // If there's no corresponding input on the original package policy, just
    // take the override value from the new package as-is. This case typically
    // occurs when inputs or package policy templates are added/removed between versions.
    if (originalInput === undefined) {
      const originalInputToMigrate = applyInputLevelMigration(
        update,
        basePackagePolicy.inputs,
        inputs,
        registryInputVarDefs
      );
      applyStreamLevelMigration(
        update,
        originalInputToMigrate,
        basePackagePolicy.inputs,
        registryStreams
      );

      // Do not enable new inputs for limited packages
      if (limitedPackage) {
        update.enabled = false;
      }
      inputs.push(update as NewPackagePolicyInput);
      continue;
    }

    // For flags like this, we only want to override the original value if it was set
    // as `undefined` in the original object. An explicit true/false value should be
    // persisted from the original object to the result after the override process is complete.
    if (!limitedPackage && originalInput.enabled === undefined && update.enabled !== undefined) {
      originalInput.enabled = update.enabled;
    }

    if (originalInput.keep_enabled === undefined && update.keep_enabled !== undefined) {
      originalInput.keep_enabled = update.keep_enabled;
    }

    // `policy_template` should always be defined, so if we have an older policy here we need
    // to ensure we set it
    if (originalInput.policy_template === undefined && update.policy_template !== undefined) {
      originalInput.policy_template = update.policy_template;
    }

    // `deprecated` and `migrate_from` are package schema fields, not user-configured state.
    // They must be unconditionally synced from the new package definition so they are cleared
    // when the new package version no longer declares them.
    originalInput.deprecated = update.deprecated;
    originalInput.migrate_from = update.migrate_from;

    // Snapshot the stored input-level vars before deepMergeVars mutates them (it modifies the
    // vars object in place via a shared reference). Used later by the Path B stream migration
    // block to determine which vars the user actually configured on this input vs package defaults.
    const storedInputVars = originalInput.vars
      ? Object.fromEntries(Object.entries(originalInput.vars).map(([k, v]) => [k, { ...v }]))
      : undefined;

    // Var-level scope migration runs before any merge so that values can be seeded into the
    // new scope's source slot; deepMergeVars then carries them through and removeStaleVars
    // drops the old scope automatically (the var is no longer in the new schema there).
    applyVarScopeMigration(originalInput, registryInputVarDefs, registryStreams);

    if (update.vars || originalInput.vars) {
      const indexOfInput = inputs.indexOf(originalInput);
      const mergedVars = deepMergeVars(originalInput, update, true) as NewPackagePolicyInput;
      const filteredVars = removeStaleVars<NewPackagePolicyInput>(mergedVars, update);
      inputs[indexOfInput] = filteredVars;
      originalInput = inputs[indexOfInput];
    }

    if (update.streams) {
      const isInputPkgUpdate =
        packageInfo.type === 'input' &&
        update.streams.length === 1 &&
        originalInput?.streams.length === 1;
      // Per-source-type counters for positional stream matching when a stream declares
      // migrate_from. Shared across iterations so each source stream is consumed once.
      const streamMigrateFromCounters: Record<string, number> = {};
      // Track whether any stream successfully migrated from an old input type, and which
      // old input was the source. Used to carry enabled state and input-level vars over.
      let streamMigratedFromOldInput = false;
      let oldSourceInput: NewPackagePolicyInput | undefined;
      for (const stream of update.streams) {
        let originalStream = originalInput?.streams.find(
          (s) => s.data_stream.dataset === stream.data_stream.dataset
        );

        // this handles the input only pkg case where the new stream cannot have a dataset name
        // so will never match. Input only packages only ever have one stream.
        if (!originalStream && isInputPkgUpdate) {
          originalStream = {
            ...update.streams[0],
            id: originalInput?.streams[0]?.id,
            vars: originalInput?.streams[0].vars,
          };
        }

        if (originalStream === undefined) {
          // When a new stream declares migrate_from, carry vars and enabled state over from
          // the positionally-matched old stream instead of pushing with package defaults.
          // This handles partial-migration integrations where
          // the new input type already exists in the old policy alongside the old input type.
          if (stream.migrate_from) {
            const counter = streamMigrateFromCounters[stream.migrate_from] ?? 0;
            streamMigrateFromCounters[stream.migrate_from] = counter + 1;
            const oldInputForStream = findInputForMigration(
              basePackagePolicy.inputs,
              stream.migrate_from,
              update.policy_template
            );
            const oldStream = oldInputForStream?.streams[counter];
            if (oldStream) {
              const registryStream = registryStreams?.find(
                (rs) => rs.data_stream.dataset === stream.data_stream.dataset
              );
              originalInput.streams.push(
                migrateStreamVars(
                  stream as InputsOverride,
                  oldStream,
                  oldInputForStream?.vars,
                  registryStream?.vars
                )
              );
              streamMigratedFromOldInput = true;
              if (!oldSourceInput) oldSourceInput = oldInputForStream;
              continue;
            }
          }
          originalInput.streams.push(stream);
          continue;
        }

        if (originalStream?.enabled === undefined) {
          originalStream.enabled = stream.enabled;
        }

        // Sync migrate_from from the new package schema — package-owned field, not user-configured.
        originalStream.migrate_from = stream.migrate_from;

        if (stream.vars || originalStream.vars) {
          // streams wont match for input pkgs
          const indexOfStream = isInputPkgUpdate
            ? 0
            : originalInput.streams.indexOf(originalStream);
          const mergedVars = deepMergeVars(originalStream, stream as InputsOverride, true);
          const filteredVars = removeStaleVars(mergedVars, stream);
          originalInput.streams[indexOfStream] = filteredVars;
          originalStream = originalInput.streams[indexOfStream];
        }
      }
      // When stream-level migrate_from succeeded: mirror what applyStreamLevelMigration does
      // for Path A — carry the old source input's enabled state and input-level vars to the
      // existing input. This covers the partial-migration case where the new input (cel) already
      // existed in the old policy alongside the old input (httpjson), but was disabled and had
      // empty vars because the user only ever configured the httpjson side.
      if (streamMigratedFromOldInput && oldSourceInput) {
        const indexOfInput = inputs.indexOf(originalInput);
        let updatedInput = originalInput;

        if (!limitedPackage) {
          updatedInput = {
            ...updatedInput,
            enabled: oldSourceInput.enabled ?? updatedInput.enabled,
          };
        }

        if (oldSourceInput.vars && (update.vars || updatedInput.vars)) {
          const oldSourceVars = oldSourceInput.vars;
          const storedCelVars = storedInputVars ?? {};
          // Start with httpjson vars as the base — the migrate_from declaration signals that
          // httpjson is the authoritative source for these vars.
          const seededVars: typeof storedCelVars = { ...oldSourceVars };
          // Merge in the new input's own stored vars:
          // - For keys NOT in the old source: always keep the stored value (new-input-only var).
          // - For shared keys: keep the stored value when it was explicitly set by the user
          //   (non-null, non-empty). This handles the case where both the old and new inputs
          //   existed in the policy and the user had independently configured the new input
          //   (e.g. m365_defender CEL vulnerability credentials differ from httpjson alert creds).
          //   When the stored value is null/empty, the old source wins so its vars seed the new
          //   input for the common case where the new input was unconfigured before migration.
          for (const [key, celEntry] of Object.entries(storedCelVars)) {
            if (!(key in oldSourceVars) || (celEntry?.value != null && celEntry.value !== '')) {
              seededVars[key] = celEntry;
            }
          }
          const merged = deepMergeVars(
            { ...updatedInput, vars: seededVars },
            update,
            true
          ) as NewPackagePolicyInput;
          updatedInput = removeStaleVars<NewPackagePolicyInput>(merged, update);
        }

        inputs[indexOfInput] = updatedInput;
        originalInput = inputs[indexOfInput];
      }
    }
    // Filter all stream that have been removed from the input
    originalInput.streams = originalInput.streams.filter((originalStream) => {
      return (
        update.streams?.some((s) => s.data_stream.dataset === originalStream.data_stream.dataset) ??
        false
      );
    });
  }

  const vars = getUpdatedGlobalVars(packageInfo, basePackagePolicy);

  const resultingPackagePolicy: NewPackagePolicy = {
    ...basePackagePolicy,
    inputs,
    vars,
  };

  const validationResults = validatePackagePolicy(resultingPackagePolicy, packageInfo, {
    safeLoadYaml: parse,
    conditionValidator: validateAgentConditionExpression,
  });

  if (validationHasErrors(validationResults)) {
    const responseFormattedValidationErrors = Object.entries(getFlattenedObject(validationResults))
      .map(([key, value]) => {
        try {
          const message = !!value ? JSON.stringify(value) : value;
          return { key, message };
        } catch (e) {
          return {
            key,
            message: value,
          };
        }
      })
      .filter(({ message }) => !!message);

    if (responseFormattedValidationErrors.length) {
      if (dryRun) {
        return { ...resultingPackagePolicy, errors: responseFormattedValidationErrors };
      }

      throw new PackagePolicyValidationError(
        i18n.translate('xpack.fleet.packagePolicyInvalidError', {
          defaultMessage: 'Package policy is invalid: {errors}',
          values: {
            errors: responseFormattedValidationErrors
              .map(({ key, message }) => `${key}: ${message}`)
              .join('\n'),
          },
        })
      );
    }
  }

  return resultingPackagePolicy;
}

export function preconfigurePackageInputs(
  basePackagePolicy: NewPackagePolicy,
  packageInfo: PackageInfo,
  preconfiguredInputs?: PreconfiguredInputs[]
): NewPackagePolicy {
  if (!preconfiguredInputs) return basePackagePolicy;

  const inputs = [...basePackagePolicy.inputs];

  for (const preconfiguredInput of preconfiguredInputs) {
    // Preconfiguration does not currently support multiple policy templates, so overrides will have an undefined
    // policy template, so we only match on `type` in that case.
    const preconfiguredEffectiveId = getInputEffectiveName(preconfiguredInput);
    let originalInput = preconfiguredInput.policy_template
      ? inputs.find(
          (i) =>
            getInputEffectiveName(i) === preconfiguredEffectiveId &&
            i.policy_template === preconfiguredInput.policy_template
        )
      : inputs.find((i) => getInputEffectiveName(i) === preconfiguredEffectiveId);

    // If the input do not exist skip
    if (originalInput === undefined) {
      continue;
    }

    if (preconfiguredInput.enabled !== undefined) {
      originalInput.enabled = preconfiguredInput.enabled;
    }

    if (preconfiguredInput.keep_enabled !== undefined) {
      originalInput.keep_enabled = preconfiguredInput.keep_enabled;
    }

    if (preconfiguredInput.vars) {
      const indexOfInput = inputs.indexOf(originalInput);
      inputs[indexOfInput] = deepMergeVars(
        originalInput,
        preconfiguredInput
      ) as NewPackagePolicyInput;
      originalInput = inputs[indexOfInput];
    }

    if (preconfiguredInput.streams) {
      for (const stream of preconfiguredInput.streams) {
        let originalStream = originalInput?.streams.find(
          (s) => s.data_stream.dataset === stream.data_stream.dataset
        );

        if (originalStream === undefined) {
          continue;
        }

        if (stream.enabled !== undefined) {
          originalStream.enabled = stream.enabled;
        }

        if (stream.vars) {
          const indexOfStream = originalInput.streams.indexOf(originalStream);
          originalInput.streams[indexOfStream] = deepMergeVars(
            originalStream,
            stream as InputsOverride
          );
          originalStream = originalInput.streams[indexOfStream];
        }
      }
    }
  }

  const resultingPackagePolicy: NewPackagePolicy = {
    ...basePackagePolicy,
    inputs,
  };

  validatePackagePolicyOrThrow(resultingPackagePolicy, packageInfo);

  return resultingPackagePolicy;
}

// input only packages cannot have their namespace or dataset modified
export function _validateRestrictedFieldsNotModifiedOrThrow(opts: {
  oldPackagePolicy: PackagePolicy;
  packagePolicyUpdate: UpdatePackagePolicy;
}) {
  const { oldPackagePolicy, packagePolicyUpdate } = opts;

  const { inputs } = packagePolicyUpdate;

  if (inputs) {
    for (const input of inputs) {
      const oldInput = oldPackagePolicy.inputs.find(
        (i) => getInputEffectiveName(i) === getInputEffectiveName(input)
      );
      if (oldInput) {
        for (const stream of input.streams || []) {
          const oldStream = oldInput.streams.find(
            (s) => s.data_stream.dataset === stream.data_stream.dataset
          );
          if (
            oldStream &&
            oldStream?.vars?.[DATASET_VAR_NAME] &&
            oldStream?.vars[DATASET_VAR_NAME]?.value !== stream?.vars?.[DATASET_VAR_NAME]?.value
          ) {
            appContextService
              .getLogger()
              .debug(
                () =>
                  `Rejecting package policy update due to dataset change, old val '${
                    oldStream.vars![DATASET_VAR_NAME].value
                  }, new val '${JSON.stringify(stream?.vars?.[DATASET_VAR_NAME]?.value)}'`
              );
            throw new PackagePolicyValidationError(
              i18n.translate('xpack.fleet.updatePackagePolicy.datasetCannotBeModified', {
                defaultMessage:
                  'Package policy dataset cannot be modified, please create a new package policy.',
              })
            );
          }

          if (
            oldStream &&
            oldStream?.vars?.[DATA_STREAM_TYPE_VAR_NAME] &&
            oldStream?.vars[DATA_STREAM_TYPE_VAR_NAME]?.value !==
              stream?.vars?.[DATA_STREAM_TYPE_VAR_NAME]?.value
          ) {
            appContextService
              .getLogger()
              .debug(
                () =>
                  `Rejecting package policy update due to data stream type change, old val '${
                    oldStream.vars![DATA_STREAM_TYPE_VAR_NAME].value
                  }, new val '${JSON.stringify(stream?.vars?.[DATA_STREAM_TYPE_VAR_NAME]?.value)}'`
              );
            throw new PackagePolicyValidationError(
              i18n.translate('xpack.fleet.updatePackagePolicy.dataStreamTypeCannotBeModified', {
                defaultMessage:
                  'Package policy data stream type cannot be modified, please create a new package policy.',
              })
            );
          }
        }
      }
    }
  }
}

function validateReusableIntegrationsAndSpaceAwareness(
  packagePolicy: Pick<NewPackagePolicy, 'policy_ids'>,
  agentPolicies: AgentPolicy[]
) {
  if ((packagePolicy.policy_ids.length ?? 0) <= 1) {
    return;
  }
  for (const agentPolicy of agentPolicies) {
    if (
      (agentPolicy?.space_ids?.length ?? 0) > 1 ||
      agentPolicy?.space_ids?.includes(ALL_SPACES_ID)
    ) {
      throw new FleetError(
        'Reusable integration policies cannot be used with agent policies belonging to multiple spaces.'
      );
    }
  }
}

function validateIsNotHostedPolicy(agentPolicy: AgentPolicy, force = false, errorMessage?: string) {
  const isManagedPolicyWithoutServerlessSupport = agentPolicy.is_managed && !force;

  if (isManagedPolicyWithoutServerlessSupport) {
    throw new HostedAgentPolicyRestrictionRelatedError(
      errorMessage ?? `Cannot update integrations of hosted agent policy ${agentPolicy.id}`
    );
  }
}

export function sendUpdatePackagePolicyTelemetryEvent(
  soClient: SavedObjectsClientContract,
  updatedPkgPolicies: UpdatePackagePolicy[],
  oldPackagePolicies: UpdatePackagePolicy[]
) {
  updatedPkgPolicies.forEach((updatedPkgPolicy) => {
    if (updatedPkgPolicy.package) {
      const { name, version } = updatedPkgPolicy.package;
      const oldPkgPolicy = oldPackagePolicies.find(
        (packagePolicy) => packagePolicy.id === updatedPkgPolicy.id
      );
      const oldVersion = oldPkgPolicy?.package?.version;
      if (oldVersion && oldVersion !== version) {
        const upgradeTelemetry: PackageUpdateEvent = {
          packageName: name,
          currentVersion: oldVersion,
          newVersion: version,
          status: 'success',
          eventType: 'package-policy-upgrade' as UpdateEventType,
        };
        sendTelemetryEvents(
          appContextService.getLogger(),
          appContextService.getTelemetryEventsSender(),
          upgradeTelemetry
        );
        appContextService.getLogger().info(`Package policy upgraded successfully`);
        appContextService.getLogger().debug(() => JSON.stringify(upgradeTelemetry));
      }
    }
  });
}

async function requireUniqueName(
  soClient: SavedObjectsClientContract,
  packagePolicy: UpdatePackagePolicy | NewPackagePolicy,
  id?: string,
  spaceIds: string[] = []
) {
  const savedObjectType = await getPackagePolicySavedObjectType();
  const isMultiSpace = spaceIds.length > 1;
  const baseSearchParams = {
    perPage: SO_SEARCH_LIMIT,
    kuery: `${savedObjectType}.name:"${packagePolicy.name}"`,
  };

  let existingPoliciesWithName;

  if (isMultiSpace) {
    existingPoliciesWithName = await packagePolicyService.list(
      appContextService.getInternalUserSOClientWithoutSpaceExtension(),
      {
        ...baseSearchParams,
        spaceId: '*',
      }
    );
  } else {
    existingPoliciesWithName = await packagePolicyService.list(soClient, baseSearchParams);
  }

  const policiesToCheck = id
    ? // Check that the name does not exist already but exclude the current package policy
      (existingPoliciesWithName?.items || []).filter(
        (p) =>
          p.id !== id &&
          (isMultiSpace ? (p.spaceIds ?? []).some((spaceId) => spaceIds.includes(spaceId)) : true)
      )
    : existingPoliciesWithName?.items;

  if (policiesToCheck.length > 0) {
    throw new PackagePolicyNameExistsError(
      `An integration policy with the name ${packagePolicy.name} already exists. Please rename it or choose a different name.`
    );
  }
}
