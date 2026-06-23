/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, useEffect, useMemo } from 'react';

import { i18n } from '@kbn/i18n';
import type { EuiContextMenuPanelDescriptor, UseEuiTheme } from '@elastic/eui';
import { EuiIcon, EuiPopover, EuiContextMenu } from '@elastic/eui';
import { css } from '@emotion/react';
import type { LegendAction, SeriesIdentifier } from '@elastic/charts';
import { useLegendAction } from '@elastic/charts';
import type { Datatable } from '@kbn/expressions-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { FILTER_CELL_ACTION_TYPE } from '@kbn/cell-actions/constants';
import type { IInterpreterRenderEvent } from '@kbn/expressions-plugin/common';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import { getComputedColumnWarningForColumns } from '@kbn/chart-expressions-common';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { PartitionVisParams } from '../../common/types';
import type { CellValueAction, ColumnCellValueActions, FilterEvent } from '../types';
import { getSeriesValueColumnIndex, getFilterPopoverTitle } from './filter_helpers';

const filterForValueLabel = i18n.translate(
  'expressionPartitionVis.legend.filterForValueButtonAriaLabel',
  {
    defaultMessage: 'Filter for',
  }
);

const filterOutValueLabel = i18n.translate(
  'expressionPartitionVis.legend.filterOutValueButtonAriaLabel',
  {
    defaultMessage: 'Filter out',
  }
);

const hasFilterCellAction = (actions: CellValueAction[]) => {
  return actions.some(({ type }) => type === FILTER_CELL_ACTION_TYPE);
};

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

export const getLegendActions = (
  canFilter: ((data: IInterpreterRenderEvent<unknown>) => Promise<boolean>) | undefined,
  getFilterEventData: (series: SeriesIdentifier) => FilterEvent | null,
  onFilter: (data: FilterEvent, negate?: any) => void,
  columnCellValueActions: ColumnCellValueActions,
  visParams: PartitionVisParams,
  visData: Datatable,
  formatter: FieldFormatsStart
): LegendAction => {
  return ({ series: [pieSeries] }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [isFilterable, setIsFilterable] = useState(true);
    const filterData = useMemo(() => getFilterEventData(pieSeries), [pieSeries]);
    const columnIndex = useMemo(
      () => getSeriesValueColumnIndex(pieSeries.key, visData),
      [pieSeries]
    );
    const [ref, onClose] = useLegendAction<HTMLDivElement>();

    const isEsqlMode = visData.meta?.type === ESQL_TABLE_TYPE;
    // column may be undefined when columnIndex === -1; the early return below ensures it is
    // non-null for the rest of the component.
    const column = columnIndex !== -1 ? visData.columns[columnIndex] : undefined;
    const warningMessage: string | undefined =
      isEsqlMode && column ? getComputedColumnWarningForColumns([column]) : undefined;

    useEffect(() => {
      if (!canFilter || !filterData || warningMessage) {
        setIsFilterable(false);
        return;
      }
      // Reset to true before the async check so we don't show a stale disabled state
      // while the promise is in flight.
      setIsFilterable(true);
      (async () => setIsFilterable(await canFilter(filterData)))();
    }, [filterData, warningMessage]);

    if (columnIndex === -1 || !column) {
      return null;
    }

    const title = getFilterPopoverTitle(
      visParams,
      visData,
      columnIndex,
      formatter.deserialize,
      // FIXME key could be a RangeKey see https://github.com/elastic/kibana/issues/153437
      pieSeries.key
    );

    const compatibleCellActions = columnCellValueActions[columnIndex] ?? [];

    const panelItems: EuiContextMenuPanelDescriptor['items'] = [];

    if (warningMessage) {
      // Show disabled filter items with a warning message for ES|QL computed columns
      panelItems.push(
        {
          name: filterForValueLabel,
          'data-test-subj': `legend-${title}-filterIn`,
          icon: <EuiIcon type="plusCircle" size="m" aria-hidden={true} />,
          disabled: true,
          onClick: () => {},
        },
        {
          name: filterOutValueLabel,
          'data-test-subj': `legend-${title}-filterOut`,
          icon: <EuiIcon type="minusCircle" size="m" aria-hidden={true} />,
          disabled: true,
          onClick: () => {},
        }
      );
      // Show warning message
      panelItems.push({
        renderItem: () => <PopoverFooterMessage message={warningMessage} />,
      });
    } else if (!hasFilterCellAction(compatibleCellActions) && isFilterable && filterData) {
      panelItems.push(
        {
          name: filterForValueLabel,
          'data-test-subj': `legend-${title}-filterIn`,
          icon: <EuiIcon type="plusCircle" size="m" aria-hidden={true} />,
          onClick: () => {
            setPopoverOpen(false);
            onFilter(filterData);
          },
        },
        {
          name: filterOutValueLabel,
          'data-test-subj': `legend-${title}-filterOut`,
          icon: <EuiIcon type="minusCircle" size="m" aria-hidden={true} />,
          onClick: () => {
            setPopoverOpen(false);
            onFilter(filterData, true);
          },
        }
      );
    }

    compatibleCellActions.forEach((action) => {
      panelItems.push({
        name: action.displayName,
        'data-test-subj': `legend-${title}-${action.id}`,
        icon: <EuiIcon type={action.iconType} size="m" aria-hidden={true} />,
        onClick: () => {
          action.execute([{ columnMeta: column.meta, value: pieSeries.key }]);
          setPopoverOpen(false);
        },
      });
    });

    if (panelItems.length === 0) {
      return null;
    }

    const panels: EuiContextMenuPanelDescriptor[] = [
      {
        id: 'main',
        title,
        items: panelItems,
      },
    ];

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
        data-test-subj={`legend-${title}`}
        onKeyDown={() => setPopoverOpen(!popoverOpen)}
        onClick={() => setPopoverOpen(!popoverOpen)}
        aria-label={i18n.translate('expressionPartitionVis.legend.legendActionsAria', {
          defaultMessage: 'Legend actions',
        })}
      >
        <EuiIcon size="s" type="boxesVertical" aria-hidden={true} />
      </div>
    );

    return (
      <EuiPopover
        aria-label={i18n.translate('expressionPartitionVis.legend.filterOptionsLegend', {
          defaultMessage: '{legendDataLabel}, filter options',
          values: { legendDataLabel: title },
        })}
        button={Button}
        isOpen={popoverOpen}
        closePopover={() => {
          setPopoverOpen(false);
          onClose();
        }}
        panelPaddingSize="none"
        anchorPosition="upLeft"
        title={i18n.translate('expressionPartitionVis.legend.filterOptionsLegend', {
          defaultMessage: '{legendDataLabel}, filter options',
          values: { legendDataLabel: title },
        })}
      >
        <EuiContextMenu initialPanelId="main" panels={panels} />
      </EuiPopover>
    );
  };
};
