/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import type { EuiSwitchEvent } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFormRow,
  EuiPopover,
  EuiSpacer,
  EuiSwitch,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';

import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import * as i18n from './translations';
import { TABLE_SECTION_TEST_ID } from './table_section';

export interface AttacksViewOptionsPopoverProps {
  showAnonymized: boolean;
  onToggleShowAnonymized: () => void;
  showAttacksOnly: boolean;
  onToggleShowAttacksOnly: () => void;
}

export const AttacksViewOptionsPopover: React.FC<AttacksViewOptionsPopoverProps> = ({
  showAnonymized,
  onToggleShowAnonymized,
  showAttacksOnly,
  onToggleShowAttacksOnly,
}) => {
  const { euiTheme } = useEuiTheme();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const {
    services: { telemetry },
  } = useKibana();

  const onButtonClick = useCallback(() => {
    setIsPopoverOpen((isOpen) => !isOpen);
  }, []);

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const handleToggleShowAnonymized = useCallback(
    (e: EuiSwitchEvent) => {
      onToggleShowAnonymized();
      telemetry.reportEvent(AttacksEventTypes.ViewOptionChanged, {
        option: 'showAnonymized',
        enabled: e.target.checked,
      });
    },
    [onToggleShowAnonymized, telemetry]
  );

  const handleToggleShowAttacksOnly = useCallback(
    (e: EuiSwitchEvent) => {
      onToggleShowAttacksOnly();
      telemetry.reportEvent(AttacksEventTypes.ViewOptionChanged, {
        option: 'showAttacksOnly',
        enabled: e.target.checked,
      });
    },
    [onToggleShowAttacksOnly, telemetry]
  );

  const button = (
    <EuiToolTip content={i18n.VIEW_OPTIONS_ARIA_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="controls"
        aria-label={i18n.VIEW_OPTIONS_ARIA_LABEL}
        onClick={onButtonClick}
        data-test-subj={`${TABLE_SECTION_TEST_ID}-view-options-button`}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      id="attacksViewOptionsPopover"
      aria-label={i18n.VIEW_OPTIONS_ARIA_LABEL}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="m"
      anchorPosition="downRight"
      panelStyle={{ minWidth: euiTheme.base * 18 }}
    >
      <EuiFormRow display="rowCompressed">
        <EuiSwitch
          label={i18n.SHOW_ANONYMIZED_LABEL}
          checked={showAnonymized}
          onChange={handleToggleShowAnonymized}
          data-test-subj={`${TABLE_SECTION_TEST_ID}-show-anonymized-switch`}
          compressed
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow display="rowCompressed">
        <EuiSwitch
          label={i18n.SHOW_ATTACKS_ONLY_LABEL}
          checked={showAttacksOnly}
          onChange={handleToggleShowAttacksOnly}
          data-test-subj={`${TABLE_SECTION_TEST_ID}-show-attacks-only-switch`}
          compressed
        />
      </EuiFormRow>
    </EuiPopover>
  );
};
