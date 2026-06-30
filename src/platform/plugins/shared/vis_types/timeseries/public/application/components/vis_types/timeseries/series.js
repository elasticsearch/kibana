/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import PropTypes from 'prop-types';
import React from 'react';
import { FormattedMessage, injectI18n } from '@kbn/i18n-react';
import {
  EuiTabs,
  EuiTab,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldText,
  EuiButtonIcon,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { ColorPicker } from '../../color_picker';
import { AddDeleteButtons } from '../../add_delete_buttons';
import { Aggs } from '../../aggs/aggs';
import { TimeseriesConfig as SeriesConfig } from './config';
import { SeriesDragHandler } from '../../series_drag_handler';
import { Split } from '../../split';
import { createTextHandler } from '../../lib/create_text_handler';
import { tsvbEditorRowStyles, aggRowSplitStyles } from '../../../styles/common.styles';
import { useSeriesBodyStyles } from '../../_series_editor';

const TimeseriesSeriesUI = injectI18n(function (props) {
  const {
    panel,
    fields,
    onAdd,
    onDelete,
    disableDelete,
    disableAdd,
    selectedTab,
    onChange,
    visible,
    intl,
    name,
    uiRestrictions,
    seriesQuantity,
  } = props;

  const { euiTheme } = useEuiTheme();
  const seriesBodyStyles = useSeriesBodyStyles();

  const defaults = {
    label: '',
  };
  const model = { ...defaults, ...props.model };

  const handleChange = createTextHandler(onChange);

  const toggleEditorLabel = intl.formatMessage({
    id: 'visTypeTimeseries.timeSeries.toggleSeriesEditorAriaLabel',
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
          <div css={[tsvbEditorRowStyles(euiTheme), aggRowSplitStyles(euiTheme)]}>
            <Split
              onChange={props.onChange}
              fields={fields}
              panel={panel}
              model={model}
              uiRestrictions={uiRestrictions}
              seriesQuantity={seriesQuantity}
            />
          </div>
        </div>
      );
    } else {
      seriesBody = (
        <SeriesConfig
          fields={props.fields}
          panel={panel}
          model={model}
          onChange={props.onChange}
          indexPatternForQuery={props.indexPatternForQuery}
          seriesQuantity={seriesQuantity}
        />
      );
    }
    body = (
      <div className="tvbSeries__body" css={seriesBodyStyles}>
        <EuiTabs size="s">
          <EuiTab isSelected={selectedTab === 'metrics'} onClick={() => props.switchTab('metrics')}>
            <FormattedMessage
              id="visTypeTimeseries.timeSeries.tab.metricsLabel"
              defaultMessage="Metrics"
            />
          </EuiTab>
          <EuiTab
            data-test-subj="seriesOptions"
            isSelected={selectedTab === 'options'}
            onClick={() => props.switchTab('options')}
          >
            <FormattedMessage
              id="visTypeTimeseries.timeSeries.tab.optionsLabel"
              defaultMessage="Options"
            />
          </EuiTab>
        </EuiTabs>
        {seriesBody}
      </div>
    );
  }

  const colorPicker = (
    <ColorPicker disableTrash={true} onChange={props.onChange} name="color" value={model.color} />
  );

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

        <EuiFlexItem grow={false}>{colorPicker}</EuiFlexItem>

        <EuiFlexItem>
          <EuiFieldText
            fullWidth
            onChange={handleChange('label')}
            placeholder={intl.formatMessage({
              id: 'visTypeTimeseries.timeSeries.labelPlaceholder',
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
              id: 'visTypeTimeseries.timeSeries.addSeriesTooltip',
              defaultMessage: 'Add Series',
            })}
            deleteTooltip={intl.formatMessage({
              id: 'visTypeTimeseries.timeSeries.deleteSeriesTooltip',
              defaultMessage: 'Delete Series',
            })}
            cloneTooltip={intl.formatMessage({
              id: 'visTypeTimeseries.timeSeries.cloneSeriesTooltip',
              defaultMessage: 'Clone Series',
            })}
            onDelete={onDelete}
            onClone={props.onClone}
            togglePanelActivation={props.togglePanelActivation}
            isPanelActive={!model.hidden}
            onAdd={onAdd}
            disableDelete={disableDelete}
            disableAdd={disableAdd}
            responsive={false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {body}
    </div>
  );
});

TimeseriesSeriesUI.propTypes = {
  className: PropTypes.string,
  colorPicker: PropTypes.bool,
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
  seriesQuantity: PropTypes.object,
};

export const TimeseriesSeries = injectI18n(TimeseriesSeriesUI);
