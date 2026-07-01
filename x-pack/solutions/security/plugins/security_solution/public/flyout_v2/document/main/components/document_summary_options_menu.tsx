/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiContextMenu, EuiPanel, EuiPopover, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { AnonymizationSwitch } from './anonymization_switch';

export const DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID =
  'document-flyout-ai-summary-options-menu-button';
export const DOCUMENT_SUMMARY_OPTIONS_MENU_PANELS_TEST_ID =
  'document-flyout-ai-summary-options-menu-panels';

const OPTIONS_MENU = i18n.translate('xpack.securitySolution.flyout.alertSummary.optionsMenuTitle', {
  defaultMessage: 'Options',
});

export interface DocumentSummaryOptionsMenuProps {
  /**
   * Whether the document currently has an AI summary. Forwarded to the
   * anonymization switch so the toggle is disabled (with a tooltip) when no
   * summary has been generated yet.
   */
  hasSummary: boolean;
  /**
   * Current value of the anonymization toggle.
   */
  showAnonymizedValues: boolean | undefined;
  /**
   * Setter for the anonymization toggle.
   */
  setShowAnonymizedValues: React.Dispatch<React.SetStateAction<boolean | undefined>>;
}

/**
 * Options menu rendered alongside the AI summary section's title (or in the
 * `extraAction` slot of an `ExpandableSection` host). Currently exposes a
 * single option that toggles the display of anonymized values.
 */
export const DocumentSummaryOptionsMenu = memo(
  ({
    hasSummary,
    showAnonymizedValues,
    setShowAnonymizedValues,
  }: DocumentSummaryOptionsMenuProps) => {
    const [isPopoverOpen, setPopover] = useState(false);
    const togglePopover = useCallback(() => setPopover((open) => !open), []);

    const button = useMemo(
      () => (
        <EuiToolTip content={OPTIONS_MENU} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={OPTIONS_MENU}
            data-test-subj={DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID}
            color="text"
            iconType="boxesVertical"
            onClick={togglePopover}
          />
        </EuiToolTip>
      ),
      [togglePopover]
    );
    const panels = useMemo(
      () => [
        {
          id: 0,
          title: OPTIONS_MENU,
          content: (
            <EuiPanel paddingSize="s">
              <AnonymizationSwitch
                hasSummary={hasSummary}
                showAnonymizedValues={showAnonymizedValues}
                setShowAnonymizedValues={setShowAnonymizedValues}
              />
            </EuiPanel>
          ),
        },
      ],
      [hasSummary, showAnonymizedValues, setShowAnonymizedValues]
    );
    return (
      <EuiPopover
        aria-label={OPTIONS_MENU}
        button={button}
        isOpen={isPopoverOpen}
        closePopover={togglePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
      >
        <EuiContextMenu
          data-test-subj={DOCUMENT_SUMMARY_OPTIONS_MENU_PANELS_TEST_ID}
          initialPanelId={0}
          panels={panels}
        />
      </EuiPopover>
    );
  }
);

DocumentSummaryOptionsMenu.displayName = 'DocumentSummaryOptionsMenu';
