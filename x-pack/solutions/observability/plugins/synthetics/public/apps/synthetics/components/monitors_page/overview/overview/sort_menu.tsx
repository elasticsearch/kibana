/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonEmpty,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
  useGeneratedHtmlId,
  EuiText,
  EuiPanel,
  EuiHorizontalRule,
} from '@elastic/eui';

interface Option {
  label: string;
  value: string;
  checked: boolean;
  defaultSortOrder?: string;
  onClick: () => void;
}

interface Props {
  sortOptions: Option[];
  orderOptions: Option[];
  sortField: string;
}

export const SortMenu = ({ sortOptions, orderOptions, sortField }: Props) => {
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
      data-test-subj="syntheticsSortMenuButton"
      size="xs"
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={onButtonClick}
    >
      {sortField}
    </EuiButtonEmpty>
  );

  const items = [
    <EuiPanel paddingSize="s" hasShadow={false} key="sort_by_title">
      <EuiText size="xs">
        <h4>{SORT_BY_TITLE}</h4>
      </EuiText>
    </EuiPanel>,
    ...sortOptions.map((option) => (
      <ContextMenuItem option={option} onClosePopover={closePopover} key={option.value} />
    )),
    <EuiHorizontalRule key="hr" margin="none" />,

    <EuiPanel paddingSize="s" hasShadow={false} key="order_by_title">
      <EuiText size="xs">
        <h4>{ORDER_BY_TITLE}</h4>
      </EuiText>
    </EuiPanel>,

    ...orderOptions.map((option) => (
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
      aria-label={i18n.translate('xpack.synthetics.sortMenu.popoverAriaLabel', {
        defaultMessage: 'Sort options',
      })}
    >
      <EuiContextMenuPanel items={items} style={{ minWidth: 160 }} />
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
      // style={{
      //   marginRight: 24,
      // }}
    >
      {option.label}
    </EuiContextMenuItem>
  );
};

const SORT_BY_TITLE = i18n.translate('xpack.synthetics.overview.sortPopover.sortBy.title', {
  defaultMessage: 'Sort by',
});

export const ORDER_BY_TITLE = i18n.translate(
  'xpack.synthetics.overview.sortPopover.orderBy.title',
  {
    defaultMessage: 'Order',
  }
);
