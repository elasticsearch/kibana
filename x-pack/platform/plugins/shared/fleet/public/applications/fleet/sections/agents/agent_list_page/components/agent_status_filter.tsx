/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption } from '@elastic/eui';
import { EuiButtonEmpty, useEuiTheme } from '@elastic/eui';
import {
  EuiFilterButton,
  EuiNotificationBadge,
  EuiPopover,
  EuiSelectable,
  EuiText,
  EuiTourStep,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { useDismissableTour } from '../../../../../../hooks/use_dismissable_tour';

import { useLastSeenInactiveAgentsCount } from '../hooks';

const statusFilters = [
  {
    status: 'healthy',
    label: i18n.translate('xpack.fleet.agentList.statusHealthyFilterText', {
      defaultMessage: 'Healthy',
    }),
  },
  {
    status: 'unhealthy',
    label: i18n.translate('xpack.fleet.agentList.statusUnhealthyFilterText', {
      defaultMessage: 'Unhealthy',
    }),
  },
  {
    status: 'orphaned',
    label: i18n.translate('xpack.fleet.agentList.statusOrphanedFilterText', {
      defaultMessage: 'Orphaned',
    }),
  },
  {
    status: 'updating',
    label: i18n.translate('xpack.fleet.agentList.statusUpdatingFilterText', {
      defaultMessage: 'Updating',
    }),
  },
  {
    status: 'offline',
    label: i18n.translate('xpack.fleet.agentList.statusOfflineFilterText', {
      defaultMessage: 'Offline',
    }),
  },
  {
    status: 'inactive',
    label: i18n.translate('xpack.fleet.agentList.statusInactiveFilterText', {
      defaultMessage: 'Inactive',
    }),
  },
  {
    status: 'unenrolled',
    label: i18n.translate('xpack.fleet.agentList.statusUnenrolledFilterText', {
      defaultMessage: 'Unenrolled',
    }),
  },
  {
    status: 'uninstalled',
    label: i18n.translate('xpack.fleet.agentList.statusUninstalledFilterText', {
      defaultMessage: 'Uninstalled',
    }),
  },
];

const LeftpaddedNotificationBadge = styled(EuiNotificationBadge)`
  margin-left: 10px;
`;

const InactiveAgentsTourStep: React.FC<{
  children: React.ReactNode;
  isOpen: boolean;
  onDismiss: () => void;
}> = ({ children, isOpen, onDismiss }) => (
  <EuiTourStep
    content={
      <EuiText size="s">
        <FormattedMessage
          id="xpack.fleet.agentList.inactiveAgentsTourStepContent"
          defaultMessage="Some agents have become inactive and have been hidden. Use status filters to show inactive or unenrolled agents."
        />
      </EuiText>
    }
    isStepOpen={isOpen}
    minWidth={300}
    step={1}
    stepsTotal={0}
    title={
      <FormattedMessage
        id="xpack.fleet.agentList.inactiveAgentsTourStepTitle"
        defaultMessage="Inactive agents"
      />
    }
    onFinish={onDismiss}
    anchorPosition="upCenter"
    maxWidth={280}
    footerAction={
      <EuiButtonEmpty onClick={onDismiss}>
        <FormattedMessage
          id="xpack.fleet.genericTourPopover.dismissButton"
          defaultMessage="Got it"
        />
      </EuiButtonEmpty>
    }
  >
    {children as React.ReactElement}
  </EuiTourStep>
);

export const AgentStatusFilter: React.FC<{
  selectedStatus: string[];
  onSelectedStatusChange: (status: string[]) => void;
  disabled?: boolean;
  totalInactiveAgents: number;
  isOpenByDefault?: boolean;
}> = (props) => {
  const { euiTheme } = useEuiTheme();
  const {
    selectedStatus,
    onSelectedStatusChange,
    disabled,
    totalInactiveAgents,
    isOpenByDefault = false,
  } = props;
  const [lastSeenInactiveAgentsCount, setLastSeenInactiveAgentsCount] =
    useLastSeenInactiveAgentsCount();
  const {
    isHidden: inactiveAgentsCalloutHasBeenDismissed,
    isOpen: isInactiveAgentsTourOpen,
    dismiss: dismissInactiveAgentsCallout,
  } = useDismissableTour('INACTIVE_AGENTS');

  const newlyInactiveAgentsCount = useMemo(() => {
    const newVal = totalInactiveAgents - lastSeenInactiveAgentsCount;

    if (newVal < 0) {
      return 0;
    }

    return newVal;
  }, [lastSeenInactiveAgentsCount, totalInactiveAgents]);

  useMemo(() => {
    if (selectedStatus.length && selectedStatus.includes('inactive') && newlyInactiveAgentsCount) {
      setLastSeenInactiveAgentsCount(totalInactiveAgents);
    }
  }, [
    selectedStatus,
    newlyInactiveAgentsCount,
    setLastSeenInactiveAgentsCount,
    totalInactiveAgents,
  ]);

  useMemo(() => {
    // reduce the number of last seen inactive agents count to the total inactive agents count
    // e.g if agents have become healthy again
    if (totalInactiveAgents > 0 && lastSeenInactiveAgentsCount > totalInactiveAgents) {
      setLastSeenInactiveAgentsCount(totalInactiveAgents);
    }
  }, [lastSeenInactiveAgentsCount, totalInactiveAgents, setLastSeenInactiveAgentsCount]);

  // Status for filtering
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState<boolean>(isOpenByDefault);

  const updateIsStatusFilterOpen = (isOpen: boolean) => {
    if (isOpen && newlyInactiveAgentsCount > 0 && !inactiveAgentsCalloutHasBeenDismissed) {
      dismissInactiveAgentsCallout();
    }

    setIsStatusFilterOpen(isOpen);
  };

  const getOptions = useCallback((): EuiSelectableOption[] => {
    return statusFilters.map(({ label, status }) => {
      return {
        label,
        checked: selectedStatus.includes(status) ? 'on' : undefined,
        key: status,
        append:
          status === 'inactive' && newlyInactiveAgentsCount > 0 ? (
            <LeftpaddedNotificationBadge>{newlyInactiveAgentsCount}</LeftpaddedNotificationBadge>
          ) : undefined,
      };
    });
  }, [selectedStatus, newlyInactiveAgentsCount]);

  const [options, setOptions] = useState<EuiSelectableOption[]>(getOptions());

  useEffect(() => {
    setOptions(getOptions());
  }, [getOptions]);

  const onOptionsChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      setOptions(newOptions);
      newOptions.forEach((option, index) => {
        if (option.checked !== options[index].checked) {
          const status = option.key!;
          if (option.checked !== 'on') {
            onSelectedStatusChange([...selectedStatus.filter((s) => s !== status)]);
          } else {
            onSelectedStatusChange([...selectedStatus, status]);
          }
          return;
        }
      });
    },
    [onSelectedStatusChange, options, selectedStatus]
  );

  return (
    <InactiveAgentsTourStep
      isOpen={newlyInactiveAgentsCount > 0 && isInactiveAgentsTourOpen}
      onDismiss={dismissInactiveAgentsCallout}
    >
      <EuiPopover
        aria-label={i18n.translate('xpack.fleet.agentList.statusFilterAriaLabel', {
          defaultMessage: 'Status filter',
        })}
        ownFocus
        zIndex={Number(euiTheme.levels.header) - 1}
        button={
          <EuiFilterButton
            iconType="chevronSingleDown"
            onClick={() => updateIsStatusFilterOpen(!isStatusFilterOpen)}
            isSelected={isStatusFilterOpen}
            hasActiveFilters={selectedStatus.length > 0}
            numActiveFilters={selectedStatus.length}
            numFilters={statusFilters.length}
            disabled={disabled}
            data-test-subj="agentList.statusFilter"
          >
            <FormattedMessage id="xpack.fleet.agentList.statusFilterText" defaultMessage="Status" />
          </EuiFilterButton>
        }
        isOpen={isStatusFilterOpen}
        closePopover={() => updateIsStatusFilterOpen(false)}
        panelPaddingSize="s"
      >
        <EuiSelectable
          options={options}
          onChange={onOptionsChange}
          data-test-subj="agentList.agentStatusFilterOptions"
          listProps={{
            style: {
              minWidth: 140,
            },
          }}
        >
          {(list) => list}
        </EuiSelectable>
      </EuiPopover>
    </InactiveAgentsTourStep>
  );
};
