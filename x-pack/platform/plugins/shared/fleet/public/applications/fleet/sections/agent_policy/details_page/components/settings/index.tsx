/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useState } from 'react';
import deepEqual from 'fast-deep-equal';
import styled from 'styled-components';
import { pick, uniqBy } from 'lodash';
import {
  EuiBottomBar,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButton,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { useHistory } from 'react-router-dom';

import { ensurePackageKibanaAssetsInstalled } from '../../../../../services/ensure_kibana_assets_installed';

import { useSpaceSettingsContext } from '../../../../../../../hooks/use_space_settings_context';
import type { AgentPolicy } from '../../../../../types';
import {
  useStartServices,
  useAuthz,
  sendUpdateAgentPolicyForRq,
  useConfig,
  sendGetAgentStatus,
  useAgentPolicyRefresh,
  useBreadcrumbs,
  useFleetStatus,
  useLink,
} from '../../../../../hooks';
import {
  AgentPolicyForm,
  agentPolicyFormValidation,
  ConfirmDeployAgentPolicyModal,
} from '../../../components';
import { DevtoolsRequestFlyoutButton } from '../../../../../components';
import { generateUpdateAgentPolicyDevToolsRequest } from '../../../services';
import { UNKNOWN_SPACE } from '../../../../../../../../common/constants';

const pickAgentPolicyKeysToSend = (agentPolicy: AgentPolicy) => {
  const partialPolicy = pick(agentPolicy, [
    'name',
    'description',
    'namespace',
    'monitoring_enabled',
    'unenroll_timeout',
    'inactivity_timeout',
    'data_output_id',
    'monitoring_output_id',
    'download_source_id',
    'download_source_ids',
    'fleet_server_host_id',
    'agent_features',
    'is_protected',
    'advanced_settings',
    'global_data_tags',
    'monitoring_pprof_enabled',
    'monitoring_http',
    'monitoring_diagnostics',
  ]);
  return {
    ...partialPolicy,
    ...(!agentPolicy.space_ids?.includes(UNKNOWN_SPACE) && {
      space_ids: agentPolicy.space_ids,
    }),
  };
};

const FormWrapper = styled.div`
  max-width: 1200px;
  margin-right: auto;
  margin-left: auto;
`;

export const SettingsView = memo<{ agentPolicy: AgentPolicy }>(
  ({ agentPolicy: originalAgentPolicy }) => {
    useBreadcrumbs('policy_details', { policyName: originalAgentPolicy.name });
    const { notifications } = useStartServices();
    const { spaceId } = useFleetStatus();
    const {
      agents: { enabled: isFleetEnabled },
    } = useConfig();
    const { getPath } = useLink();
    const hasAllAgentPoliciesPrivileges = useAuthz().fleet.allAgentPolicies;
    const refreshAgentPolicy = useAgentPolicyRefresh();
    const [agentPolicy, setAgentPolicy] = useState<AgentPolicy>({
      ...originalAgentPolicy,
    });
    const history = useHistory();
    const spaceSettings = useSpaceSettingsContext();

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [hasChanges, setHasChanges] = useState<boolean>(false);
    const [agentCount, setAgentCount] = useState<number>(0);
    const [withSysMonitoring, setWithSysMonitoring] = useState<boolean>(true);
    const validation = agentPolicyFormValidation(agentPolicy, {
      allowedNamespacePrefixes: spaceSettings?.allowedNamespacePrefixes,
    });
    const [hasAdvancedSettingsErrors, setHasAdvancedSettingsErrors] = useState<boolean>(false);
    const [hasInvalidSpaceError, setInvalidSpaceError] = useState<boolean>(false);

    const updateAgentPolicy = (updatedFields: Partial<AgentPolicy>) => {
      setAgentPolicy({
        ...agentPolicy,
        ...updatedFields,
      });
      setHasChanges(true);
    };

    const submitUpdateAgentPolicy = async () => {
      setIsLoading(true);
      try {
        const dataToSend = pickAgentPolicyKeysToSend(agentPolicy);
        await sendUpdateAgentPolicyForRq(agentPolicy.id, pickAgentPolicyKeysToSend(agentPolicy));

        if (
          dataToSend.space_ids &&
          !deepEqual(originalAgentPolicy.space_ids, dataToSend.space_ids)
        ) {
          const packages = uniqBy(
            originalAgentPolicy.package_policies
              ?.map((pp) =>
                pp.package
                  ? { pkgName: pp.package.name, pkgVersion: pp.package.version }
                  : undefined
              )
              .filter(
                (p): p is { pkgName: string; pkgVersion: string } => typeof p !== 'undefined'
              ) ?? [],
            'pkgName'
          );
          for (const { pkgName, pkgVersion } of packages) {
            await ensurePackageKibanaAssetsInstalled({
              spaceIds: dataToSend.space_ids,
              pkgName,
              pkgVersion,
              toasts: notifications.toasts,
            });
          }
        }

        notifications.toasts.addSuccess(
          i18n.translate('xpack.fleet.editAgentPolicy.successNotificationTitle', {
            defaultMessage: "Successfully updated ''{name}'' settings",
            values: { name: agentPolicy.name },
          })
        );

        if (agentPolicy.space_ids && !agentPolicy.space_ids.includes(spaceId ?? DEFAULT_SPACE_ID)) {
          history.replace(getPath('policies_list'));
        } else {
          refreshAgentPolicy();
          setHasChanges(false);
        }
      } catch (error) {
        notifications.toasts.addError(error, {
          title: i18n.translate('xpack.fleet.editAgentPolicy.errorNotificationTitle', {
            defaultMessage: 'Unable to update agent policy',
          }),
        });
      }
      setIsLoading(false);
    };

    const devtoolRequest = useMemo(
      () =>
        generateUpdateAgentPolicyDevToolsRequest(
          agentPolicy.id,
          pickAgentPolicyKeysToSend(agentPolicy)
        ),
      [agentPolicy]
    );

    const onSubmit = async () => {
      // Retrieve agent count if fleet is enabled
      if (isFleetEnabled) {
        setIsLoading(true);
        const { data } = await sendGetAgentStatus({ policyId: agentPolicy.id });
        if (data?.results.active) {
          setAgentCount(data.results.active);
        } else {
          await submitUpdateAgentPolicy();
        }
      } else {
        await submitUpdateAgentPolicy();
      }
    };

    return (
      <FormWrapper>
        {agentCount ? (
          <ConfirmDeployAgentPolicyModal
            agentCount={agentCount}
            agentPolicies={[agentPolicy]}
            onConfirm={() => {
              setAgentCount(0);
              submitUpdateAgentPolicy();
            }}
            onCancel={() => {
              setAgentCount(0);
              setIsLoading(false);
            }}
          />
        ) : null}
        <AgentPolicyForm
          agentPolicy={agentPolicy}
          updateAgentPolicy={updateAgentPolicy}
          withSysMonitoring={withSysMonitoring}
          updateSysMonitoring={(newValue) => setWithSysMonitoring(newValue)}
          validation={validation}
          isEditing={true}
          updateAdvancedSettingsHasErrors={setHasAdvancedSettingsErrors}
          setInvalidSpaceError={setInvalidSpaceError}
        />

        {hasChanges ? (
          <>
            <EuiSpacer size="xl" />
            <EuiSpacer size="xl" />
            <EuiBottomBar>
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem>
                  <FormattedMessage
                    id="xpack.fleet.editAgentPolicy.unsavedChangesText"
                    defaultMessage="You have unsaved changes"
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        color="text"
                        onClick={() => {
                          setAgentPolicy({ ...originalAgentPolicy });
                          setHasChanges(false);
                        }}
                      >
                        <FormattedMessage
                          id="xpack.fleet.editAgentPolicy.cancelButtonText"
                          defaultMessage="Cancel"
                        />
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <DevtoolsRequestFlyoutButton
                        isDisabled={
                          isLoading ||
                          Object.keys(validation).length > 0 ||
                          hasAdvancedSettingsErrors ||
                          hasInvalidSpaceError
                        }
                        btnProps={{
                          color: 'text',
                        }}
                        description={i18n.translate(
                          'xpack.fleet.editAgentPolicy.devtoolsRequestDescription',
                          {
                            defaultMessage: 'This Kibana request updates an agent policy.',
                          }
                        )}
                        request={devtoolRequest}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        onClick={onSubmit}
                        isLoading={isLoading}
                        isDisabled={
                          !hasAllAgentPoliciesPrivileges ||
                          isLoading ||
                          Object.keys(validation).length > 0 ||
                          hasAdvancedSettingsErrors ||
                          hasInvalidSpaceError
                        }
                        data-test-subj="agentPolicyDetailsSaveButton"
                        iconType="save"
                        color="primary"
                        fill
                      >
                        {isLoading ? (
                          <FormattedMessage
                            id="xpack.fleet.editAgentPolicy.savingButtonText"
                            defaultMessage="Saving…"
                          />
                        ) : (
                          <FormattedMessage
                            id="xpack.fleet.editAgentPolicy.saveButtonText"
                            defaultMessage="Save changes"
                          />
                        )}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiBottomBar>
          </>
        ) : null}
      </FormWrapper>
    );
  }
);
