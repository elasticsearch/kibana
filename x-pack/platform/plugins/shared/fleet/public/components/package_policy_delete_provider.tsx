/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import {
  EuiCallOut,
  EuiConfirmModal,
  EuiSpacer,
  EuiIconTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import {
  useStartServices,
  useConfig,
  sendGetAgents,
  useMultipleAgentPolicies,
  useDeletePackagePolicyMutation,
  sendDeletePackageDatastreamAssets,
} from '../hooks';
import { AGENTS_PREFIX, FLEET_SERVER_PACKAGE } from '../../common/constants';
import type { AgentPolicy, PackagePolicyPackage } from '../types';
import { sendDeleteAgentlessPolicy } from '../hooks/use_request/agentless_policy';

interface Props {
  agentPolicies?: AgentPolicy[];
  from?: 'fleet-policy-list' | 'installed-integrations' | undefined;
  packagePolicyPackage?: PackagePolicyPackage;
  isAgentlessPolicy?: boolean | null;
  children: (deletePackagePoliciesPrompt: DeletePackagePoliciesPrompt) => React.ReactElement;
}

export type DeletePackagePoliciesPrompt = (
  packagePoliciesToDelete: string[],
  onSuccess?: OnSuccessCallback
) => void;

type OnSuccessCallback = (packagePoliciesDeleted: string[]) => void;

export const PackagePolicyDeleteProvider: React.FunctionComponent<Props> = ({
  agentPolicies,
  from,
  children,
  packagePolicyPackage,
  isAgentlessPolicy,
}) => {
  const { notifications } = useStartServices();
  const {
    agents: { enabled: isFleetEnabled },
  } = useConfig();
  const [packagePolicies, setPackagePolicies] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isLoadingAgentsCount, setIsLoadingAgentsCount] = useState<boolean>(false);
  const [agentsCount, setAgentsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const onSuccessCallback = useRef<OnSuccessCallback | null>(null);
  const { canUseMultipleAgentPolicies } = useMultipleAgentPolicies();

  const { mutateAsync: deletePackagePolicyMutationAsync } = useDeletePackagePolicyMutation();
  const isShared = useMemo(() => {
    if (agentPolicies?.length !== 1) {
      return false;
    }
    const packagePolicy = agentPolicies[0].package_policies?.find(
      (policy) => policy.id === packagePolicies[0]
    );
    return (packagePolicy?.policy_ids?.length ?? 0) > 1;
  }, [agentPolicies, packagePolicies]);

  const hasMultipleAgentPolicies =
    canUseMultipleAgentPolicies && agentPolicies && agentPolicies.length > 1;

  const isDeletingFleetServer = packagePolicyPackage?.name === FLEET_SERVER_PACKAGE;

  const fetchAgentsCount = useMemo(
    () => async () => {
      if (isLoadingAgentsCount || !isFleetEnabled || !agentPolicies) {
        return;
      }
      setIsLoadingAgentsCount(true);

      const kuery = `(${agentPolicies
        .map((policy) => `${AGENTS_PREFIX}.policy_id:"${policy.id}"`)
        .join(' or ')})`;

      const request = await sendGetAgents({
        kuery,
        showInactive: true,
      });
      setAgentsCount(request.data?.total || 0);
      setIsLoadingAgentsCount(false);
    },
    [agentPolicies, isFleetEnabled, isLoadingAgentsCount]
  );

  const deletePackagePoliciesPrompt = useMemo(
    (): DeletePackagePoliciesPrompt =>
      (packagePoliciesToDelete, onSuccess = () => undefined) => {
        if (!Array.isArray(packagePoliciesToDelete) || packagePoliciesToDelete.length === 0) {
          throw new Error('No package policies specified for deletion');
        }
        setIsModalOpen(true);
        setPackagePolicies(packagePoliciesToDelete);
        fetchAgentsCount();
        onSuccessCallback.current = onSuccess;
      },
    [fetchAgentsCount]
  );

  const closeModal = useMemo(
    () => () => {
      setPackagePolicies([]);
      setIsLoading(false);
      setIsLoadingAgentsCount(false);
      setIsModalOpen(false);
    },
    []
  );

  const agentPoliciesNamesList = useMemo(
    () => agentPolicies?.map((p) => p.name).join(', '),
    [agentPolicies]
  );
  const deletePackagePolicies = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isAgentlessPolicy) {
        for (const policyId of packagePolicies) {
          await sendDeleteAgentlessPolicy(policyId);
          notifications.toasts.addSuccess(
            i18n.translate('xpack.fleet.deletePackagePolicy.successSingleNotificationTitle', {
              defaultMessage: "Deleted integration ''{id}''",
              values: { id: policyId },
            })
          );
        }

        if (onSuccessCallback.current) {
          onSuccessCallback.current(packagePolicies);
        }
      } else {
        /**
         * Try to delete assets if there are any
         */
        if (packagePolicyPackage?.type === 'input') {
          const assetsData = await sendDeletePackageDatastreamAssets(
            { pkgName: packagePolicyPackage?.name, pkgVersion: packagePolicyPackage?.version },
            { packagePolicyId: packagePolicies[0] }
          );
          if (assetsData?.error?.message) {
            notifications.toasts.addDanger(`Error: ${assetsData.error.message}`);
          }
        }

        const data = await deletePackagePolicyMutationAsync({ packagePolicyIds: packagePolicies });
        const successfulResults = data?.filter((result) => result.success) || [];
        const failedResults = data?.filter((result) => !result.success) || [];

        if (successfulResults.length) {
          const hasMultipleSuccesses = successfulResults.length > 1;
          const successMessage = hasMultipleSuccesses
            ? i18n.translate('xpack.fleet.deletePackagePolicy.successMultipleNotificationTitle', {
                defaultMessage: 'Deleted {count} integrations',
                values: { count: successfulResults.length },
              })
            : i18n.translate('xpack.fleet.deletePackagePolicy.successSingleNotificationTitle', {
                defaultMessage: "Deleted integration ''{id}''",
                values: { id: successfulResults[0].name || successfulResults[0].id },
              });

          notifications.toasts.addSuccess(successMessage);
        }

        if (failedResults.length) {
          const hasMultipleFailures = failedResults.length > 1;
          const failureMessage = hasMultipleFailures
            ? i18n.translate('xpack.fleet.deletePackagePolicy.failureMultipleNotificationTitle', {
                defaultMessage: 'Error deleting {count} integrations',
                values: { count: failedResults.length },
              })
            : i18n.translate('xpack.fleet.deletePackagePolicy.failureSingleNotificationTitle', {
                defaultMessage: "Error deleting integration ''{id}''",
                values: { id: failedResults[0].id },
              });
          notifications.toasts.addDanger(failureMessage);
        }

        if (onSuccessCallback.current) {
          onSuccessCallback.current(successfulResults.map((result) => result.id));
        }
      }
    } catch (e) {
      notifications.toasts.addDanger(
        i18n.translate('xpack.fleet.deletePackagePolicy.fatalErrorNotificationTitle', {
          defaultMessage: `Error deleting integration`,
        })
      );
    }
    closeModal();
  }, [
    packagePolicies,
    closeModal,
    deletePackagePolicyMutationAsync,
    packagePolicyPackage,
    notifications.toasts,
    isAgentlessPolicy,
  ]);

  const modalTitleId = useGeneratedHtmlId();

  const renderModal = () => {
    const isAgentlessAgentPolicy = agentPolicies?.find(
      (policy) => policy?.supports_agentless === true
    );
    const packagePolicy = agentPolicies?.[0]?.package_policies?.find(
      (policy) => policy.id === packagePolicies[0]
    );
    if (!isModalOpen) {
      return null;
    }

    return (
      <EuiConfirmModal
        aria-labelledby={modalTitleId}
        titleProps={{ id: modalTitleId }}
        title={
          isAgentlessAgentPolicy ? (
            <FormattedMessage
              id="xpack.fleet.deletePackagePolicy.confirmModal.agentlessTitle"
              defaultMessage="You’re about to delete an integration"
            />
          ) : (
            <FormattedMessage
              id="xpack.fleet.deletePackagePolicy.confirmModal.deleteMultipleTitle"
              defaultMessage="Delete {count, plural, one {integration} other {# integrations}}?"
              values={{ count: packagePolicies.length }}
            />
          )
        }
        onCancel={closeModal}
        onConfirm={deletePackagePolicies}
        cancelButtonText={
          <FormattedMessage
            id="xpack.fleet.deletePackagePolicy.confirmModal.cancelButtonLabel"
            defaultMessage="Cancel"
          />
        }
        confirmButtonText={
          isLoading || isLoadingAgentsCount ? (
            <FormattedMessage
              id="xpack.fleet.deletePackagePolicy.confirmModal.loadingButtonLabel"
              defaultMessage="Loading…"
            />
          ) : (
            <FormattedMessage
              id="xpack.fleet.deletePackagePolicy.confirmModal.confirmButtonLabel"
              defaultMessage="Delete {agentPoliciesCount, plural, one {integration} other {integrations}}"
              values={{
                agentPoliciesCount: packagePolicies.length,
              }}
            />
          )
        }
        buttonColor="danger"
        confirmButtonDisabled={isLoading || isLoadingAgentsCount}
      >
        {isDeletingFleetServer && (
          <>
            <EuiCallOut
              announceOnMount={false}
              color="danger"
              iconType="warning"
              title={
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.confirmModal.fleetServerWarningTitle"
                  defaultMessage="This may disconnect agents from Fleet"
                />
              }
              data-test-subj="fleetServerDeleteCallOut"
            >
              <FormattedMessage
                id="xpack.fleet.deletePackagePolicy.confirmModal.fleetServerWarningMessage"
                defaultMessage="If this policy is assigned to any Fleet Servers, deleting the Fleet Server integration will stop them from running. Agents that depend on those Fleet Servers will lose their connection to Fleet — you won't be able to manage them or send policy updates until you re-enroll each agent individually."
              />
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}
        {packagePolicyPackage?.type === 'input' && (
          <>
            <EuiCallOut
              announceOnMount={false}
              color="warning"
              iconType="warning"
              title={
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.confirmModal.inputPackage.message"
                  defaultMessage="This action will also remove the installed assets"
                />
              }
              data-test-subj="InputPackageCallOut"
            />
            <EuiSpacer size="m" />
          </>
        )}
        {(hasMultipleAgentPolicies || isShared) && (
          <>
            <EuiCallOut
              announceOnMount={false}
              color="warning"
              iconType="warning"
              title={
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.confirmModal.warningMultipleAgentPolicies"
                  defaultMessage="This integration is shared by multiple agent policies."
                />
              }
              data-test-subj="sharedAgentPolicyCallOut"
            />
            <EuiSpacer size="m" />
          </>
        )}

        {isLoadingAgentsCount ? (
          <FormattedMessage
            id="xpack.fleet.deletePackagePolicy.confirmModal.loadingAgentsCountMessage"
            defaultMessage="Checking affected agents…"
          />
        ) : agentsCount && agentPolicies ? (
          <>
            <EuiCallOut
              announceOnMount={false}
              color="danger"
              data-test-subj="affectedAgentsCallOut"
              title={
                !isAgentlessAgentPolicy && (
                  <FormattedMessage
                    id="xpack.fleet.deletePackagePolicy.confirmModal.affectedAgentsTitle"
                    defaultMessage="This action will affect {agentsCount} {agentsCount, plural, one {agent} other {agents}}."
                    values={{ agentsCount }}
                  />
                )
              }
            >
              {hasMultipleAgentPolicies && !isAgentlessAgentPolicy && (
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.confirmModal.affectedAgentPoliciesMessage"
                  defaultMessage="Fleet has detected that the related agent policies {toolTip} are already in use by some of your agents."
                  values={{
                    toolTip: (
                      <EuiIconTip
                        type="info"
                        iconProps={{
                          className: 'eui-alignTop',
                        }}
                        content={
                          <FormattedMessage
                            id="xpack.fleet.fleetServerSetup.affectedAgentsMessageTooltips"
                            defaultMessage="{policies}"
                            values={{ policies: agentPoliciesNamesList }}
                          />
                        }
                        position="top"
                      />
                    ),
                  }}
                />
              )}{' '}
              {!hasMultipleAgentPolicies && !isAgentlessAgentPolicy && (
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.confirmModal.affectedAgentsMessage"
                  defaultMessage="Fleet has detected that {agentPolicyName} is already in use by some of your agents."
                  values={{
                    agentPolicyName: <strong>{agentPolicies[0]?.name}</strong>,
                  }}
                />
              )}
              {!hasMultipleAgentPolicies && isAgentlessAgentPolicy && (
                <FormattedMessage
                  id="xpack.fleet.deletePackagePolicy.agentless.confirmModal.message"
                  defaultMessage="Deleting {packagePolicyName} integration will stop data ingestion."
                  values={{
                    packagePolicyName: <strong>{packagePolicy?.name}</strong>,
                  }}
                />
              )}
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        ) : null}

        {!isLoadingAgentsCount && (
          <FormattedMessage
            id="xpack.fleet.deletePackagePolicy.confirmModal.generalMessage"
            defaultMessage="This action can not be undone. Are you sure you wish to continue?"
          />
        )}
      </EuiConfirmModal>
    );
  };

  return (
    <Fragment>
      {children(deletePackagePoliciesPrompt)}
      {renderModal()}
    </Fragment>
  );
};
