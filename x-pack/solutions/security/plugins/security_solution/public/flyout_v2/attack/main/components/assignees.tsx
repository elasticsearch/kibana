/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useCallback, useMemo, useState } from 'react';

import {
  EuiButtonIcon,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { isNonLocalIndexName } from '@kbn/es-query';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { ALERT_WORKFLOW_ASSIGNEE_IDS } from '@kbn/rule-data-utils';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { UsersAvatarsPanel } from '../../../../common/components/user_profiles/users_avatars_panel';
import { useBulkGetUserProfiles } from '../../../../common/components/user_profiles/use_bulk_get_user_profiles';
import { useLicense } from '../../../../common/hooks/use_license';
import { useUpsellingMessage } from '../../../../common/hooks/use_upselling';
import { useAttackAssigneesContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useAttacksPrivileges } from '../../../../detections/hooks/attacks/bulk_actions/use_attacks_privileges';
import { useInvalidateFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { FlyoutHeaderBlock } from '../../../shared/components/flyout_header_block';
import {
  HEADER_ASSIGNEES_BLOCK_TEST_ID,
  HEADER_ASSIGNEES_TEST_ID,
  HEADER_ASSIGNEES_EMPTY_TEST_ID,
  HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID,
} from '../constants/test_ids';

const FIELD_ALERT_IDS = 'kibana.alert.attack_discovery.alert_ids' as const;

export interface AssigneesProps {
  /**
   * The attack document. All required data (attackId, alertIds, assignees, indexName) is read from here.
   */
  hit: DataTableRecord;
  /**
   * Called after assignees are successfully updated. Should trigger any necessary data refresh.
   */
  onAttackUpdated: () => void;
}

const AssigneesButton: FC<{
  isDisabled: boolean;
  toolTipMessage: string;
  onClick: () => void;
}> = memo(({ onClick, isDisabled, toolTipMessage }) => (
  <EuiToolTip position="bottom" content={toolTipMessage}>
    <EuiButtonIcon
      aria-label={i18n.translate(
        'xpack.securitySolution.flyoutV2.attack.header.assignees.ariaLabel',
        { defaultMessage: 'Update assignees' }
      )}
      data-test-subj={HEADER_ASSIGNEES_ADD_BUTTON_TEST_ID}
      iconType="plusCircle"
      onClick={onClick}
      isDisabled={isDisabled}
    />
  </EuiToolTip>
));
AssigneesButton.displayName = 'AssigneesButton';

/**
 * Displays the list of users assigned to the attack and provides a popover to manage them.
 */
export const Assignees = memo(({ hit, onAttackUpdated }: AssigneesProps) => {
  const attackId = useMemo(() => hit.raw._id ?? (getFieldValue(hit, '_id') as string) ?? '', [hit]);
  const isRemoteDocument = useMemo(
    () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
    [hit]
  );

  const alertIds = useMemo(() => {
    const value = hit.flattened[FIELD_ALERT_IDS];
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return [...new Set(arr as string[])];
  }, [hit]);

  const assignees = useMemo(() => {
    const value = hit.flattened[ALERT_WORKFLOW_ASSIGNEE_IDS];
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr as string[];
  }, [hit]);

  const invalidateFindAttackDiscoveries = useInvalidateFindAttackDiscoveries();
  const { hasIndexWrite, hasAttackIndexWrite, loading: privilegesLoading } = useAttacksPrivileges();
  const isPlatinumPlus = useLicense().isPlatinumPlus();
  const upsellingMessage = useUpsellingMessage('alert_assignments');

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const assigneesTitleId = useGeneratedHtmlId();

  const attacksWithAssignees = useMemo(
    () => [{ attackId, relatedAlertIds: alertIds, assignees }],
    [attackId, alertIds, assignees]
  );

  const onSuccess = useCallback(() => {
    onAttackUpdated();
    invalidateFindAttackDiscoveries();
  }, [onAttackUpdated, invalidateFindAttackDiscoveries]);

  const { items, panels } = useAttackAssigneesContextMenuItems({
    attacksWithAssignees,
    closePopover,
    onSuccess,
    telemetrySource: 'attacks_page_flyout_header',
  });

  const uids = useMemo(() => new Set(assignees), [assignees]);
  const { data: assignedUsers } = useBulkGetUserProfiles({ uids });

  const hasPermission =
    Boolean(hasIndexWrite) && Boolean(hasAttackIndexWrite) && isPlatinumPlus && !privilegesLoading;

  const toolTipMessage =
    upsellingMessage ??
    i18n.translate('xpack.securitySolution.flyoutV2.attack.header.assignees.popoverTooltip', {
      defaultMessage: 'Assign attack',
    });

  const button = useMemo(
    () => (
      <AssigneesButton
        onClick={togglePopover}
        isDisabled={isRemoteDocument}
        toolTipMessage={toolTipMessage}
      />
    ),
    [togglePopover, toolTipMessage, isRemoteDocument]
  );

  return (
    <FlyoutHeaderBlock
      hasBorder
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.header.assigneesTitle"
          defaultMessage="Assignees"
        />
      }
      data-test-subj={HEADER_ASSIGNEES_BLOCK_TEST_ID}
    >
      {!hasPermission ? (
        <div data-test-subj={HEADER_ASSIGNEES_EMPTY_TEST_ID}>{getEmptyTagValue()}</div>
      ) : (
        <EuiFlexGroup
          gutterSize="none"
          responsive={false}
          data-test-subj={HEADER_ASSIGNEES_TEST_ID}
        >
          {assignedUsers && assignedUsers.length > 0 && (
            <EuiFlexItem grow={false}>
              <UsersAvatarsPanel userProfiles={assignedUsers} maxVisibleAvatars={2} />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-labelledby={assigneesTitleId}
              button={button}
              isOpen={isPopoverOpen}
              closePopover={closePopover}
              panelPaddingSize="none"
              data-test-subj="attack-flyout-v2-header-assignees-popover"
            >
              <EuiPopoverTitle id={assigneesTitleId} paddingSize="m">
                {i18n.translate(
                  'xpack.securitySolution.flyoutV2.attack.header.assignees.popoverTitle',
                  {
                    defaultMessage: 'Manage assignees',
                  }
                )}
              </EuiPopoverTitle>
              <EuiContextMenu
                panels={[{ id: 0, items }, ...panels]}
                initialPanelId={0}
                data-test-subj="attack-flyout-v2-header-assignees-context-menu"
              />
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </FlyoutHeaderBlock>
  );
});

Assignees.displayName = 'Assignees';
