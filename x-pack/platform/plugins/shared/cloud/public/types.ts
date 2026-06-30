/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SolutionId } from '@kbn/core-chrome-browser';
import type { KibanaProductTier, KibanaSolution } from '@kbn/projects-solutions-groups';
import type { FC, PropsWithChildren } from 'react';

/**
 * Represents basic URLs for the Cloud plugin, that do not require specific user roles to access.
 */
export interface CloudBasicUrls {
  /**
   * This is the URL of the Cloud interface.
   */
  baseUrl?: string;
  /**
   * The full URL to the Kibana deployment.
   */
  kibanaUrl?: string;
  /**
   * This is the path to the Cloud deployments management page. The value is already prepended with `baseUrl`.
   *
   * @example `{baseUrl}/deployments`
   */
  deploymentsUrl?: string;
  /**
   * This is the path to the Cloud deployment management page for the deployment to which the Kibana instance belongs. The value is already prepended with `baseUrl`.
   *
   * @example `{baseUrl}/deployments/bfdad4ef99a24212a06d387593686d63`
   */
  deploymentUrl?: string;
  /**
   * This is the path to the Cloud deployment creation page. The value is already prepended with `baseUrl`.
   *
   * @example `{baseUrl}/deployments/create`
   */
  createDeploymentUrl?: string;
  /**
   * The full URL to the user profile page on Elastic Cloud. Undefined if not running on Cloud.
   */
  profileUrl?: string;
  /**
   * The full URL to the organization management page on Elastic Cloud. Undefined if not running on Cloud.
   */
  organizationUrl?: string;
  /**
   * The full URL to the performance page on Elastic Cloud. Undefined if not running on Cloud.
   */
  performanceUrl?: string;
  /**
   * The full URL to the serverless projects page on Elastic Cloud. Undefined if not running in Serverless.
   */
  projectsUrl?: string;
  /**
   * This is the path to the Cloud project creation page. The value is already prepended with `baseUrl`.
   *
   * @example `{baseUrl}/projects/create`
   */
  createProjectUrl?: string;
  /**
   * This is the path to the Snapshots page for the deployment to which the Kibana instance belongs. The value is already prepended with `deploymentUrl`.
   *
   * @example `{deploymentUrl}/elasticsearch/snapshots`
   */
  snapshotsUrl?: string;
}

/**
 * Represents privileged URLs that require specific user roles to access.
 */
export interface CloudPrivilegedUrls {
  /**
   * The full URL to the billing page on Elastic Cloud.
   */
  billingUrl?: string;
  /**
   * The full URL to the users and roles page on Elastic Cloud. Undefined if not running on Cloud,
   * or if the user does not have the `manage_security` cluster privilege.
   */
  usersAndRolesUrl?: string;
}

export type CloudUrls = CloudBasicUrls & CloudPrivilegedUrls;

export interface CloudStart extends CloudBasicUrls {
  /**
   * A React component that provides a pre-wired `React.Context` which connects components to Cloud services.
   */
  CloudContextProvider: FC<PropsWithChildren<unknown>>;
  /**
   * `true` when Kibana is running on Elastic Cloud.
   */
  isCloudEnabled: boolean;
  /**
   * Cloud ID.
   */
  cloudId?: string;
  /**
   * Fetches the full URL to the elasticsearch cluster.
   */
  fetchElasticsearchConfig: () => Promise<PublicElasticsearchConfigType>;
  /**
   * Managed OTLP service configuration. Only present when the deployment is configured to use the
   * managed OTLP service (always on observability serverless projects, and feature-flagged on ECH).
   */
  managedOtlp?: {
    /**
     * URL of the managed OTLP endpoint.
     */
    url?: string;
  };
  /**
   * Method to retrieve privileged URLs for the Cloud plugin.
   */
  getPrivilegedUrls: () => Promise<CloudPrivilegedUrls>;
  /**
   * Method to retrieve basic URLs for the Cloud plugin.
   */
  getUrls: () => CloudBasicUrls;
  /**
   * Method to retrieve if the organization is in trial.
   */
  isInTrial: () => boolean;
  /**
   * Method to retrieve the number of days left in the trial.
   * Returns undefined if trial_end_date is not set, or the number of days remaining (0 if expired).
   */
  trialDaysLeft: () => number | undefined;
  /**
   * `true` when running on Serverless Elastic Cloud
   * Note that `isCloudEnabled` will always be true when `isServerlessEnabled` is.
   */
  isServerlessEnabled: boolean;
  /**
   * Serverless configuration
   */
  serverless: {
    /**
     * The serverless projectId.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectId?: string;
    /**
     * The serverless project name.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectName?: string;
    /**
     * The serverless project type.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectType?: KibanaSolution;
    /**
     * Whether the serverless project belongs to an organization currently in trial.
     */
    organizationInTrial?: boolean;
  };
}

