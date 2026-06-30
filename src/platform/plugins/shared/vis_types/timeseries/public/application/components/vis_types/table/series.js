/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import PropTypes from 'prop-types';
import { AddDeleteButtons } from '../../add_delete_buttons';
import { TableSeriesConfig as SeriesConfig } from './config';
import { SeriesDragHandler } from '../../series_drag_handler';
import {
  EuiTabs,
  EuiTab,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldText,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui';
import { createTextHandler } from '../../lib/create_text_handler';
import { FormattedMessage, injectI18n } from '@kbn/i18n-react';
import { Aggs } from '../../aggs/aggs';
import { useSeriesBodyStyles } from '../../_series_editor';

function TableSeriesUI(props) {
  const {
    model,
    onAdd,
    name,
    fields,
    panel,
    onChange,
    onDelete,
    disableDelete,
    disableAdd,
    selectedTab,
    visible,
    intl,
    uiRestrictions,
  } = props;

  const seriesBodyStyles = useSeriesBodyStyles();

  const handleChange = createTextHandler(onChange);

  const toggleEditorLabel = intl.formatMessage({
    id: 'visTypeTimeseries.table.toggleSeriesEditorAriaLabel',
    defaultMessage: 'Toggle series editor',
  });

  let caretIcon = 'chevronSingleDown';
  if (!visible) caretIcon = 'chevronSingleRight';

  let body = null;
  if (visible) {
    let seriesBody;
    if (selectedTab === 'metrics') {
      seriesBody = (
        <div>
          <Aggs
            onChange={props.onChange}
            fields={fields}
            panel={panel}
            model={model}
            name={name}
            uiRestrictions={uiRestrictions}
            dragHandleProps={props.dragHandleProps}
          />
        </div>
      );
    } else {
      seriesBody = (
        <SeriesConfig
          panel={props.panel}
          fields={props.fields}
          model={props.model}
          onChange={props.onChange}
          indexPatternForQuery={props.indexPatternForQuery}
          uiRestrictions={props.uiRestrictions}
        />
      );
    }
    body = (
      <div className="tvbSeries__body" css={seriesBodyStyles}>
        <EuiTabs size="s">
          <EuiTab isSelected={selectedTab === 'metrics'} onClick={() => props.switchTab('metrics')}>
            <FormattedMessage
              id="visTypeTimeseries.table.tab.metricsLabel"
              defaultMessage="Metrics"
            />
          </EuiTab>
          <EuiTab
            data-test-subj="seriesOptions"
            isSelected={selectedTab === 'options'}
            onClick={() => props.switchTab('options')}
          >
            <FormattedMessage
              id="visTypeTimeseries.table.tab.optionsLabel"
              defaultMessage="Options"
            />
          </EuiTab>
        </EuiTabs>
        {seriesBody}
      </div>
    );
  }

  return (
    <div className={`${props.className}`} style={props.style}>
      <EuiFlexGroup responsive={false} gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiToolTip content={toggleEditorLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType={caretIcon}
              color="text"
              onClick={props.toggleVisible}
              aria-label={toggleEditorLabel}
              aria-expanded={props.visible}
            />
          </EuiToolTip>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFieldText
            fullWidth
            aria-label={intl.formatMessage({
              id: 'visTypeTimeseries.table.labelAriaLabel',
              defaultMessage: 'Label',
            })}
            onChange={handleChange('label')}
            placeholder={intl.formatMessage({
              id: 'visTypeTimeseries.table.labelPlaceholder',
              defaultMessage: 'Label',
            })}
            value={model.label}
          />
        </EuiFlexItem>

        <SeriesDragHandler
          dragHandleProps={props.dragHandleProps}
          hideDragHandler={props.disableDelete}
        />

        <EuiFlexItem grow={false}>
          <AddDeleteButtons
            addTooltip={intl.formatMessage({
              id: 'visTypeTimeseries.table.addSeriesTooltip',
              defaultMessage: 'Add Series',
            })}
            deleteTooltip={intl.formatMessage({
              id: 'visTypeTimeseries.table.deleteSeriesTooltip',
              defaultMessage: 'Delete Series',
            })}
            cloneTooltip={intl.formatMessage({
              id: 'visTypeTimeseries.table.cloneSeriesTooltip',
              defaultMessage: 'Clone Series',
            })}
            onDelete={onDelete}
            onClone={props.onClone}
            onAdd={onAdd}
            togglePanelActivation={props.togglePanelActivation}
            isPanelActive={!model.hidden}
            disableDelete={disableDelete}
            disableAdd={disableAdd}
            responsive={false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {body}
    </div>
  );
}

TableSeriesUI.propTypes = {
  className: PropTypes.string,
  disableAdd: PropTypes.bool,
  disableDelete: PropTypes.bool,
  fields: PropTypes.object,
  name: PropTypes.string,
  onAdd: PropTypes.func,
  onChange: PropTypes.func,
  onClone: PropTypes.func,
  onDelete: PropTypes.func,
  model: PropTypes.object,
  panel: PropTypes.object,
  selectedTab: PropTypes.string,
  style: PropTypes.object,
  switchTab: PropTypes.func,
  toggleVisible: PropTypes.func,
  visible: PropTypes.bool,
  togglePanelActivation: PropTypes.func,
  uiRestrictions: PropTypes.object,
  dragHandleProps: PropTypes.object,
  indexPatternForQuery: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
};

export const TableSeries = injectI18n(TableSeriesUI);
