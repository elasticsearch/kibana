/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiPopover, EuiContextMenu } from '@elastic/eui';
import React, { useCallback, useState, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { InventoryCloudAccount } from '../../../../../../common/http_api/inventory_meta_api';
import { DropdownButton } from '../dropdown_button';

interface Props {
  accountId: string;
  options: InventoryCloudAccount[];
  changeAccount: (id: string) => void;
}

export const WaffleAccountsControls = (props: Props) => {
  const { accountId, options } = props;
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const showPopover = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const currentLabel = options.find((o) => o.value === accountId);

  const changeAccount = useCallback(
    (val: string) => {
      if (accountId === val) {
        props.changeAccount('');
      } else {
        props.changeAccount(val);
      }
      closePopover();
    },
    [accountId, closePopover, props]
  );

  const panels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [
      {
        id: 0,
        title: '',
        items: options.map((o) => {
          const icon = o.value === accountId ? 'check' : 'empty';
          const panel = { name: o.name, onClick: () => changeAccount(o.value), icon };
          return panel;
        }),
      },
    ],
    [options, accountId, changeAccount]
  );

  const button = (
    <DropdownButton
      label={i18n.translate('xpack.infra.waffle.accountLabel', { defaultMessage: 'Account' })}
      onClick={showPopover}
    >
      {currentLabel
        ? currentLabel.name
        : i18n.translate('xpack.infra.waffle.accountAllTitle', {
            defaultMessage: 'All',
          })}
    </DropdownButton>
  );

  return (
    <EuiPopover
      isOpen={isOpen}
      id="accontPopOver"
      button={button}
      anchorPosition="downLeft"
      panelPaddingSize="none"
      closePopover={closePopover}
      aria-label={i18n.translate('xpack.infra.waffle.accountControls.ariaLabel', {
        defaultMessage: 'Account',
      })}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
