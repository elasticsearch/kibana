/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiContextMenuPanelDescriptor, UseEuiTheme } from '@elastic/eui';
import { EuiIcon, EuiPopover, EuiContextMenu } from '@elastic/eui';
import { useLegendAction } from '@elastic/charts';
import { css } from '@emotion/react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { FILTER_CELL_ACTION_TYPE } from '@kbn/cell-actions/constants';
import type { CellValueAction } from '../types';

const hasFilterCellAction = (actions: CellValueAction[]) =>
  actions.some(({ type }) => type === FILTER_CELL_ACTION_TYPE);

const footerMessageStyles = {
  root: ({ euiTheme }: UseEuiTheme) =>
    css`
      padding: ${euiTheme.size.m};
      color: ${euiTheme.colors.textSubdued};
      border-block-start: ${euiTheme.border.thin};
      margin-block: ${euiTheme.size.s} -${euiTheme.size.s};
      margin-inline: -${euiTheme.size.s};
    `,
};

const PopoverFooterMessage = ({ message }: { message: string }) => {
  const styles = useMemoCss(footerMessageStyles);
  return (
    <div css={styles.root} data-test-subj="legendFilterFooterMessage">
      {message}
    </div>
  );
};

export type LegendCellValueActions = Array<
  Omit<CellValueAction, 'execute'> & { execute: () => void; disabled?: boolean }
>;

export const LegendActionPopover: React.FunctionComponent<{
  /** Determines the panels label. */
  label: string;
  /** Callback on filter value. */
  onFilter: (param?: { negate?: boolean }) => void;
  /** Compatible actions to be added to the popover actions. */
  legendCellValueActions?: LegendCellValueActions;
  /** When true, built-in Filter for / Filter out items are shown as disabled. */
  showDisabledFilterActions?: boolean;
  /** Warning message rendered below the disabled filter actions. */
  footerMessage?: string;
}> = ({
  label,
  onFilter,
  legendCellValueActions = [],
  showDisabledFilterActions = false,
  footerMessage,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [ref, onClose] = useLegendAction<HTMLDivElement>();

  const panels: EuiContextMenuPanelDescriptor[] = useMemo(() => {
    const defaultFilterActions: LegendCellValueActions = [
      {
        id: 'filterIn',
        displayName: i18n.translate('expressionXY.legend.filterForValueButtonAriaLabel', {
          defaultMessage: 'Filter for',
        }),
        iconType: 'plusCircle',
        execute: () => onFilter(),
      },
      {
        id: 'filterOut',
        displayName: i18n.translate('expressionXY.legend.filterOutValueButtonAriaLabel', {
          defaultMessage: 'Filter out',
        }),
        iconType: 'minusCircle',
        execute: () => onFilter({ negate: true }),
      },
    ];

    const toMenuItem = (action: LegendCellValueActions[number]) => ({
      name: action.displayName,
      'data-test-subj': `legend-${label}-${action.id}`,
      icon: <EuiIcon type={action.iconType} size="m" aria-hidden={true} />,
      disabled: action.disabled ?? false,
      onClick: () => {
        action.execute();
        setPopoverOpen(false);
      },
    });

    // Always show the built-in filter actions when filtering is disabled, so the user
    // can see they exist but are disabled
    const showDefaultFilterActions =
      !hasFilterCellAction(legendCellValueActions) || showDisabledFilterActions;

    const filterPanelItems = (
      showDefaultFilterActions
        ? showDisabledFilterActions
          ? defaultFilterActions.map((action) => ({ ...action, disabled: true, execute: () => {} }))
          : defaultFilterActions
        : []
    ).map(toMenuItem);

    const cellValuePanelItems = legendCellValueActions.map(toMenuItem);

    const footerMessageItem = footerMessage
      ? [
          {
            renderItem: () => <PopoverFooterMessage message={footerMessage} />,
          },
        ]
      : [];

    return [
      {
        id: 'main',
        title: label,
        items: [...filterPanelItems, ...footerMessageItem, ...cellValuePanelItems],
      },
    ];
  }, [label, legendCellValueActions, onFilter, showDisabledFilterActions, footerMessage]);

  const Button = (
    <div
      tabIndex={0}
      ref={ref}
      role="button"
      aria-pressed="false"
      css={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        marginLeft: 4,
        marginRight: 4,
      }}
      data-test-subj={`legend-${label}`}
      onKeyDown={() => setPopoverOpen(!popoverOpen)}
      onClick={() => setPopoverOpen(!popoverOpen)}
      aria-label={i18n.translate('expressionXY.legend.legendActionsAria', {
        defaultMessage: 'Legend actions',
      })}
    >
      <EuiIcon size="s" type="boxesVertical" aria-hidden={true} />
    </div>
  );
  return (
    <EuiPopover
      aria-label={i18n.translate('expressionXY.legend.filterOptionsLegend', {
        defaultMessage: '{legendDataLabel}, filter options',
        values: { legendDataLabel: label },
      })}
      button={Button}
      isOpen={popoverOpen}
      closePopover={() => {
        setPopoverOpen(false);
        onClose();
      }}
      panelPaddingSize="none"
      anchorPosition="upLeft"
      title={i18n.translate('expressionXY.legend.filterOptionsLegend', {
        defaultMessage: '{legendDataLabel}, filter options',
        values: { legendDataLabel: label },
      })}
    >
      <EuiContextMenu initialPanelId="main" panels={panels} />
    </EuiPopover>
  );
};
