/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useMemo } from 'react';
import { EuiButtonEmpty, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { CloudStart } from '@kbn/cloud-plugin/public';
import type { CloudSetupForCloudConnector } from '@kbn/fleet-plugin/public';
import { LazyAwsConnectSetup } from '@kbn/fleet-plugin/public';
import { AWS_SERVICES_MAP } from '../aws_service_matrix';
import { getSelectedServicePermissions } from '../service_permissions';
import { useOnboardingFlow } from '../onboarding_flow_context';
import { AwsPermissionsViewer } from './aws_permissions_viewer';

interface DeploySettingsStepProps {
  onNext: () => void;
  onBack?: () => void;
}

export function DeploySettingsStep({ onNext, onBack }: DeploySettingsStepProps) {
  const { services } = useKibana<CoreStart & { cloud?: CloudStart }>();
  const { connectStep, setConnectorId, setStaticKeys, servicesStep } = useOnboardingFlow();
  const { selectedServiceIds } = servicesStep;

  const showIdentityFederation = useMemo(() => {
    if (selectedServiceIds.length === 0) return true;
    return selectedServiceIds.every(
      (id) => AWS_SERVICES_MAP.get(id)?.identityFederationSupported === true
    );
  }, [selectedServiceIds]);

  const staticKeysPermissions = useMemo(
    () => getSelectedServicePermissions(selectedServiceIds),
    [selectedServiceIds]
  );

  const staticKeysContent = useMemo(
    () => <AwsPermissionsViewer services={staticKeysPermissions} />,
    [staticKeysPermissions]
  );

  return (
    <div data-test-subj="onboardingStep-deploy-settings">
      {onBack && (
        <>
          <EuiButtonEmpty iconType="arrowLeft" iconSide="left" onClick={onBack}>
            <FormattedMessage
              id="xpack.ingestHub.deploySettingsStep.backButton"
              defaultMessage="Back"
            />
          </EuiButtonEmpty>
          <EuiSpacer size="m" />
        </>
      )}
      <Suspense
        fallback={<EuiLoadingSpinner data-test-subj="onboardingStep-deploy-settings-loading" />}
      >
        <LazyAwsConnectSetup
          cloud={services.cloud as CloudSetupForCloudConnector | undefined}
          initialConnectorId={connectStep.connectorId}
          initialStaticKeys={connectStep.staticKeys}
          showIdentityFederation={showIdentityFederation}
          staticKeysContent={staticKeysContent}
          onNext={onNext}
          onConnectorIdChange={setConnectorId}
          onStaticKeysChange={setStaticKeys}
        />
      </Suspense>
    </div>
  );
}
