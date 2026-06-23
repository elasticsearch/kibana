/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiPopover, EuiIcon } from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';
import { i18n } from '@kbn/i18n';

export const Popover = ({
  buttonAriaLabelText,
  children,
}: {
  buttonAriaLabelText?: string;
  children: React.ReactNode;
}) => {
  const [isPopoverOpen, { off: closePopover, toggle: togglePopover }] = useBoolean(false);

  const onButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopover();
    },
    [togglePopover]
  );

  return (
    <EuiPopover
      panelPaddingSize="s"
      aria-label={
        buttonAriaLabelText
          ? i18n.translate('xpack.infra.hostsViewPage.popoverInfoAriaLabelWithText', {
              defaultMessage: '{buttonAriaLabelText} info',
              values: { buttonAriaLabelText },
            })
          : i18n.translate('xpack.infra.hostsViewPage.popoverInfoAriaLabel', {
              defaultMessage: 'info',
            })
      }
      button={
        <button
          aria-label={
            buttonAriaLabelText
              ? i18n.translate('xpack.infra.hostsViewPage.popoverInfoIconButtonAriaLabelWithText', {
                  defaultMessage: '{buttonAriaLabelText} info button',
                  values: { buttonAriaLabelText },
                })
              : i18n.translate('xpack.infra.hostsViewPage.popoverInfoIconButtonAriaLabel', {
                  defaultMessage: 'info button',
                })
          }
          onClick={onButtonClick}
          data-test-subj="hostsViewTableColumnPopoverButton"
        >
          <EuiIcon type="question" aria-hidden={true} />
        </button>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      offset={10}
      anchorPosition="upCenter"
      panelStyle={{ maxWidth: 350 }}
    >
      {children}
    </EuiPopover>
  );
};
