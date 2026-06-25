/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSwitchEvent } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiContextMenu,
  EuiContextMenuItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

export interface AISummarySectionSettingsProps {
  /** Whether the AI summary should render anonymized field values when available. */
  showAnonymized: boolean;
  /** Invoked when the user toggles the "Show anonymized values" switch. */
  onChangeShowAnonymized: (event: EuiSwitchEvent) => void;
  /** Closes the settings popover (for example when the user dismisses it or clicks outside). */
  closePopover: () => void;
  /** Opens the settings popover when the user activates the menu button. */
  openPopover: () => void;
  /** Whether the attack summary settings popover is currently open. */
  isPopoverOpen: boolean;
  /** When false, the "Show anonymized values" switch is disabled because there is no anonymized content to show. */
  hasAnonymizedContent: boolean;
}

/**
 * Attack-details flyout menu for AI summary display options (for example showing anonymized values).
 */
export const AISummarySectionSettings: React.FC<AISummarySectionSettingsProps> = ({
  showAnonymized,
  onChangeShowAnonymized,
  closePopover,
  openPopover,
  isPopoverOpen,
  hasAnonymizedContent,
}) => {
  const panels = useMemo(
    () => [
      {
        id: 0,
        items: [
          {
            key: 'ai-summary-settings-options-title',
            renderItem: () => (
              <EuiPopoverTitle
                paddingSize="s"
                aria-label={i18n.translate(
                  'xpack.securitySolution.attackDetailsFlyout.overview.AISummary.optionsMenuTitle.ariaLabel',
                  {
                    defaultMessage: 'Options',
                  }
                )}
              >
                <EuiText size="xs">
                  <strong>
                    <FormattedMessage
                      id="xpack.securitySolution.attackDetailsFlyout.overview.AISummary.optionsMenuTitle"
                      defaultMessage="Options"
                    />
                  </strong>
                </EuiText>
              </EuiPopoverTitle>
            ),
          },
          {
            key: 'ai-summary-show-anonymized',
            renderItem: () => (
              <EuiContextMenuItem
                aria-label={i18n.translate(
                  'xpack.securitySolution.attackDetailsFlyout.overview.AISummary.showAnonymizedAriaLabel',
                  {
                    defaultMessage: 'Show anonymized values',
                  }
                )}
              >
                <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
                  <EuiFlexItem grow={false}>
                    <EuiSwitch
                      checked={showAnonymized}
                      compressed
                      data-test-subj="overview-tab-toggle-anonymized"
                      label={
                        <FormattedMessage
                          id="xpack.securitySolution.attackDetailsFlyout.overview.AISummary.showAnonymizedLabel"
                          defaultMessage="Show anonymized values"
                        />
                      }
                      onChange={onChangeShowAnonymized}
                      disabled={!hasAnonymizedContent}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiContextMenuItem>
            ),
          },
        ],
      },
    ],
    [hasAnonymizedContent, onChangeShowAnonymized, showAnonymized]
  );

  return (
    <EuiPopover
      aria-label={i18n.translate(
        'xpack.securitySolution.attackDetailsFlyout.overview.AISummary.settingsPopoverAriaLabel',
        {
          defaultMessage: 'Attack summary settings',
        }
      )}
      button={
        <EuiToolTip
          content={i18n.translate(
            'xpack.securitySolution.attackDetailsFlyout.overview.AISummary.openMenuAriaLabel',
            {
              defaultMessage: 'Attack summary settings menu',
            }
          )}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            aria-label={i18n.translate(
              'xpack.securitySolution.attackDetailsFlyout.overview.AISummary.openMenuAriaLabel',
              {
                defaultMessage: 'Attack summary settings menu',
              }
            )}
            data-test-subj="overview-tab-ai-summary-settings-menu"
            iconType="boxesVertical"
            onClick={openPopover}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="leftUp"
    >
      <EuiContextMenu
        css={css`
          width: 280px;
        `}
        initialPanelId={0}
        panels={panels}
      />
    </EuiPopover>
  );
};
