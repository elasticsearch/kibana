/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { noop } from 'lodash';
import type { FC } from 'react';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { type DataTableRecord, getFieldValue } from '@kbn/discover-utils';
import { isNonLocalIndexName } from '@kbn/es-query';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { ALERT_WORKFLOW_ASSIGNEE_IDS } from '@kbn/rule-data-utils';
import { ASSIGNEES_PANEL_WIDTH } from '../../../../common/components/assignees/constants';
import type { AssigneesApplyPanelProps } from '../../../../common/components/assignees/assignees_apply_panel';
import { AssigneesApplyPanel } from '../../../../common/components/assignees/assignees_apply_panel';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { useLicense } from '../../../../common/hooks/use_license';
import { useUpsellingMessage } from '../../../../common/hooks/use_upselling';
import { useBulkGetUserProfiles } from '../../../../common/components/user_profiles/use_bulk_get_user_profiles';
import { UsersAvatarsPanel } from '../../../../common/components/user_profiles/users_avatars_panel';
import { useSetAlertAssignees } from '../../../../common/components/toolbar/bulk_actions/use_set_alert_assignees';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { FlyoutHeaderBlock } from '../../../shared/components/flyout_header_block';
import {
  ASSIGNEES_ADD_BUTTON_TEST_ID,
  ASSIGNEES_EMPTY_TEST_ID,
  ASSIGNEES_TEST_ID,
  ASSIGNEES_TITLE_TEST_ID,
} from './test_ids';

const UpdateAssigneesButton: FC<{
  isDisabled: boolean;
  toolTipMessage: string;
  togglePopover: () => void;
}> = memo(({ togglePopover, isDisabled, toolTipMessage }) => (
  <EuiToolTip position="bottom" content={toolTipMessage}>
    <EuiButtonIcon
      aria-label="Update assignees"
      data-test-subj={ASSIGNEES_ADD_BUTTON_TEST_ID}
      iconType={'plusCircle'}
      onClick={togglePopover}
      isDisabled={isDisabled}
    />
  </EuiToolTip>
));
UpdateAssigneesButton.displayName = 'UpdateAssigneesButton';

export interface AssigneesProps {
  /**
   * Document to display assignees for.
   */
  hit: DataTableRecord;
  /**
   * Callback fired after the assignees update succeeds.
   * Used by the legacy flyout to refetch its context-backed data.
   */
  onAlertUpdated: () => void;
  /**
   * Boolean to indicate whether to show assignees.
   */
  showAssignees?: boolean;
}

/**
 * Renders the assignees section in the document flyout header.
 */
export const Assignees = memo(({ hit, onAlertUpdated, showAssignees = true }: AssigneesProps) => {
  const eventId = useMemo(() => hit.raw._id ?? '', [hit]);
  const isRemoteDocument = useMemo(
    () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
    [hit]
  );
  const initialAssignedUserIds = useMemo(() => {
    const value = hit.flattened[ALERT_WORKFLOW_ASSIGNEE_IDS] as string[] | string | null;

    if (Array.isArray(value)) {
      return value;
    }

    return value ? [value] : [];
  }, [hit]);
  const [assignedUserIds, setAssignedUserIds] = useState(initialAssignedUserIds);

  const isPlatinumPlus = useLicense().isPlatinumPlus();
  const upsellingMessage = useUpsellingMessage('alert_assignments');
  const { hasAlertsUpdate } = useAlertsPrivileges();
  const setAlertAssignees = useSetAlertAssignees();

  const uids = useMemo(() => new Set(assignedUserIds), [assignedUserIds]);
  const { data: assignedUsers } = useBulkGetUserProfiles({ uids });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const searchInputId = useGeneratedHtmlId({ prefix: 'searchInput' });

  useEffect(() => {
    setAssignedUserIds(initialAssignedUserIds);
  }, [initialAssignedUserIds]);

  const togglePopover = useCallback(() => {
    setIsPopoverOpen((value) => !value);
  }, []);

  const handleApplyAssignees = useCallback<AssigneesApplyPanelProps['onApply']>(
    async (assignees) => {
      setIsPopoverOpen(false);

      if (!setAlertAssignees || !eventId) {
        return;
      }

      const onSuccess = () => {
        setAssignedUserIds((currentAssignedUserIds) => {
          const remainingAssignees = currentAssignedUserIds.filter(
            (uid) => !assignees.remove.includes(uid)
          );
          const newAssignees = assignees.add.filter((uid) => !remainingAssignees.includes(uid));

          return [...remainingAssignees, ...newAssignees];
        });

        onAlertUpdated?.();
      };

      await setAlertAssignees(assignees, [eventId], onSuccess, noop);
    },
    [eventId, onAlertUpdated, setAlertAssignees]
  );

  const isUpdateDisabled = useMemo(
    () => !eventId || !hasAlertsUpdate || !isPlatinumPlus || isRemoteDocument,
    [eventId, hasAlertsUpdate, isPlatinumPlus, isRemoteDocument]
  );

  const updateAssigneesPopover = useMemo(
    () => (
      <EuiPopover
        aria-label={i18n.translate(
          'xpack.securitySolution.flyout.document.header.assignees.updatePopoverAriaLabel',
          {
            defaultMessage: 'Update assignees',
          }
        )}
        panelPaddingSize="none"
        initialFocus={`[id="${searchInputId}"]`}
        button={
          <UpdateAssigneesButton
            togglePopover={togglePopover}
            isDisabled={isUpdateDisabled}
            toolTipMessage={
              upsellingMessage ??
              i18n.translate(
                'xpack.securitySolution.flyout.document.header.assignees.popoverTooltip',
                {
                  defaultMessage: 'Assign alert',
                }
              )
            }
          />
        }
        isOpen={isPopoverOpen}
        panelStyle={{
          minWidth: ASSIGNEES_PANEL_WIDTH,
        }}
        closePopover={togglePopover}
      >
        <AssigneesApplyPanel
          searchInputId={searchInputId}
          assignedUserIds={assignedUserIds}
          onApply={handleApplyAssignees}
        />
      </EuiPopover>
    ),
    [
      assignedUserIds,
      handleApplyAssignees,
      isPopoverOpen,
      isUpdateDisabled,
      searchInputId,
      togglePopover,
      upsellingMessage,
    ]
  );

  return (
    <FlyoutHeaderBlock
      hasBorder
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyout.document.header.assignedTitle"
          defaultMessage="Assignees"
        />
      }
      data-test-subj={ASSIGNEES_TITLE_TEST_ID}
    >
      {!showAssignees ? (
        <div data-test-subj={ASSIGNEES_EMPTY_TEST_ID}>{getEmptyTagValue()}</div>
      ) : (
        <EuiFlexGroup gutterSize="none" responsive={false} data-test-subj={ASSIGNEES_TEST_ID}>
          {assignedUsers && (
            <EuiFlexItem grow={false}>
              <UsersAvatarsPanel userProfiles={assignedUsers} maxVisibleAvatars={2} />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>{updateAssigneesPopover}</EuiFlexItem>
        </EuiFlexGroup>
      )}
    </FlyoutHeaderBlock>
  );
});

Assignees.displayName = 'Assignees';
