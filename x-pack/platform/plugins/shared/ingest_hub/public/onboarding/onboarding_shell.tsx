/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPageTemplate,
  EuiSpacer,
  EuiStepsHorizontal,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';

import { AWS_ONBOARDING_TITLE, AWS_ONBOARDING_DESCRIPTION } from '../../common/constants';
import { ONBOARDING_STEPS } from './steps';
import { useStepState } from './use_step_state';
import { AWS_SERVICES_MAP } from './aws_service_matrix';
import { useOnboardingFlow } from './onboarding_flow_context';
import {
  DeploySettingsStep,
  ServicesStep,
  ServiceSettingsStep,
  DeployAndDetectStep,
} from './step_components';

const DEPLOY_SETTINGS_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.id === 'deploy-settings');

export interface StepComponentProps {
  onNext: () => void;
  onBack?: () => void;
}

const STEP_COMPONENTS: Record<string, React.ComponentType<StepComponentProps>> = {
  'deploy-settings': DeploySettingsStep,
  services: ServicesStep,
  'service-settings': ServiceSettingsStep,
  'deploy-and-detect': DeployAndDetectStep,
};

interface IntegrationMeta {
  title: string;
  description: string;
  icon: string;
}

const INTEGRATION_META: Record<string, IntegrationMeta> = {
  aws: { title: AWS_ONBOARDING_TITLE, description: AWS_ONBOARDING_DESCRIPTION, icon: 'logoAWS' },
};

export function OnboardingShell() {
  const { integrationId } = useParams<{ integrationId: string }>();
  const history = useHistory();
  const location = useLocation();
  const { euiTheme } = useEuiTheme();
  const meta = INTEGRATION_META[integrationId];

  useEffect(() => {
    if (!meta) {
      history.replace('/');
    }
  }, [meta, history]);

  const { completedSteps, markStepComplete, firstIncompleteStepId } = useStepState(integrationId);

  const { servicesStep } = useOnboardingFlow();
  const { selectedServiceIds } = servicesStep;

  const needsDeploySettingsStep = useMemo(
    () =>
      selectedServiceIds.length === 0 ||
      selectedServiceIds.some(
        (id) =>
          AWS_SERVICES_MAP.get(id)?.deliveryMethods.some((dm) => dm.method === 'agentless') ?? false
      ),
    [selectedServiceIds]
  );

  const currentStepId = location.hash ? location.hash.slice(1) : '';
  const isValidStep = ONBOARDING_STEPS.some((s) => s.id === currentStepId);

  useEffect(() => {
    if (meta && !isValidStep) {
      history.replace({ ...location, hash: `#${firstIncompleteStepId}` });
    }
  }, [meta, isValidStep, firstIncompleteStepId, history, location]);

  const currentStepIndex = ONBOARDING_STEPS.findIndex((s) => s.id === currentStepId);

  const onNext = useMemo(() => {
    const nextStep = ONBOARDING_STEPS[currentStepIndex + 1];
    return () => {
      markStepComplete(currentStepId);
      if (currentStepId === 'services' && !needsDeploySettingsStep) {
        markStepComplete('deploy-settings');
        const stepAfterConnect = ONBOARDING_STEPS[DEPLOY_SETTINGS_STEP_INDEX + 1];
        if (stepAfterConnect) {
          history.push({ ...location, hash: `#${stepAfterConnect.id}` });
        }
      } else if (nextStep) {
        history.push({ ...location, hash: `#${nextStep.id}` });
      }
    };
  }, [
    currentStepId,
    currentStepIndex,
    markStepComplete,
    needsDeploySettingsStep,
    history,
    location,
  ]);

  const onBack = useMemo(() => {
    if (currentStepIndex <= 0) return undefined;
    // Scan backward, skipping connect when it is not part of the current flow
    let prevIndex = currentStepIndex - 1;
    while (
      prevIndex > 0 &&
      ONBOARDING_STEPS[prevIndex].id === 'deploy-settings' &&
      !needsDeploySettingsStep
    ) {
      prevIndex--;
    }
    const prevStep = ONBOARDING_STEPS[prevIndex];
    return () => history.push({ ...location, hash: `#${prevStep.id}` });
  }, [currentStepIndex, needsDeploySettingsStep, history, location]);

  const horizontalStepsConfig = useMemo(
    () =>
      ONBOARDING_STEPS.map((step) => {
        const isComplete = completedSteps.has(step.id);
        const isCurrent = step.id === currentStepId;
        return {
          title: step.title,
          status: (isComplete ? 'complete' : isCurrent ? 'current' : 'incomplete') as
            | 'complete'
            | 'current'
            | 'incomplete',
          onClick:
            isComplete || isCurrent
              ? () => history.push({ ...location, hash: `#${step.id}` })
              : () => {},
          'data-test-subj': `onboardingStepIndicator-${step.id}`,
        };
      }),
    [completedSteps, currentStepId, history, location]
  );

  if (!meta || !isValidStep) {
    return null;
  }

  const CurrentStepComponent = STEP_COMPONENTS[currentStepId];

  return (
    <EuiPageTemplate data-test-subj="onboardingShell">
      <EuiPageTemplate.Section
        grow={false}
        paddingSize="l"
        restrictWidth
        css={css`
          border-bottom: ${euiTheme.border.thin};
        `}
      >
        <EuiFlexGroup alignItems="center" gutterSize="l">
          <EuiFlexItem grow={false}>
            <EuiIcon type={meta.icon} size="xxl" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="l">
              <h1>{meta.title}</h1>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="m" color="subdued">
              <p>{meta.description}</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section paddingSize="xl" restrictWidth>
        <EuiStepsHorizontal steps={horizontalStepsConfig} />
        <EuiSpacer size="xl" />
        {CurrentStepComponent && <CurrentStepComponent onNext={onNext} onBack={onBack} />}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
