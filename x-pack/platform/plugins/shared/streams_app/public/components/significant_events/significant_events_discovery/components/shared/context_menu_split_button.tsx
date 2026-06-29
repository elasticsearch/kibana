/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCallOut,
  EuiContextMenu,
  EuiSplitButton,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';
import React, { useCallback, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { useModelSettingsUrl } from '../../../../../hooks/use_model_settings_url';
import { MODEL_SETTINGS_LABEL } from './translations';

export interface MenuHelpers {
  resetMenu: () => void;
  closeMenu: () => void;
}

export interface ContextMenuSplitButtonProps {
  primaryLabel: React.ReactNode;
  primaryIconType?: string;
  onPrimaryClick: () => void;
  isPrimaryDisabled?: boolean;
  isPrimaryLoading?: boolean;
  primaryDataTestSubj?: string;

  secondaryAriaLabel: string;
  isSecondaryDisabled?: boolean;
  secondaryDataTestSubj?: string;

  buildPanels: (helpers: MenuHelpers) => Array<Omit<EuiContextMenuPanelDescriptor, 'id'>>;

  error?: Error;
  errorTitle?: string;

  color?: ComponentProps<typeof EuiSplitButton>['color'];
  size?: ComponentProps<typeof EuiSplitButton>['size'];
  isLoading?: boolean;
  hideModelSettings?: boolean;
  'data-test-subj'?: string;
}

export const ContextMenuSplitButton = ({
  primaryLabel,
  primaryIconType,
  onPrimaryClick,
  isPrimaryDisabled,
  isPrimaryLoading,
  primaryDataTestSubj,
  secondaryAriaLabel,
  isSecondaryDisabled,
  secondaryDataTestSubj,
  buildPanels,
  error,
  errorTitle,
  color,
  size,
  isLoading,
  hideModelSettings,
  'data-test-subj': dataTestSubj,
}: ContextMenuSplitButtonProps) => {
  const { euiTheme } = useEuiTheme();
  const [isOpen, { off: close, toggle }] = useBoolean(false);
  const [menuResetKey, setMenuResetKey] = useState(0);
  const popoverId = useGeneratedHtmlId({ prefix: 'contextMenuSplitButton' });
  const managementUrl = useModelSettingsUrl();

  const resetMenu = useCallback(() => setMenuResetKey((k) => k + 1), []);

  const closeMenu = useCallback(() => {
    close();
    resetMenu();
  }, [close, resetMenu]);

  const panels = useMemo(() => {
    const builtPanels = buildPanels({ resetMenu, closeMenu });

    const settingsItems =
      !hideModelSettings && managementUrl
        ? [
            { isSeparator: true as const },
            {
              name: MODEL_SETTINGS_LABEL,
              icon: 'gear' as const,
              href: managementUrl,
              target: '_blank',
              onClick: closeMenu,
            },
          ]
        : [];

    return builtPanels.map((panel, index) => ({
      ...panel,
      id: index,
      ...(index === 0 && panel.items && settingsItems.length > 0
        ? { items: [...panel.items, ...settingsItems] }
        : {}),
    }));
  }, [buildPanels, resetMenu, closeMenu, managementUrl, hideModelSettings]);

  const popoverContent = error ? (
    <EuiCallOut
      announceOnMount
      color="danger"
      size="s"
      title={errorTitle}
      css={{ margin: euiTheme.size.s }}
    />
  ) : (
    <EuiContextMenu key={menuResetKey} initialPanelId={0} panels={panels} />
  );

  return (
    <EuiSplitButton
      size={size ?? 'm'}
      color={color}
      isLoading={isLoading}
      data-test-subj={dataTestSubj}
    >
      <EuiSplitButton.ActionPrimary
        onClick={onPrimaryClick}
        isDisabled={isPrimaryDisabled}
        isLoading={isPrimaryLoading}
        iconType={primaryIconType}
        data-test-subj={primaryDataTestSubj}
      >
        {primaryLabel}
      </EuiSplitButton.ActionPrimary>
      <EuiSplitButton.ActionSecondary
        iconType="arrowDown"
        aria-label={secondaryAriaLabel}
        isDisabled={isSecondaryDisabled}
        data-test-subj={secondaryDataTestSubj}
        onClick={toggle}
        popoverProps={{
          id: popoverId,
          isOpen,
          closePopover: closeMenu,
          anchorPosition: 'downRight',
          panelPaddingSize: 'none',
          children: popoverContent,
        }}
      />
    </EuiSplitButton>
  );
};
