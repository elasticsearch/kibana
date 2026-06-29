/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useMemo } from 'react';
import { EuiCallOut, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { CloudStart } from '@kbn/cloud-plugin/public';
import type { CloudSetupForCloudConnector } from '@kbn/fleet-plugin/public';
import { LazyAwsConnectSetup } from '@kbn/fleet-plugin/public';
import { AWS_SERVICES_MAP } from '../aws_service_matrix';
import { useOnboardingFlow } from '../onboarding_flow_context';
import { AwsPermissionsViewer } from './aws_permissions_viewer';
import { useIamPermissions } from '../use_iam_permissions';
import { useDeploy } from './deploy_settings_step/use_deploy';

interface DeploySettingsStepProps {
  onContinue: () => void;
  onBack?: () => void;
}

export function DeploySettingsStep({ onContinue, onBack }: DeploySettingsStepProps) {
  const { services } = useKibana<CoreStart & { cloud?: CloudStart }>();
  const { deploySettingsStep, setConnectorId, setStaticKeys, servicesStep } = useOnboardingFlow();
  const { selectedServiceIds } = servicesStep;

  const { handleDeploy } = useDeploy({ onContinue });

  const showIdentityFederation = useMemo(() => {
    if (selectedServiceIds.length === 0) return true;
    return selectedServiceIds.every(
      (id) => AWS_SERVICES_MAP.get(id)?.identityFederationSupported === true
    );
  }, [selectedServiceIds]);

  // Fetch IAM permissions from the server endpoint.
  const { data: iamPermissions, error: iamPermissionsError } =
    useIamPermissions(selectedServiceIds);

  // Display names for the per-service toggle in the permissions viewer dropdown.
  const viewerServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => {
          const entry = AWS_SERVICES_MAP.get(id);
          return entry ? { id, name: entry.name } : null;
        })
        .filter((s): s is { id: string; name: string } => s !== null),
    [selectedServiceIds]
  );

  // Render the viewer once the endpoint has responded, or a callout on failure.
  const staticKeysContent = useMemo(() => {
    if (iamPermissionsError) {
      return (
        <>
          <EuiCallOut
            title={
              <FormattedMessage
                id="xpack.ingestHub.deploySettingsStep.iamPermissionsError.title"
                defaultMessage="Could not load required IAM permissions"
              />
            }
            color="warning"
            iconType="warning"
            data-test-subj="iamPermissionsErrorCallout"
          >
            <FormattedMessage
              id="xpack.ingestHub.deploySettingsStep.iamPermissionsError.body"
              defaultMessage="The required IAM permissions could not be retrieved. Refer to the integration documentation for the permissions needed before continuing."
            />
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      );
    }
    if (!iamPermissions) return null;
    return (
      <AwsPermissionsViewer
        merged={iamPermissions.merged}
        mergedManagedPolicyArns={iamPermissions.mergedManagedPolicyArns}
        byService={iamPermissions.byService}
        services={viewerServices}
      />
    );
  }, [iamPermissions, iamPermissionsError, viewerServices]);

  return (
    <div data-test-subj="onboardingStep-deploy-settings">
      <Suspense
        fallback={<EuiLoadingSpinner data-test-subj="onboardingStep-deploy-settings-loading" />}
      >
        <LazyAwsConnectSetup
          cloud={services.cloud as CloudSetupForCloudConnector | undefined}
          initialConnectorId={deploySettingsStep.connectorId}
          initialStaticKeys={deploySettingsStep.staticKeys}
          showIdentityFederation={showIdentityFederation}
          staticKeysContent={staticKeysContent}
          onBack={onBack}
          onContinue={() => handleDeploy()}
          continueButtonLabel={
            <FormattedMessage
              id="xpack.ingestHub.deploySettingsStep.continueButton"
              defaultMessage="Deploy"
            />
          }
          continueButtonIconType="playFilled"
          onConnectorIdChange={setConnectorId}
          onStaticKeysChange={setStaticKeys}
        />
      </Suspense>
    </div>
  );
}
