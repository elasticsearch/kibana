/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiSwitchEvent } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPopover,
  EuiPopoverTitle,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { useOverviewDisplayOptions } from './use_overview_display_options';

/**
 * Compact, popover-based "display options" surface for the overview list.
 *
 * It hosts cosmetic preferences (e.g. absolute timestamps) that change how the
 * list is drawn rather than what it contains. These are saved to `localStorage`
 * via `useOverviewDisplayOptions` — per-user, per-space, never in the URL.
 */
export const DisplayOptionsPopover: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const { options, setOption } = useOverviewDisplayOptions();

  const onToggleAbsoluteTimestamps = useCallback(
    (e: EuiSwitchEvent) => {
      setOption('absoluteTimestamps', e.target.checked);
    },
    [setOption]
  );

  const button = (
    <EuiToolTip content={ARIA_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        data-test-subj="syntheticsOverviewDisplayOptionsButton"
        iconType="controlsHorizontal"
        aria-label={ARIA_LABEL}
        onClick={() => setIsOpen((prev) => !prev)}
        display={isOpen ? 'fill' : 'base'}
        color="text"
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      id="syntheticsOverviewDisplayOptions"
      button={button}
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="downRight"
      panelPaddingSize="m"
    >
      <EuiPopoverTitle paddingSize="s">{POPOVER_TITLE}</EuiPopoverTitle>
      <div css={{ minWidth: 280 }}>
        <EuiTitle size="xxxs">
          <h4>{DISPLAY_HEADING}</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiSwitch
          compressed
          data-test-subj="syntheticsAbsoluteTimestampsSwitch"
          checked={options.absoluteTimestamps}
          onChange={onToggleAbsoluteTimestamps}
          label={<EuiText size="xs">{ABSOLUTE_TIMESTAMPS_LABEL}</EuiText>}
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          {ABSOLUTE_TIMESTAMPS_HINT}
        </EuiText>

        <EuiHorizontalRule margin="m" />

        <EuiFlexGroup justifyContent="flexEnd" gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              data-test-subj="syntheticsDisplayOptionsResetButton"
              onClick={() => {
                setOption('absoluteTimestamps', false);
              }}
            >
              {RESET_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    </EuiPopover>
  );
};

const ARIA_LABEL = i18n.translate('xpack.synthetics.overview.displayOptions.ariaLabel', {
  defaultMessage: 'Display options',
});

const POPOVER_TITLE = i18n.translate('xpack.synthetics.overview.displayOptions.title', {
  defaultMessage: 'Display options',
});

const DISPLAY_HEADING = i18n.translate('xpack.synthetics.overview.displayOptions.displayHeading', {
  defaultMessage: 'Display',
});

const ABSOLUTE_TIMESTAMPS_LABEL = i18n.translate(
  'xpack.synthetics.overview.displayOptions.absoluteTimestampsLabel',
  { defaultMessage: 'Absolute timestamps' }
);

const ABSOLUTE_TIMESTAMPS_HINT = i18n.translate(
  'xpack.synthetics.overview.displayOptions.absoluteTimestampsHint',
  {
    defaultMessage: 'Show full date and time instead of relative values like "5m ago".',
  }
);

const RESET_LABEL = i18n.translate('xpack.synthetics.overview.displayOptions.resetLabel', {
  defaultMessage: 'Reset to defaults',
});
