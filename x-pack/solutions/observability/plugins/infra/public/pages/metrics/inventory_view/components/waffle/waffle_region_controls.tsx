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
import { DropdownButton } from '../dropdown_button';

interface Props {
  region?: string;
  options: string[];
  changeRegion: (name: string) => void;
}

export const WaffleRegionControls = (props: Props) => {
  const { region, options } = props;
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const showPopover = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const currentLabel = options.find((o) => region === o);

  const changeRegion = useCallback(
    (val: string) => {
      if (region === val) {
        props.changeRegion('');
      } else {
        props.changeRegion(val);
      }
      closePopover();
    },
    [region, closePopover, props]
  );

  const panels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [
      {
        id: 0,
        title: '',
        items: options.map((o) => {
          const icon = o === region ? 'check' : 'empty';
          const panel = { name: o, onClick: () => changeRegion(o), icon };
          return panel;
        }),
      },
    ],
    [changeRegion, options, region]
  );

  const button = (
    <DropdownButton
      onClick={showPopover}
      label={i18n.translate('xpack.infra.waffle.regionLabel', { defaultMessage: 'Region' })}
    >
      {currentLabel ||
        i18n.translate('xpack.infra.waffle.region', {
          defaultMessage: 'All',
        })}
    </DropdownButton>
  );

  return (
    <EuiPopover
      isOpen={isOpen}
      id="regionPanel"
      button={button}
      anchorPosition="downLeft"
      panelPaddingSize="none"
      closePopover={closePopover}
      aria-label={i18n.translate('xpack.infra.waffle.regionControls.ariaLabel', {
        defaultMessage: 'Region',
      })}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
