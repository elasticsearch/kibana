/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEvent } from 'react';
import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import type { EuiSelectableProps } from '@elastic/eui';
import {
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiButton,
  EuiSteps,
  EuiTitle,
  EuiSelectable,
  EuiSelectableMessage,
  EuiIcon,
  EuiLoadingSpinner,
  EuiLink,
  EuiSkeletonText,
  EuiCallOut,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { INTEGRATIONS_PLUGIN_ID } from '@kbn/fleet-plugin/common';
import { pagePathGetters } from '@kbn/fleet-plugin/public';
import type { ImmutableArray, PolicyData } from '../../../common/endpoint/types';
import { useUserPrivileges } from '../../common/components/user_privileges';
import onboardingLogo from '../images/security_administration_onboarding.svg';
import { useAppUrl, useKibana } from '../../common/lib/kibana';

const TEXT_ALIGN_CENTER = css`
  text-align: center;
`;

const MAX_SIZE_ONBOARDING_LOGO = {
  maxWidth: 550,
  maxHeight: 420,
};

interface ManagementStep {
  title: string;
  children: JSX.Element;
}

const MissingFleetAccessInfo = React.memo(() => {
  const { services } = useKibana();

  return (
    <EuiText size="s" color="subdued" data-test-subj="noFleetAccess">
      <FormattedMessage
        id="xpack.securitySolution.endpoint.onboarding.enableFleetAccess"
        defaultMessage="Deploying Agents for the first time requires Fleet access. For more information, "
      />
      <EuiLink external href={`${services.docLinks.links.securitySolution.privileges}`}>
        <FormattedMessage
          id="xpack.securitySolution.endpoint.onboarding.onboardingDocsLink"
          defaultMessage="view the Elastic Security documentation"
        />
      </EuiLink>
    </EuiText>
  );
});
MissingFleetAccessInfo.displayName = 'MissingFleetAccessInfo';

const PolicyEmptyState = React.memo<{
  loading: boolean;
  onActionClick?: (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  actionDisabled?: boolean;
  policyEntryPoint?: boolean;
}>(({ loading, onActionClick, actionDisabled, policyEntryPoint = false }) => {
  const docLinks = useKibana().services.docLinks;
  const {
    canAccessFleet,
    canWriteIntegrationPolicies,
    loading: authzLoading,
  } = useUserPrivileges().endpointPrivileges;

  return (
    <div data-test-subj="emptyPolicyTable">
      {loading ? (
        <EuiFlexGroup alignItems="center" justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" className="essentialAnimation" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <EuiFlexGroup data-test-subj="policyOnboardingInstructions" alignItems="center">
          <EuiFlexItem grow={1}>
            <EuiText>
              <h1>
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.policyList.onboardingTitle"
                  defaultMessage="Get started with Elastic Defend"
                />
              </h1>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.securitySolution.endpoint.policyList.onboardingSectionOne"
                defaultMessage="Protect your hosts with threat prevention, detection, and deep security data visibility."
              />
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="s" color="subdued">
              {policyEntryPoint ? (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.policyList.onboardingSectionTwo.fromPolicyPage"
                  defaultMessage="From this page, you can view and manage the Elastic Defend integration policies in your environment running Elastic Defend."
                />
              ) : (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.policyList.onboardingSectionTwo.fromEndpointPage"
                  defaultMessage="From this page, you can view and manage the hosts in your environment running Elastic Defend."
                />
              )}
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.securitySolution.endpoint.policyList.onboardingSectionThree"
                defaultMessage="To get started, add the Elastic Defend integration to your Agents. For more information, "
              />
              <EuiLink external href={`${docLinks.links.siem.guide}`}>
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.policyList.onboardingDocsLink"
                  defaultMessage="view the Elastic Security documentation"
                />
              </EuiLink>
            </EuiText>

            <EuiSpacer size="m" />

            {authzLoading && <EuiSkeletonText lines={1} />}

            {!authzLoading && canAccessFleet && canWriteIntegrationPolicies && (
              <>
                <EuiSpacer size="s" />
                <EuiFlexGroup>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      fill
                      iconType="plusCircle"
                      onClick={onActionClick}
                      isDisabled={actionDisabled}
                      data-test-subj="onboardingStartButton"
                    >
                      <FormattedMessage
                        id="xpack.securitySolution.endpoint.policyList.actionButtonText"
                        defaultMessage="Add Elastic Defend"
                      />
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}

            {!authzLoading && !(canAccessFleet && canWriteIntegrationPolicies) && (
              <MissingFleetAccessInfo />
            )}
          </EuiFlexItem>

          <EuiFlexItem grow={2}>
            <EuiIcon
              type={onboardingLogo}
              size="original"
              css={MAX_SIZE_ONBOARDING_LOGO}
              aria-hidden={true}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </div>
  );
});

const EndpointsEmptyState = React.memo<{
  loading: boolean;
  onActionClick: (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  actionDisabled: boolean;
  handleSelectableOnChange: (o: EuiSelectableProps['options']) => void;
  selectionOptions: EuiSelectableProps['options'];
  policyItems: ImmutableArray<PolicyData>;
}>(
  ({
    loading,
    onActionClick,
    actionDisabled,
    handleSelectableOnChange,
    selectionOptions,
    policyItems,
  }) => {
    const { getAppUrl } = useAppUrl();
    const policyItemsWithoutAgentPolicy = useMemo(
      () => policyItems.filter((policy) => !policy.policy_ids.length),
      [policyItems]
    );

    const policiesNotAddedToAgentPolicyCallout = useMemo(
      () =>
        !!policyItemsWithoutAgentPolicy.length && (
          <>
            <EuiSpacer size="xl" />
            <EuiCallOut
              announceOnMount={false}
              color="primary"
              iconType="info"
              title={i18n.translate(
                'xpack.securitySolution.endpoint.list.notAddedIntegrations.title',
                {
                  defaultMessage: 'Integrations not added to an Agent policy',
                }
              )}
              data-test-subj="integrationsNotAddedToAgentPolicyCallout"
            >
              <EuiSpacer size="s" />

              <EuiText size="s" color="subdued">
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.list.notAddedIntegrations.description"
                  defaultMessage="The following Elastic Defend integrations aren't added to an Agent policy, so they can't be deployed to an Agent. Click on an integration to edit it, and add it to an Agent policy:"
                />

                <EuiSpacer size="s" />

                <ul>
                  {policyItemsWithoutAgentPolicy.map((policyItem) => (
                    <li key={policyItem.id}>
                      <EuiLink
                        target="_blank"
                        href={getAppUrl({
                          appId: INTEGRATIONS_PLUGIN_ID,
                          path: pagePathGetters.integration_policy_edit({
                            packagePolicyId: policyItem.id,
                          })[1],
                        })}
                        data-test-subj="integrationWithoutAgentPolicyListItem"
                      >
                        {policyItem.name}
                      </EuiLink>
                    </li>
                  ))}
                </ul>

                <FormattedMessage
                  id="xpack.securitySolution.endpoint.list.notAddedIntegrations.visitIntegrations"
                  defaultMessage="You can also view a list of all {integrationPolicies}."
                  values={{
                    integrationPolicies: (
                      <EuiLink
                        target="_blank"
                        href={getAppUrl({
                          appId: INTEGRATIONS_PLUGIN_ID,
                          path: pagePathGetters.integration_details_policies({
                            pkgkey: 'endpoint',
                          })[1],
                        })}
                      >
                        <FormattedMessage
                          id="xpack.securitySolution.endpoint.list.notAddedIntegrations.integrationPolicies"
                          defaultMessage="Elastic Defend integration policies"
                        />
                      </EuiLink>
                    ),
                  }}
                />
              </EuiText>
            </EuiCallOut>
          </>
        ),
      [getAppUrl, policyItemsWithoutAgentPolicy]
    );

    const policySteps = useMemo(
      () => [
        {
          title: i18n.translate('xpack.securitySolution.endpoint.list.stepOneTitle', {
            defaultMessage: 'Select the integration you want to use',
          }),
          children: (
            <>
              <EuiText color="subdued" size="m" grow={false}>
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.list.stepOne"
                  defaultMessage="Select from existing integrations. This can be changed later."
                />
              </EuiText>
              <EuiSpacer size="xxl" />
              <EuiSelectable
                options={selectionOptions}
                singleSelection="always"
                isLoading={loading}
                listProps={{ bordered: true, singleSelection: true }}
                onChange={handleSelectableOnChange}
                data-test-subj="onboardingPolicySelect"
              >
                {(list) => {
                  if (loading) {
                    return (
                      <EuiSelectableMessage>
                        <FormattedMessage
                          id="xpack.securitySolution.endpoint.list.loadingPolicies"
                          defaultMessage="Loading integrations"
                        />
                      </EuiSelectableMessage>
                    );
                  }

                  if (!selectionOptions.length) {
                    return (
                      <EuiCallOut
                        announceOnMount={false}
                        color="warning"
                        data-test-subj="noIntegrationsAddedToAgentPoliciesCallout"
                      >
                        <FormattedMessage
                          id="xpack.securitySolution.endpoint.list.noPoliciesAssignedToAgentPolicies"
                          defaultMessage="There are no Elastic Defend integrations added to Agent policies. To deploy Elastic Defend, add it to an Agent policy."
                        />
                      </EuiCallOut>
                    );
                  }

                  return list;
                }}
              </EuiSelectable>

              {policiesNotAddedToAgentPolicyCallout}
            </>
          ),
        },
        {
          title: i18n.translate('xpack.securitySolution.endpoint.list.stepTwoTitle', {
            defaultMessage: 'Enroll your agents enabled with Elastic Defend through Fleet',
          }),
          status: actionDisabled ? 'disabled' : '',
          children: (
            <EuiFlexGroup alignItems="center">
              <EuiFlexItem>
                <EuiText color="subdued" size="m" grow={false}>
                  <FormattedMessage
                    id="xpack.securitySolution.endpoint.list.stepTwo"
                    defaultMessage="You'll be provided with the necessary commands to get started."
                  />
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  onClick={onActionClick}
                  isDisabled={actionDisabled}
                  data-test-subj="onboardingStartButton"
                >
                  <FormattedMessage
                    id="xpack.securitySolution.endpoint.policyList.emptyCreateNewButton"
                    defaultMessage="Enroll Agent"
                  />
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
      ],
      [
        selectionOptions,
        loading,
        handleSelectableOnChange,
        policiesNotAddedToAgentPolicyCallout,
        actionDisabled,
        onActionClick,
      ]
    );

    return (
      <ManagementEmptyState
        loading={loading}
        dataTestSubj="emptyHostsTable"
        steps={policySteps}
        headerComponent={
          <FormattedMessage
            id="xpack.securitySolution.endpoint.list.noEndpointsPrompt"
            defaultMessage="Next step: Enroll an Agent with Elastic Defend"
          />
        }
        bodyComponent={
          <FormattedMessage
            id="xpack.securitySolution.endpoint.list.noEndpointsInstructions"
            defaultMessage="You've added the Elastic Defend integration. Now enroll your agents using the steps below."
          />
        }
      />
    );
  }
);

const ManagementEmptyState = React.memo<{
  loading: boolean;
  dataTestSubj: string;
  steps?: ManagementStep[];
  headerComponent: JSX.Element;
  bodyComponent: JSX.Element;
}>(({ loading, dataTestSubj, steps, headerComponent, bodyComponent }) => {
  return (
    <div data-test-subj={dataTestSubj}>
      {loading ? (
        <EuiFlexGroup alignItems="center" justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner
              size="xl"
              className="essentialAnimation"
              data-test-subj="management-empty-state-loading-spinner"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <>
          <EuiSpacer size="xxl" />
          <EuiTitle size="m">
            <h2 css={TEXT_ALIGN_CENTER}>{headerComponent}</h2>
          </EuiTitle>
          <EuiSpacer size="xxl" />
          <EuiText textAlign="center" color="subdued" size="m">
            {bodyComponent}
          </EuiText>
          <EuiSpacer size="xxl" />
          {steps && (
            <EuiFlexGroup alignItems="center" justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiSteps steps={steps} data-test-subj={'onboardingSteps'} />
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </>
      )}
    </div>
  );
});

PolicyEmptyState.displayName = 'PolicyEmptyState';
EndpointsEmptyState.displayName = 'HostsEmptyState';
ManagementEmptyState.displayName = 'ManagementEmptyState';

export { PolicyEmptyState, EndpointsEmptyState as HostsEmptyState };
