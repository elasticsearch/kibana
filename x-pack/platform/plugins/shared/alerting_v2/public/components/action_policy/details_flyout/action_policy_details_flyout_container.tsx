/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import type { ActionPolicyResponse, CreateActionPolicyData } from '@kbn/alerting-v2-schemas';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { paths } from '../../../constants';
import { EntityNotFoundFlyout } from '../../entity_not_found_flyout';
import { LoadingFlyout } from '../../loading_flyout';
import { useCreateActionPolicy } from '../../../hooks/use_create_action_policy';
import { useDeleteActionPolicy } from '../../../hooks/use_delete_action_policy';
import { useDisableActionPolicy } from '../../../hooks/use_disable_action_policy';
import { useEnableActionPolicy } from '../../../hooks/use_enable_action_policy';
import { useFetchActionPolicy } from '../../../hooks/use_fetch_action_policy';
import { useSnoozeActionPolicy } from '../../../hooks/use_snooze_action_policy';
import { useUnsnoozeActionPolicy } from '../../../hooks/use_unsnooze_action_policy';
import { useUpdateActionPolicyApiKey } from '../../../hooks/use_update_action_policy_api_key';
import { DeleteActionPolicyConfirmModal } from '../delete_confirmation_modal';
import { UpdateApiKeyConfirmationModal } from '../../../pages/list_action_policies_page/components/update_api_key_confirmation_modal';
import { ActionPolicyDetailsFlyout } from './action_policy_details_flyout';

interface Props {
  policyId: string;
  onClose: () => void;
}

export const ActionPolicyDetailsFlyoutContainer = ({ policyId, onClose }: Props) => {
  const { navigateToUrl } = useService(CoreStart('application'));
  const { basePath } = useService(CoreStart('http'));

  const [policyToDelete, setPolicyToDelete] = useState<ActionPolicyResponse | null>(null);
  const [policyToUpdateApiKey, setPolicyToUpdateApiKey] = useState<string | null>(null);

  const { data: policy, isLoading, isError } = useFetchActionPolicy(policyId);
  const { mutate: createActionPolicy } = useCreateActionPolicy();
  const { mutate: deleteActionPolicy, isLoading: isDeleting } = useDeleteActionPolicy();
  const {
    mutate: enablePolicy,
    isLoading: isEnabling,
    variables: enableVariables,
  } = useEnableActionPolicy();
  const {
    mutate: disablePolicy,
    isLoading: isDisabling,
    variables: disableVariables,
  } = useDisableActionPolicy();
  const { mutate: snoozePolicy } = useSnoozeActionPolicy();
  const { mutate: unsnoozePolicy } = useUnsnoozeActionPolicy();
  const { mutate: updateApiKey, isLoading: isUpdatingApiKey } = useUpdateActionPolicyApiKey();

  const navigateToEdit = (id: string) => {
    onClose();
    navigateToUrl(basePath.prepend(paths.actionPolicyEdit(id)));
  };

  const clonePolicy = (source: ActionPolicyResponse) => {
    const { name, description, destinations, matcher, groupBy, throttle, tags, groupingMode } =
      source;
    const data: CreateActionPolicyData = {
      name: `${name} [clone]`,
      description,
      destinations,
      groupingMode: groupingMode ?? 'per_episode',
      ...(tags != null && { tags }),
      ...(matcher != null && { matcher }),
      ...(groupBy != null && { groupBy }),
      ...(throttle != null && { throttle }),
    };
    createActionPolicy(data);
    onClose();
  };

  if (isLoading) {
    return <LoadingFlyout onClose={onClose} />;
  }

  if (isError || !policy) {
    return (
      <EntityNotFoundFlyout
        title={i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.notFoundTitle', {
          defaultMessage: 'Action policy not found',
        })}
        body={i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.notFoundBody', {
          defaultMessage: 'The policy may have been deleted or you may not have access to it.',
        })}
        onClose={onClose}
      />
    );
  }

  // While a confirmation modal is open, hide the flyout locally so the modal
  // takes the foreground without unmounting the container — the container owns
  // the modal state. We only call `onClose` (which the parent uses to unmount
  // us) once the modal flow ends.
  const isModalOpen = policyToDelete !== null || policyToUpdateApiKey !== null;

  return (
    <>
      {!isModalOpen && (
        <ActionPolicyDetailsFlyout
          policy={policy}
          onClose={onClose}
          onEdit={navigateToEdit}
          onClone={clonePolicy}
          onDelete={setPolicyToDelete}
          onEnable={(id) => enablePolicy(id)}
          onDisable={(id) => disablePolicy(id)}
          onSnooze={(id, until) => snoozePolicy({ id, snoozedUntil: until })}
          onCancelSnooze={(id) => unsnoozePolicy(id)}
          onUpdateApiKey={(id) => setPolicyToUpdateApiKey(id)}
          isStateLoading={
            (isEnabling && enableVariables === policy.id) ||
            (isDisabling && disableVariables === policy.id)
          }
          session={'start'}
          ownFocus={false}
          hasAnimation={false}
        />
      )}
      {policyToDelete && (
        <DeleteActionPolicyConfirmModal
          policyName={policyToDelete.name}
          onCancel={() => {
            setPolicyToDelete(null);
            onClose();
          }}
          onConfirm={() => {
            deleteActionPolicy(policyToDelete.id, {
              onSuccess: () => {
                setPolicyToDelete(null);
                onClose();
              },
            });
          }}
          isLoading={isDeleting}
        />
      )}
      {policyToUpdateApiKey && (
        <UpdateApiKeyConfirmationModal
          count={1}
          onCancel={() => {
            setPolicyToUpdateApiKey(null);
            onClose();
          }}
          onConfirm={() => {
            updateApiKey(policyToUpdateApiKey, {
              onSuccess: () => {
                setPolicyToUpdateApiKey(null);
                onClose();
              },
            });
          }}
          isLoading={isUpdatingApiKey}
        />
      )}
    </>
  );
};
