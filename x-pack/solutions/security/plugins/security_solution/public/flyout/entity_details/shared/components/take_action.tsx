/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useInvestigateInTimeline } from '../../../../common/hooks/timeline/use_investigate_in_timeline';
import { normalizeTimeRange } from '../../../../common/utils/normalize_time_range';
import { useShowTimeline } from '../../../../common/utils/timeline/use_show_timeline';

interface TakeActionProps {
  kqlQuery: string;
  isDisabled?: boolean;
  /**
   * Additional menu items rendered in the popover, after the default "Investigate in Timeline".
   * Receives a `closePopover` callback that callers should invoke from item click handlers
   * so the popover dismisses after the action runs.
   */
  additionalItems?: (closePopover: () => void) => React.ReactElement[];
}

/*
 * This component is used to investigate a host|user|entity using Timeline from Flyout
 */
export const TakeAction = ({ kqlQuery, isDisabled, additionalItems }: TakeActionProps) => {
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const closePopover = useCallback(() => {
    setPopoverOpen(false);
  }, []);

  const [showTimeline] = useShowTimeline();

  const last30MinRange = normalizeTimeRange({
    kind: 'absolute',
    from: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes in milliseconds
    to: new Date(Date.now()).toISOString(),
  });

  const { investigateInTimeline } = useInvestigateInTimeline();
  const { closeFlyout } = useExpandableFlyoutApi();
  const openTimelineCallback = useCallback(async () => {
    investigateInTimeline({
      timeRange: {
        from: last30MinRange.from,
        to: last30MinRange.to,
        kind: 'absolute',
      },
      keepDataView: true, // it will reset to the Security default data view
      query: {
        language: 'kuery',
        query: kqlQuery,
      },
    });
    // Timeline opens as a full-screen overlay, but the entity flyout renders on a
    // higher z-index and would otherwise stay visible on top of it (see issue #277997).
    // Close the flyout so Timeline takes over, mirroring the document details flyout.
    closeFlyout();
  }, [kqlQuery, last30MinRange, investigateInTimeline, closeFlyout]);

  const smallContextMenuPopoverId = useGeneratedHtmlId({
    prefix: 'smallContextMenuPopover',
  });

  const button = (
    <EuiButton
      isLoading={isLoading}
      isDisabled={isDisabled}
      fill
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={() => setPopoverOpen(!isPopoverOpen)}
    >
      <FormattedMessage
        id="xpack.securitySolution.flyout.takeActionButton"
        defaultMessage="Take action"
      />
    </EuiButton>
  );
  const actionsItems = [
    ...(showTimeline
      ? [
          <InvestigateInTimeline
            key="investigateInTimeline"
            investigateInTimelineFn={openTimelineCallback}
            setIsLoading={setIsLoading}
            closePopover={closePopover}
          />,
        ]
      : []),
    ...(additionalItems?.(closePopover) ?? []),
  ];

  if (actionsItems.length === 0) {
    return null;
  }

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.securitySolution.flyout.takeActionAriaLabel', {
        defaultMessage: 'Take action',
      })}
      id={smallContextMenuPopoverId}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      data-test-subj="take-action-button"
    >
      <EuiContextMenuPanel items={actionsItems} />
    </EuiPopover>
  );
};

const InvestigateInTimeline = ({
  investigateInTimelineFn,
  setIsLoading,
  closePopover,
}: {
  investigateInTimelineFn: () => Promise<void>;
  setIsLoading: (isLoading: boolean) => void;
  closePopover: () => void;
}) => {
  return (
    <EuiContextMenuItem
      key="investigateInTimeline"
      icon="timeline"
      onClick={async () => {
        closePopover();
        setIsLoading(true);
        await investigateInTimelineFn();
        setIsLoading(false);
      }}
      data-test-subj="investigate-in-timeline-take-action-button"
    >
      <FormattedMessage
        defaultMessage="Investigate in Timeline"
        id="xpack.securitySolution.flyout.investigateInTimelineButton"
      />
    </EuiContextMenuItem>
  );
};
