/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiContextMenu, EuiIcon, EuiPopover, useGeneratedHtmlId, EuiBadge } from '@elastic/eui';
import { throttle } from 'lodash';
import { useMonitorHealthColor } from '../../../hooks/use_monitor_health_color';
import type { OverviewStatusMetaData } from '../../../../../../../../common/runtime_types';

export const LocationsBadge = ({
  monitor,
  onLocationClick,
}: {
  monitor: OverviewStatusMetaData;
  onLocationClick?: (locationId: string, locationLabel: string) => void;
}) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const throttledOpenPopover = useMemo(
    () => throttle(() => setPopover(true), 500, { trailing: false }),
    []
  );

  const locationsLabel = i18n.translate(
    'xpack.synthetics.locationsBadge.clickMeToLoadButtonLabel',
    {
      defaultMessage: '{locations} Locations',
      values: {
        locations: monitor.locations.length,
      },
    }
  );

  const contextMenuPopoverId = useGeneratedHtmlId({
    prefix: 'contextMenuPopover',
  });

  const closePopover = () => {
    setPopover(false);
  };

  const getColor = useMonitorHealthColor();

  const panels = [
    {
      id: 0,
      title: locationsLabel,
      items: monitor.locations.map((location) => {
        return {
          key: location.id,
          name: location.label,
          icon: <EuiIcon type="dot" color={getColor(location.status)} aria-hidden={true} />,
          onClick: () => {
            closePopover();
            onLocationClick?.(location.id, location.label);
          },
          'data-test-subj': `syntheticsLocationsBadgeLocation-${location.label}`,
        };
      }),
    },
  ];

  // Note: don't close the popover on `mouseout`/`blur` here. EuiPopover renders
  // the menu in a portal outside this div, so the cursor leaving this trigger
  // would dismiss the menu before users can interact with it. Closing is
  // handled by EuiPopover's own outside-click / Escape behaviour via
  // `closePopover`.
  const button = (
    <div
      onMouseOver={() => {
        throttledOpenPopover();
      }}
      onFocus={() => setPopover(true)}
    >
      <EuiBadge
        data-test-subj="syntheticsLocationsBadgeClickMeToLoadAContextMenuButton"
        iconType="arrowDown"
        iconSide="right"
        onClick={(e) => {
          e.stopPropagation();
          setPopover(!isPopoverOpen);
        }}
        iconOnClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setPopover(!isPopoverOpen);
        }}
        iconOnClickAriaLabel={'Click to open context menu'}
        onClickAriaLabel="Click to open context menu"
      >
        {i18n.translate('xpack.synthetics.locationsBadge.clickMeToLoadButtonLabel', {
          defaultMessage: '{locations} Locations',
          values: {
            locations: monitor.locations.length,
          },
        })}
      </EuiBadge>
    </div>
  );

  return (
    <EuiPopover
      id={contextMenuPopoverId}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.synthetics.locationsBadge.popoverAriaLabel', {
        defaultMessage: 'Locations menu',
      })}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
