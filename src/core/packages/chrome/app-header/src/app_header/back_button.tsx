/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useMemo, useState } from 'react';
import type { BackNavigation } from './hooks';
import { APP_HEADER_TEST_SUBJECTS } from './test_subjects';

const backLabel = i18n.translate('core.ui.chrome.appHeader.backButtonAriaLabel', {
  defaultMessage: 'Back',
});

const getBackToLabel = (destination: string) =>
  i18n.translate('core.ui.chrome.appHeader.backButtonAriaLabelWithDestination', {
    defaultMessage: 'Back to {destination}',
    values: { destination },
  });

const backMenuLabel = i18n.translate('core.ui.chrome.appHeader.backButtonMenuAriaLabel', {
  defaultMessage: 'Open back navigation menu',
});

const useBackButtonStyles = () => {
  const { euiTheme } = useEuiTheme();

  return useMemo(() => {
    const button = css`
      color: ${euiTheme.colors.textSubdued};
    `;

    return { button };
  }, [euiTheme]);
};

export interface BackButtonProps {
  targets: BackNavigation[];
}

export const BackButton = React.memo<BackButtonProps>(({ targets }) => {
  const styles = useBackButtonStyles();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const togglePopover = useCallback(() => setIsPopoverOpen((open) => !open), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);

  const primary = targets[0];
  const tooltip = primary?.backDestinationLabel
    ? getBackToLabel(primary.backDestinationLabel)
    : backLabel;
  const buttonLabel = targets.length > 1 ? backMenuLabel : tooltip;

  if (!primary) {
    return null;
  }

  const buttonIcon = (
    <EuiButtonIcon
      iconType="sortLeft"
      color="text"
      display="empty"
      size="xs"
      css={styles.button}
      aria-label={buttonLabel}
      data-test-subj={APP_HEADER_TEST_SUBJECTS.back}
      {...(targets.length > 1
        ? {
            onClick: togglePopover,
            'aria-haspopup': 'menu' as const,
            'aria-expanded': isPopoverOpen,
          }
        : { href: primary.backHref, onClick: primary.backOnClick })}
    />
  );

  if (targets.length > 1) {
    return (
      <EuiPopover
        aria-label={tooltip}
        button={<EuiToolTip content={tooltip}>{buttonIcon}</EuiToolTip>}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
      >
        <EuiContextMenuPanel
          items={targets.map((target, idx) => (
            <EuiContextMenuItem
              key={idx}
              href={target.backHref}
              onClick={(event) => {
                closePopover();
                target.backOnClick?.(event);
              }}
            >
              {target.backDestinationLabel ?? target.backHref}
            </EuiContextMenuItem>
          ))}
        />
      </EuiPopover>
    );
  }

  return <EuiToolTip content={tooltip}>{buttonIcon}</EuiToolTip>;
});

BackButton.displayName = 'BackButton';
