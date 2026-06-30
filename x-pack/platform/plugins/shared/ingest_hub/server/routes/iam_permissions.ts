/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import type { FleetStartContract } from '@kbn/fleet-plugin/server';
import type { PackageInfo } from '@kbn/fleet-plugin/common';

import { IAM_PERMISSIONS_API_PATH } from '../../common/iam_permissions_api';
import { AWS_SERVICE_LOOKUP } from '../../common/aws_service_lookup';
import { AWS_SERVICE_PROVIDER_PERMISSIONS } from '../../common/aws_provider_permissions';
import { buildIamPolicyDocument, getIntegrationSid } from '../../common/iam_policy_document';
import { mapProviderPermissions } from '../../common/map_provider_permissions';

/**
 * Title-cases each underscore/hyphen-separated segment of a service id so that
 * `getIntegrationSid` produces a readable Sid (e.g. 'ec2_metrics' → 'ElasticEc2Metrics'
 * rather than 'Elasticec2metrics').
 */
const toSidSegment = (id: string): string =>
  id
    .split(/[_-]/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');

export const registerIamPermissionsRoute = (
  router: IRouter,
  getFleet: () => FleetStartContract,
  logger: Logger
): void => {
  router.get(
    {
      path: IAM_PERMISSIONS_API_PATH,
      validate: {
        query: schema.object({
          /** Comma-separated list of AWS service data stream ids. */
          services: schema.string({ minLength: 1, maxLength: 2048 }),
        }),
      },
      security: {
        authz: {
          // This internal endpoint returns publicly-available package manifest data used to
          // display required AWS IAM permissions in the onboarding UI. It exposes no
          // user-specific or tenant data; the underlying packageService.asInternalUser call
          // already scopes access to the public integration catalog.
          enabled: false,
          reason:
            'Returns publicly-available package manifest data for the onboarding IAM permissions display. No user-specific or tenant data is exposed.',
        },
      },
    },
    async (_context, request, response) => {
      const rawServices = request.query.services;
      const serviceIds = rawServices
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (serviceIds.length === 0) {
        return response.badRequest({ body: 'services query param must be non-empty' });
      }

      // Validate that all requested ids are known.
      const unknownIds = serviceIds.filter((id) => !(id in AWS_SERVICE_LOOKUP));
      if (unknownIds.length > 0) {
        return response.badRequest({
          body: `Unknown service id(s): ${unknownIds.join(', ')}`,
        });
      }

      // Group service ids by packageName to minimise Fleet package fetches.
      const byPackage = new Map<string, string[]>();
      for (const id of serviceIds) {
        const { packageName } = AWS_SERVICE_LOOKUP[id];
        const existing = byPackage.get(packageName) ?? [];
        existing.push(id);
        byPackage.set(packageName, existing);
      }

      // Fetch PackageInfo for each distinct package in parallel.
      const fleet = getFleet();
      const packageInfoMap = new Map<string, PackageInfo | null>();

      await Promise.all(
        [...byPackage.keys()].map(async (pkgName) => {
          try {
            const pkgInfo = await fleet.packageService.asInternalUser.getLatestPackageInfo(pkgName);
            packageInfoMap.set(pkgName, pkgInfo);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.debug(`Could not fetch package info for '${pkgName}': ${message}`);
            packageInfoMap.set(pkgName, null);
          }
        })
      );

      // Resolve permissions per service, falling back to the hardcoded matrix.
      const allActions: string[] = [];
      const allManagedPolicyArns: string[] = [];
      const byService: Record<
        string,
        { policy: ReturnType<typeof buildIamPolicyDocument>; managedPolicyArns: string[] }
      > = {};

      for (const id of serviceIds) {
        const lookup = AWS_SERVICE_LOOKUP[id];
        const pkgInfo = packageInfoMap.get(lookup.packageName);

        let actions: string[] | null = null;
        let managedPolicyArns: string[] = [];

        if (pkgInfo) {
          const fromManifest = mapProviderPermissions(pkgInfo, {
            packageName: lookup.packageName,
            policyTemplate: lookup.policyTemplate,
            inputs: lookup.inputs,
            // Use the lookup's dataStream override when the service id differs from
            // the actual data stream path in the package (e.g. fargate → task_stats).
            dataStream: lookup.dataStream ?? id,
          });

          if (
            fromManifest &&
            (fromManifest.actions.length > 0 || fromManifest.managedPolicyArns.length > 0)
          ) {
            actions = fromManifest.actions;
            managedPolicyArns = fromManifest.managedPolicyArns;
          }
        }

        // Fall back to the hardcoded matrix when the package has no manifest permissions.
        if (actions === null) {
          logger.debug(
            `No manifest provider_permissions found for service '${id}' — using hardcoded matrix fallback`
          );
          const fallback = AWS_SERVICE_PROVIDER_PERMISSIONS[id];
          actions = fallback?.actions ?? [];
          if (fallback?.managedPolicyArns?.length) {
            managedPolicyArns = fallback.managedPolicyArns;
          }
        }

        if (actions.length > 0 || managedPolicyArns.length > 0) {
          byService[id] = {
            policy: buildIamPolicyDocument(actions, getIntegrationSid(toSidSegment(id))),
            managedPolicyArns,
          };
          allActions.push(...actions);
          allManagedPolicyArns.push(...managedPolicyArns);
        }
      }

      // Build the merged policy from all services' actions, deduped.
      const merged = buildIamPolicyDocument(allActions);
      const mergedManagedPolicyArns = [...new Set(allManagedPolicyArns)];

      return response.ok({ body: { merged, mergedManagedPolicyArns, byService } });
    }
  );
};
