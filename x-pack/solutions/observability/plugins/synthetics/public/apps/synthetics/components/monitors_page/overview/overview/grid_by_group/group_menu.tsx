/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
  useGeneratedHtmlId,
  EuiPanel,
  EuiText,
  EuiHorizontalRule,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { GROUP_TITLE } from './group_fields';
import { ORDER_BY_TITLE } from '../sort_menu';

interface Option {
  label: string;
  value: string;
  checked: boolean;
  defaultGroupOrder?: string;
  onClick: () => void;
}

interface Props {
  groupOptions: Option[];
  orderByOptions: Option[];
  groupField: string;
}

export const GroupMenu = ({ groupOptions, orderByOptions, groupField }: Props) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const singleContextMenuPopoverId = useGeneratedHtmlId({
    prefix: 'singleContextMenuPopover',
  });

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const button = (
    <EuiButtonEmpty
      data-test-subj="syntheticsGroupMenuButton"
      size="xs"
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={onButtonClick}
    >
      {groupField}
    </EuiButtonEmpty>
  );

  const items = [
    <EuiPanel paddingSize="s" hasShadow={false} key="group_title_panel">
      <EuiText size="xs">
        <h4>{GROUP_TITLE}</h4>
      </EuiText>
    </EuiPanel>,

    ...groupOptions.map((option) => (
      <ContextMenuItem option={option} onClosePopover={closePopover} key={option.value} />
    )),

    <EuiHorizontalRule key="hr" margin="none" />,

    <EuiPanel paddingSize="s" hasShadow={false} key="order_by_title">
      <EuiText size="xs">
        <h4>{ORDER_BY_TITLE}</h4>
      </EuiText>
    </EuiPanel>,

    ...orderByOptions.map((option) => (
      <ContextMenuItem option={option} onClosePopover={closePopover} key={option.value} />
    )),
  ];

  return (
    <EuiPopover
      id={singleContextMenuPopoverId}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.synthetics.groupMenu.popoverAriaLabel', {
        defaultMessage: 'Group options',
      })}
    >
      <EuiContextMenuPanel items={items} css={{ minWidth: 160 }} />
    </EuiPopover>
  );
};

const ContextMenuItem = ({
  option,
  onClosePopover,
}: {
  option: Option;
  onClosePopover: () => void;
}) => {
  const getIconType = (checked: boolean) => {
    return checked ? 'check' : 'empty';
  };

  return (
    <EuiContextMenuItem
      key={option.value}
      icon={getIconType(option.checked)}
      onClick={() => {
        onClosePopover();
        option.onClick();
      }}
    >
      {option.label}
    </EuiContextMenuItem>
  );
};