export interface CloudSetup extends CloudBasicUrls {
  /**
   * Cloud ID. Undefined if not running on Cloud.
   */
  cloudId?: string;
  /**
   * The Elastic Cloud Organization that owns this deployment/project.
   */
  organizationId?: string;
  /**
   * The deployment's ID. Only available when running on Elastic Cloud.
   */
  deploymentId?: string;
  /**
   * This value is the same as `baseUrl` on ESS but can be customized on ECE.
   *
   * @example `cloud.elastic.co`
   */
  cname?: string;
  /**
   * The cloud service provider identifier.
   *
   * @note Expected to be one of `aws`, `gcp` or `azure`, but could be something different.
   */
  csp?: string;
  /**
   * The cloud region identifier (e.g., `us-east-1`, `europe-west1`, `eastus2`).
   * Provider-specific region name without the CSP prefix.
   */
  region?: string;
  /**
   * Method to retrieve privileged URLs for the Cloud plugin.
   */
  getPrivilegedUrls: () => Promise<CloudPrivilegedUrls>;
  /**
   * Method to retrieve basic URLs for the Cloud plugin.
   */
  getUrls: () => CloudUrls;
  /**
   * Fetches the full URL to the elasticsearch cluster.
   */
  fetchElasticsearchConfig: () => Promise<PublicElasticsearchConfigType>;
  /**
   * {host} from the deployment url https://<deploymentId>.<application>.<host><?:port>
   */
  cloudHost?: string;
  /**
   * {port} from the deployment url https://<deploymentId>.<application>.<host><?:port>
   */
  cloudDefaultPort?: string;
  /**
   * `true` when Kibana is running on Elastic Cloud.
   */
  isCloudEnabled: boolean;
  /**
   * `true` when running on ECE (Elastic Cloud Enterprise).
   * When `isSaasContainer` is missing, cloud-enabled non-serverless deployments are assumed to
   * be ECE. Self-managed and serverless deployments remain `undefined` unless explicitly set.
   */
  isEce?: boolean;
  /**
   * The end date for the Elastic Cloud trial. Only available on Elastic Cloud.
   *
   * @example `2020-10-14T10:40:22Z`
   */
  trialEndDate?: Date;
  /**
   * `true` if the Elastic Cloud organization that owns this deployment is owned by an Elastician. Only available when running on Elastic Cloud.
   */
  isElasticStaffOwned?: boolean;
  /**
   * Registers CloudServiceProviders so start's `CloudContextProvider` hooks them.
   *
   * @param contextProvider The React component from the Service Provider.
   */
  registerCloudService: (contextProvider: FC) => void;
  /**
   * Managed OTLP service configuration. Only present when the deployment is configured to use the
   * managed OTLP service (always on observability serverless projects, and feature-flagged on ECH).
   */
  managedOtlp?: {
    /**
     * URL of the managed OTLP endpoint.
     */
    url?: string;
  };
  /**
   * Onboarding configuration
   */
  onboarding: {
    /**
     * The default solution selected during onboarding.
     */
    defaultSolution?: SolutionId;
  };
  /**
   * `true` when running on Serverless Elastic Cloud
   * Note that `isCloudEnabled` will always be true when `isServerlessEnabled` is.
   */
  isServerlessEnabled: boolean;
  /**
   * Serverless configuration
   */
  serverless: {
    /**
     * The serverless projectId.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectId?: string;
    /**
     * The serverless project name.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectName?: string;
    /**
     * The serverless project type.
     * Will always be present if `isServerlessEnabled` is `true`
     */
    projectType?: KibanaSolution;
    /**
     * The serverless product tier.
     * Only present if the current project type has product tiers defined.
     * @remarks This field is only exposed for informational purposes. Use the `core.pricing` when checking if a feature if available for the current product tier.
     * @internal
     */
    productTier?: KibanaProductTier;
    /**
     * The serverless orchestrator target. The potential values are `canary` or `non-canary`
     * Will always be present if `isServerlessEnabled` is `true`
     */
    orchestratorTarget?: string;
    /**
     * Whether the serverless project belongs to an organization currently in trial.
     */
    organizationInTrial?: boolean;
  };
  /**
   * Method to retrieve if the organization is in trial.
   */
  isInTrial: () => boolean;
  /**
   * Method to retrieve the number of days left in the trial.
   * Returns undefined if trial_end_date is not set, or the number of days remaining (0 if expired).
   */
  trialDaysLeft: () => number | undefined;
}

export interface PublicElasticsearchConfigType {
  /**
   * The URL to the Elasticsearch cluster, derived from elasticsearch.publicBaseUrl if populated
   * Otherwise this is based on the cloudId
   * If neither is populated, this will be undefined
   */
  elasticsearchUrl?: string;
}
