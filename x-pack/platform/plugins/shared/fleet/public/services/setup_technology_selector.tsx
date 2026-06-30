/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiBetaBadge,
  EuiCheckableCard,
  EuiText,
  EuiRadioGroup,
  EuiDescribedFormGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiBadge,
  EuiTitle,
} from '@elastic/eui';

import { useStartServices } from '../hooks';
import type { PackageInfo } from '../../common/types';
import { SetupTechnology } from '../../common/types';
import { RELEASE_BADGE_DESCRIPTION } from '../components/release_badge';

export const SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ = 'setup-technology-selector';
export const SETUP_TECHNOLOGY_SELECTOR_BETA_BADGE_TEST_SUBJ =
  'setup-technology-selector-beta-badge';

interface SetupTechnologySelectorProps {
  disabled: boolean;
  packageInfo: PackageInfo;
  onSetupTechnologyChange: (value: SetupTechnology) => void;
  allowedSetupTechnologies?: SetupTechnology[];
  setupTechnology?: SetupTechnology;

  isAgentlessDefault?: boolean;
  showBetaBadge?: boolean;
  useDescribedFormGroup?: boolean;
  useCheckableCards?: boolean;
  hideTitle?: boolean;
}

export const SetupTechnologySelector = ({
  disabled,
  packageInfo,
  allowedSetupTechnologies = [SetupTechnology.AGENT_BASED, SetupTechnology.AGENTLESS],
  setupTechnology,
  onSetupTechnologyChange,
  isAgentlessDefault = false,
  showBetaBadge,
  useDescribedFormGroup = true,
  useCheckableCards = false,
  hideTitle = false,
}: SetupTechnologySelectorProps) => {
  const { docLinks } = useStartServices();

  const currentSetupTechnology =
    setupTechnology ||
    (isAgentlessDefault ? SetupTechnology.AGENTLESS : SetupTechnology.AGENT_BASED);

  const agentlessRadioId = `SetupTechnologySelector_${SetupTechnology.AGENTLESS}`;
  const agentBasedRadioId = `SetupTechnologySelector_${SetupTechnology.AGENT_BASED}`;

  const radioGroup = (
    <EuiRadioGroup
      disabled={disabled}
      name="SetupTechnologySelector"
      data-test-subj={SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ}
      idSelected={`SetupTechnologySelector_${currentSetupTechnology}`}
      options={[
        {
          id: agentlessRadioId,
          value: SetupTechnology.AGENTLESS,
          disabled: !allowedSetupTechnologies.includes(SetupTechnology.AGENTLESS),
          label: (
            <>
              <strong>
                <FormattedMessage
                  id="xpack.fleet.setupTechnology.agentlessInputDisplay"
                  defaultMessage="Elastic Managed Integration"
                />{' '}
                {isAgentlessDefault && (
                  <EuiBadge>
                    <FormattedMessage
                      id="xpack.fleet.setupTechnology.agentlessDeployment.recommendedBadge"
                      defaultMessage="Recommended"
                    />
                  </EuiBadge>
                )}{' '}
                {showBetaBadge && (
                  <EuiBetaBadge
                    data-test-subj={SETUP_TECHNOLOGY_SELECTOR_BETA_BADGE_TEST_SUBJ}
                    href={docLinks.links.fleet.agentlessIntegrations}
                    target="_blank"
                    label={
                      <FormattedMessage
                        id="xpack.fleet.setupTechnology.agentlessDeployment.betaBadge"
                        defaultMessage="Beta"
                      />
                    }
                    size="s"
                    tooltipContent={RELEASE_BADGE_DESCRIPTION.beta}
                    alignment="middle"
                  />
                )}
              </strong>
              <EuiText size="s">
                <p>
                  <FormattedMessage
                    id="xpack.fleet.setupTechnology.agentlessInputDescription"
                    defaultMessage="Best for simple setup and faster onboarding"
                  />
                </p>
              </EuiText>
              <EuiSpacer size="xs" />
            </>
          ),
        },
        {
          id: agentBasedRadioId,
          value: SetupTechnology.AGENT_BASED,
          disabled: !allowedSetupTechnologies.includes(SetupTechnology.AGENT_BASED),
          label: (
            <>
              <strong>
                <FormattedMessage
                  id="xpack.fleet.setupTechnology.agentbasedInputDisplay"
                  defaultMessage="Agent-based"
                />
              </strong>
              <EuiText size="s">
                <p>
                  <FormattedMessage
                    id="xpack.fleet.setupTechnology.agentbasedInputDescription"
                    defaultMessage="Deploy an Elastic Agent into your cloud environment"
                  />
                </p>
              </EuiText>
            </>
          ),
        },
      ]}
      onChange={(optionId: string, value?: unknown) => {
        const newSetupTechnology =
          (value as SetupTechnology) ??
          (optionId === agentlessRadioId ? SetupTechnology.AGENTLESS : SetupTechnology.AGENT_BASED);
        onSetupTechnologyChange(newSetupTechnology);
      }}
    />
  );

  const checkableCards = (
    <EuiFlexGroup
      gutterSize="m"
      data-test-subj={SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ}
      direction="column"
    >
      <EuiFlexItem>
        <EuiCheckableCard
          id={agentlessRadioId}
          label={
            <>
              <strong>
                <FormattedMessage
                  id="xpack.fleet.setupTechnology.radioCardAgentlessInputDisplay"
                  defaultMessage="Elastic Managed Integration"
                />{' '}
                {isAgentlessDefault && (
                  <EuiBadge>
                    <FormattedMessage
                      id="xpack.fleet.setupTechnology.agentlessDeployment.recommendedBadge"
                      defaultMessage="Recommended"
                    />
                  </EuiBadge>
                )}{' '}
                {showBetaBadge && (
                  <EuiBetaBadge
                    data-test-subj={SETUP_TECHNOLOGY_SELECTOR_BETA_BADGE_TEST_SUBJ}
                    href={docLinks.links.fleet.agentlessIntegrations}
                    target="_blank"
                    label={
                      <FormattedMessage
                        id="xpack.fleet.setupTechnology.agentlessDeployment.betaBadge"
                        defaultMessage="Beta"
                      />
                    }
                    size="s"
                    tooltipContent={RELEASE_BADGE_DESCRIPTION.beta}
                    alignment="middle"
                  />
                )}
              </strong>
              <EuiText size="s">
                <p>
                  <FormattedMessage
                    id="xpack.fleet.setupTechnology.radioCardAgentlessInputDescription"
                    defaultMessage="Best for simple setup and faster onboarding."
                  />
                </p>
              </EuiText>
            </>
          }
          checked={currentSetupTechnology === SetupTechnology.AGENTLESS}
          disabled={disabled || !allowedSetupTechnologies.includes(SetupTechnology.AGENTLESS)}
          onChange={() => onSetupTechnologyChange(SetupTechnology.AGENTLESS)}
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiCheckableCard
          id={agentBasedRadioId}
          label={
            <>
              <strong>
                <FormattedMessage
                  id="xpack.fleet.setupTechnology.agentbasedInputDisplay"
                  defaultMessage="Agent-based"
                />
              </strong>
              <EuiText size="s">
                <p>
                  <FormattedMessage
                    id="xpack.fleet.setupTechnology.radioCardAgentbasedInputDescription"
                    defaultMessage="Deploy Elastic Agent to collect the selected {integrationName} from your environment. Best if you already run agents or need more control."
                    values={{ integrationName: packageInfo.title }}
                  />
                </p>
              </EuiText>
            </>
          }
          checked={currentSetupTechnology === SetupTechnology.AGENT_BASED}
          disabled={disabled || !allowedSetupTechnologies.includes(SetupTechnology.AGENT_BASED)}
          onChange={() => onSetupTechnologyChange(SetupTechnology.AGENT_BASED)}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const selector = useCheckableCards ? checkableCards : radioGroup;

  if (useDescribedFormGroup) {
    return (
      <EuiDescribedFormGroup
        title={
          <h3>
            <FormattedMessage
              id="xpack.fleet.setupTechnology.setupTechnologyLabel"
              defaultMessage="Deployment options"
            />
          </h3>
        }
        description={
          <FormattedMessage
            id="xpack.fleet.setupTechnology.setupTechnologyDescription"
            defaultMessage="Select a deployment mode for this integration."
          />
        }
      >
        {selector}
      </EuiDescribedFormGroup>
    );
  }

  // Used for security integrations (no form group wrapping)
  return (
    <>
      {!hideTitle && (
        <>
          <EuiTitle size="xs">
            <h2>
              <FormattedMessage
                id="xpack.fleet.setupTechnology.setupTechnologyLabel"
                defaultMessage="Deployment options"
              />
            </h2>
          </EuiTitle>
        </>
      )}
      <EuiText size="s" color="subdued">
        <p>
          <FormattedMessage
            id="xpack.fleet.setupTechnology.integrationSubtitle"
            defaultMessage="How to connect {integrationName} to Elastic."
            values={{ integrationName: packageInfo.title }}
          />
        </p>
      </EuiText>
      <EuiSpacer size="s" />
      {selector}
    </>
  );
};
