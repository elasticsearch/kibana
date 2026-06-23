/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiFlyoutProps } from '@elastic/eui';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  type EuiDescriptionListProps,
} from '@elastic/eui';
import type { ActionPolicyResponse } from '@kbn/alerting-v2-schemas';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import moment from 'moment';
import React, { useMemo } from 'react';
import { useBulkGetUserProfiles } from '../../../hooks/use_bulk_get_user_profiles';
import { resolveDisplayName } from '../../../utils/resolve_display_name';
import { ActionPolicyActionsMenu } from '../action_policy_actions_menu';
import { ActionPolicyStateBadge } from '../action_policy_state_badge';
import { isSnoozed } from '../is_snoozed';
import { ActionPolicyDefinitionList } from './action_policy_definition_list';

const FLYOUT_TITLE_ID = 'actionPolicyDetailsFlyoutTitle';
const EMPTY_VALUE = '-';

interface Props {
  policy: ActionPolicyResponse;
  onClose: () => void;
  onEdit: (id: string) => void;
  onClone: (policy: ActionPolicyResponse) => void;
  onDelete: (policy: ActionPolicyResponse) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onSnooze: (id: string, snoozedUntil: string) => void;
  onCancelSnooze: (id: string) => void;
  onUpdateApiKey: (id: string) => void;
  isStateLoading?: boolean;
  session?: EuiFlyoutProps['session'];
  ownFocus?: EuiFlyoutProps['ownFocus'];
  hasAnimation?: EuiFlyoutProps['hasAnimation'];
}

export const ActionPolicyDetailsFlyout = ({
  policy,
  onClose,
  onEdit,
  onClone,
  onDelete,
  onEnable,
  onDisable,
  onSnooze,
  onCancelSnooze,
  onUpdateApiKey,
  isStateLoading = false,
  session,
  ownFocus = true,
  hasAnimation = true,
}: Props) => {
  const settings = useService(CoreStart('settings'));
  const dateTimeFormat = settings.client.get<string>('dateFormat');
  const formatDate = (value: string) => moment(value).format(dateTimeFormat);

  const metadataUids = useMemo(
    () => [policy.createdBy, policy.updatedBy].filter((uid): uid is string => Boolean(uid)),
    [policy.createdBy, policy.updatedBy]
  );

  const { data: profileByUid } = useBulkGetUserProfiles({ uids: metadataUids });

  const snoozedActive = isSnoozed(policy.snoozedUntil);

  const handleEdit = () => {
    onClose();
    onEdit(policy.id);
  };

  const handleClone = (p: ActionPolicyResponse) => {
    onClone(p);
  };

  const handleDelete = (p: ActionPolicyResponse) => {
    onDelete(p);
  };

  const handleUpdateApiKey = (id: string) => {
    onUpdateApiKey(id);
  };

  const metadataItems: EuiDescriptionListProps['listItems'] = [
    {
      title: i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.metadata.createdBy', {
        defaultMessage: 'Created by',
      }),
      description: resolveDisplayName(policy.createdBy, profileByUid, EMPTY_VALUE),
    },
    {
      title: i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.metadata.createdAt', {
        defaultMessage: 'Created at',
      }),
      description: formatDate(policy.createdAt),
    },
    {
      title: i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.metadata.updatedBy', {
        defaultMessage: 'Updated by',
      }),
      description: resolveDisplayName(policy.updatedBy, profileByUid, EMPTY_VALUE),
    },
    {
      title: i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.metadata.updatedAt', {
        defaultMessage: 'Updated at',
      }),
      description: formatDate(policy.updatedAt),
    },
  ];

  return (
    <EuiFlyout
      type="push"
      hasAnimation={hasAnimation}
      size="s"
      ownFocus={ownFocus}
      session={session}
      hideCloseButton
      paddingSize="none"
      onClose={onClose}
      aria-labelledby={FLYOUT_TITLE_ID}
      data-test-subj="actionPolicyDetailsFlyout"
    >
      <EuiPanel
        paddingSize="xs"
        hasShadow={false}
        hasBorder={false}
        borderRadius="none"
        color="transparent"
      >
        <EuiFlexGroup
          justifyContent="flexEnd"
          gutterSize="s"
          responsive={false}
          alignItems="center"
        >
          <EuiFlexItem grow={false}>
            <ActionPolicyActionsMenu
              policy={policy}
              onClone={handleClone}
              onDelete={handleDelete}
              onEnable={onEnable}
              onDisable={onDisable}
              onSnooze={onSnooze}
              onCancelSnooze={onCancelSnooze}
              onUpdateApiKey={handleUpdateApiKey}
              isStateLoading={isStateLoading}
              data-test-subj="detailsFlyoutActionsMenuButton"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate('xpack.alertingV2.actionPolicy.detailsFlyout.closeIcon', {
                defaultMessage: 'Close',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                iconType="cross"
                color="text"
                onClick={onClose}
                aria-label={i18n.translate(
                  'xpack.alertingV2.actionPolicy.detailsFlyout.closeIcon',
                  {
                    defaultMessage: 'Close',
                  }
                )}
                data-test-subj="detailsFlyoutCloseIcon"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      <EuiHorizontalRule margin="none" />
      <EuiFlyoutBody>
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
        >
          <EuiTitle size="s" id={FLYOUT_TITLE_ID}>
            <h2 data-test-subj="actionPolicyDetailsFlyoutTitle">{policy.name}</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <ActionPolicyStateBadge policy={policy} isLoading={false} />
            </EuiFlexItem>
            {snoozedActive && policy.snoozedUntil && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="accent" iconType="bellSlash">
                  <FormattedMessage
                    id="xpack.alertingV2.actionPolicy.detailsFlyout.snoozedUntil"
                    defaultMessage="Snoozed until {date}"
                    values={{ date: formatDate(policy.snoozedUntil) }}
                  />
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiPanel>
        <EuiHorizontalRule margin="xs" />
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
        >
          <EuiTitle size="xs">
            <h3>
              <FormattedMessage
                id="xpack.alertingV2.actionPolicy.detailsFlyout.actionPolicy.title"
                defaultMessage="Definition"
              />
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <ActionPolicyDefinitionList policy={policy} />
          <EuiHorizontalRule />
          <EuiTitle size="xs">
            <h3>
              <FormattedMessage
                id="xpack.alertingV2.actionPolicy.detailsFlyout.metadata.title"
                defaultMessage="Metadata"
              />
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiDescriptionList compressed type="column" listItems={metadataItems} />
        </EuiPanel>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
        >
          <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                onClick={onClose}
                data-test-subj="detailsFlyoutCloseButton"
                iconType="cross"
              >
                <FormattedMessage
                  id="xpack.alertingV2.actionPolicy.detailsFlyout.close"
                  defaultMessage="Close"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                iconType="pencil"
                onClick={handleEdit}
                data-test-subj="detailsFlyoutEditButton"
                aria-label={i18n.translate(
                  'xpack.alertingV2.actionPolicy.detailsFlyout.edit.ariaLabel',
                  { defaultMessage: 'Edit this action policy' }
                )}
              >
                <FormattedMessage
                  id="xpack.alertingV2.actionPolicy.detailsFlyout.edit"
                  defaultMessage="Edit"
                />
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
