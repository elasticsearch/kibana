/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonIcon,
  EuiContextMenu,
  EuiContextMenuPanel,
  EuiPopover,
  EuiButton,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiButtonProps } from '@elastic/eui/src/components/button/button';
import type { EuiContextMenuProps } from '@elastic/eui/src/components/context_menu/context_menu';
import type { EuiContextMenuPanelProps } from '@elastic/eui/src/components/context_menu/context_menu_panel';

type Props = {
  button?: {
    props: EuiButtonProps;
    children: JSX.Element;
  };
  isOpen?: boolean;
  isManaged?: boolean;
  onChange?: (isOpen: boolean) => void;
  'aria-label'?: string;
} & (
  | {
      items: EuiContextMenuPanelProps['items'];
    }
  | {
      panels: EuiContextMenuProps['panels'];
    }
);

export const ContextMenuActions = React.memo<Props>(
  ({ button, onChange, isOpen, 'aria-label': ariaLabel, ...props }) => {
    const [isOpenState, setIsOpenState] = useState(false);
    const handleCloseMenu = useCallback(() => {
      if (onChange) {
        onChange(false);
      } else {
        setIsOpenState(false);
      }
    }, [setIsOpenState, onChange]);
    const handleToggleMenu = useCallback(() => {
      if (onChange) {
        onChange(!isOpen);
      } else {
        setIsOpenState(!isOpenState);
      }
    }, [isOpenState, onChange, isOpen]);

    const actionButton = button ? (
      <EuiButton {...button.props} onClick={handleToggleMenu} isDisabled={props.isManaged}>
        {button.children}
      </EuiButton>
    ) : (
      <EuiToolTip
        content={
          ariaLabel ??
          i18n.translate('xpack.fleet.genericActionsMenuText', {
            defaultMessage: 'Actions',
          })
        }
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          isDisabled={props.isManaged}
          iconType="boxesVertical"
          onClick={handleToggleMenu}
          aria-label={
            ariaLabel ??
            i18n.translate('xpack.fleet.genericActionsMenuText', {
              defaultMessage: 'Actions',
            })
          }
          data-test-subj="agentActionsBtn"
        />
      </EuiToolTip>
    );

    return (
      <EuiPopover
        aria-label={i18n.translate('xpack.fleet.contextMenuActions.popoverAriaLabel', {
          defaultMessage: 'Actions menu',
        })}
        anchorPosition="downRight"
        panelPaddingSize="none"
        button={
          props.isManaged ? (
            <EuiToolTip
              title={i18n.translate('xpack.fleet.externallyManagedLabel', {
                defaultMessage: 'This is externally managed integration policy.',
              })}
            >
              {actionButton}
            </EuiToolTip>
          ) : (
            actionButton
          )
        }
        isOpen={isOpen === undefined ? isOpenState : isOpen}
        closePopover={handleCloseMenu}
      >
        {'items' in props ? (
          <EuiContextMenuPanel items={props.items} />
        ) : (
          <EuiContextMenu panels={props.panels} initialPanelId={0} />
        )}
      </EuiPopover>
    );
  }
);
