/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import { EuiBadge, EuiContextMenu, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import type { InventoryItemType } from '@kbn/metrics-data-access-plugin/common';
import { css } from '@emotion/react';
import { useBoolean } from '@kbn/react-hooks';
import type { InfraGroupByOptions } from '../../../../../common/inventory/types';
import { CustomFieldPanel } from './custom_field_panel';
import type { SnapshotGroupBy } from '../../../../../../common/http_api/snapshot_api';
import { DropdownButton } from '../dropdown_button';

const maxGroupByTooltip = i18n.translate('xpack.infra.waffle.maxGroupByTooltip', {
  defaultMessage: 'Only two groupings can be selected at a time',
});

interface Props {
  options: Array<{ text: string; field: string; toolTipContent?: string }>;
  nodeType: InventoryItemType;
  groupBy: SnapshotGroupBy;
  onChange: (groupBy: SnapshotGroupBy) => void;
  onChangeCustomOptions: (options: InfraGroupByOptions[]) => void;
  customOptions: InfraGroupByOptions[];
}

export const WaffleGroupByControls = ({
  options,
  nodeType,
  groupBy,
  onChange,
  onChangeCustomOptions,
  customOptions,
}: Props) => {
  const [isPopoverOpen, { toggle: togglePopover, off: closePopover }] = useBoolean(false);

  const combinedOptions = [
    ...options,
    ...customOptions.map((option) => ({
      ...option,
      toolTipContent: option.text,
    })),
  ];

  if (!combinedOptions.length) {
    throw Error(
      i18n.translate('xpack.infra.waffle.unableToSelectGroupErrorMessage', {
        defaultMessage: 'Unable to select group by options for {nodeType}',
        values: {
          nodeType,
        },
      })
    );
  }

  const handleRemove = (field: string) => {
    onChange(groupBy.filter((g) => g.field !== field));
    onChangeCustomOptions(customOptions.filter((g) => g.field !== field));
    // We need to close the panel after we rmeove the pill icon otherwise
    // it will remain open because the click is still captured by the EuiFilterButton
    setTimeout(() => closePopover());
  };

  const handleCustomField = (field: string) => {
    onChangeCustomOptions([
      ...customOptions,
      {
        text: field,
        field,
      },
    ]);
    const fn = handleClick(field);
    fn();
  };

  const handleClick = (field: string) => () => {
    if (groupBy.some((g) => g.field === field)) {
      handleRemove(field);
    } else if (groupBy.length < 2) {
      onChange([...groupBy, { field }]);
    }
    closePopover();
  };

  const isMaxGroupingsSelected = groupBy.length >= 2;

  const panels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 'firstPanel',
      title: i18n.translate('xpack.infra.waffle.selectTwoGroupingsTitle', {
        defaultMessage: 'Select up to two groupings',
      }),
      items: [
        {
          name: i18n.translate('xpack.infra.waffle.customGroupByOptionName', {
            defaultMessage: 'Custom field',
          }),
          disabled: isMaxGroupingsSelected,
          toolTipContent: isMaxGroupingsSelected ? maxGroupByTooltip : null,
          icon: 'empty',
          panel: 'customPanel',
        },
        ...combinedOptions.map((o) => {
          const icon = groupBy.some((g) => g.field === o.field) ? 'check' : 'empty';
          const panel = {
            name: o.text,
            onClick: handleClick(o.field),
            icon,
          } as EuiContextMenuPanelItemDescriptor;
          if (o.toolTipContent) {
            panel.toolTipContent = o.toolTipContent;
          }
          if (isMaxGroupingsSelected && icon === 'empty') {
            panel.toolTipContent = maxGroupByTooltip;
            panel.disabled = true;
          }
          return panel;
        }),
      ],
    },
    {
      id: 'customPanel',
      title: i18n.translate('xpack.infra.waffle.customGroupByPanelTitle', {
        defaultMessage: 'Group By Custom Field',
      }),
      width: 685,
      content: <CustomFieldPanel currentOptions={customOptions} onSubmit={handleCustomField} />,
    },
  ];
  const buttonBody =
    groupBy.length > 0 ? (
      groupBy
        .map((g) => combinedOptions?.find((o) => o.field === g.field))
        .filter((o) => o != null)
        // In this map the `o && o.field` is totally unnecessary but Typescript is
        // too stupid to realize that the filter above prevents the next map from being null
        .map((o) => (
          <EuiBadge color="hollow" key={o && o.field}>
            {o && o.text}
          </EuiBadge>
        ))
    ) : (
      <FormattedMessage id="xpack.infra.waffle.groupByAllTitle" defaultMessage="All" />
    );

  const button = (
    <DropdownButton
      label={i18n.translate('xpack.infra.waffle.groupByLabel', { defaultMessage: 'Group by' })}
      onClick={togglePopover}
      data-test-subj="waffleGroupByDropdown"
    >
      {buttonBody}
    </DropdownButton>
  );

  return (
    <EuiPopover
      isOpen={isPopoverOpen}
      id="groupByPanel"
      button={button}
      panelPaddingSize="none"
      closePopover={closePopover}
      anchorPosition="downCenter"
      aria-label={i18n.translate('xpack.infra.waffle.groupByControls.ariaLabel', {
        defaultMessage: 'Group by',
      })}
    >
      <EuiContextMenu
        css={css`
          width: 320px;
          & .euiContextMenuItem__text {
            overflow: hidden;
            text-overflow: ellipsis;
          }
        `}
        initialPanelId="firstPanel"
        panels={panels}
        data-test-subj="groupByContextMenu"
      />
    </EuiPopover>
  );
};
