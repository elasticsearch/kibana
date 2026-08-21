/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import { buildPolicyChangeAssessment } from '../domain/impact';
import type { PolicyChangeAssessment, PolicyChangeCapabilities } from '../domain/impact';
import { assertParameterBounds } from '../domain/impact/parameter_bounds';
import { parseAssessPolicyChangeParams } from '../domain/impact/policy_change_operation';
import type { PolicyAccessContext } from './access_context';
import type { EndpointCountResult } from './count_endpoints';
import { countEndpoints } from './count_endpoints';
import { getNormalizedEndpointPolicy } from './read_policy';

export interface AssessPolicyChangeDto {
  readonly assessment: PolicyChangeAssessment;
  readonly spaceId: string;
  readonly enrollment: EndpointCountResult;
}

const toPolicyChangeCapabilities = (
  endpointAppContextService: EndpointAppContextService
): PolicyChangeCapabilities => {
  const licenseService = endpointAppContextService.getLicenseService();
  const productFeatures = endpointAppContextService.getProductFeaturesService();
  const { experimentalFeatures } = endpointAppContextService;

  return {
    licenseInformation: licenseService.getLicenseInformation(),
    endpointPolicyProtections: productFeatures.isEnabled(
      ProductFeatureSecurityKey.endpointPolicyProtections
    ),
    endpointTrustedDevices: productFeatures.isEnabled(
      ProductFeatureSecurityKey.endpointTrustedDevices
    ),
    trustedDevicesExperimental: experimentalFeatures.trustedDevices,
    endpointProtectionUpdates: productFeatures.isEnabled(
      ProductFeatureSecurityKey.endpointProtectionUpdates
    ),
    serverless: endpointAppContextService.isServerless(),
  };
};

export const assessChange = async (
  access: PolicyAccessContext,
  endpointAppContextService: EndpointAppContextService,
  rawParams: unknown
): Promise<AssessPolicyChangeDto> => {
  assertParameterBounds(rawParams);
  const params = parseAssessPolicyChangeParams(rawParams);
  const policy = await getNormalizedEndpointPolicy(access, { idOrName: params.idOrName });
  const assessment = buildPolicyChangeAssessment(
    policy,
    params.changes,
    toPolicyChangeCapabilities(endpointAppContextService)
  );
  const enrollment = await countEndpoints(access, {
    agentPolicyIds: policy.snapshot.agentPolicyIds,
  });

  return {
    assessment,
    spaceId: access.spaceId,
    enrollment,
  };
};
