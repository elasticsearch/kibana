/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import React, { Component } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiTextColor,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataViewField, DataView, Query } from '@kbn/data-plugin/common';
import { isNestedField } from '@kbn/data-views-plugin/common';
import { getIndexPatternService } from '../../../../kibana_services';
import { getDataViewNotFoundMessage } from '../../../../../common/i18n_getters';
import { AGG_TYPE, SOURCE_TYPES } from '../../../../../common/constants';
import type { JoinField } from '../join_editor';
import { isSpatialJoin } from '../../../../classes/joins/is_spatial_join';
import {
  isSpatialSourceComplete,
  isTermSourceComplete,
} from '../../../../classes/sources/join_sources';
import { SpatialJoinExpression } from './spatial_join_expression';
import { TermJoinExpression } from './term_join_expression';
import { MetricsExpression } from './metrics_expression';
import { WhereExpression } from './where_expression';
import { GlobalFilterCheckbox } from '../../../../components/global_filter_checkbox';
import { GlobalTimeCheckbox } from '../../../../components/global_time_checkbox';
import type {
  AbstractESJoinSourceDescriptor,
  AggDescriptor,
  ESDistanceSourceDescriptor,
  ESTermSourceDescriptor,
  JoinDescriptor,
  JoinSourceDescriptor,
} from '../../../../../common/descriptor_types';

interface Props {
  join: Partial<JoinDescriptor>;
  onChange: (joinDescriptor: Partial<JoinDescriptor>) => void;
  onRemove: () => void;
  leftFields: JoinField[];
  leftSourceName: string;
}

interface State {
  rightFields: DataViewField[];
  indexPattern?: DataView;
  loadError?: string;
}

export class Join extends Component<Props, State> {
  private _isMounted = false;
  private _nextIndexPatternId: string | undefined;

  state: State = {
    rightFields: [],
    indexPattern: undefined,
    loadError: undefined,
  };

  componentDidMount() {
    this._isMounted = true;
    this._loadRightFields(_.get(this.props.join, 'right.indexPatternId'));
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  async _loadRightFields(indexPatternId?: string) {
    if (!indexPatternId) {
      return;
    }

    this._nextIndexPatternId = indexPatternId;
    let indexPattern;
    try {
      indexPattern = await getIndexPatternService().get(indexPatternId);
    } catch (err) {
      if (this._isMounted) {
        this.setState({
          loadError: getDataViewNotFoundMessage(indexPatternId),
        });
      }
      return;
    }

    if (!this._isMounted || this._nextIndexPatternId !== indexPatternId) {
      return;
    }

    this.setState({
      rightFields: indexPattern.fields.filter((field) => !isNestedField(field)),
      indexPattern,
    });
  }

  _onLeftFieldChange = (leftField: string) => {
    this.props.onChange({
      leftField,
      right: this.props.join.right,
    });
  };

  _onRightSourceDescriptorChange = (sourceDescriptor: Partial<JoinSourceDescriptor>) => {
    const indexPatternId = (sourceDescriptor as Partial<AbstractESJoinSourceDescriptor>)
      .indexPatternId;
    if (this.state.indexPattern?.id !== indexPatternId) {
      this.setState({
        indexPattern: undefined,
        rightFields: [],
        loadError: undefined,
      });
      if (indexPatternId) {
        this._loadRightFields(indexPatternId);
      }
    }

    this.props.onChange({
      leftField: this.props.join.leftField,
      right: {
        ...sourceDescriptor,
      },
    });
  };

  _onMetricsChange = (metrics: AggDescriptor[]) => {
    this.props.onChange({
      leftField: this.props.join.leftField,
      right: {
        ...this.props.join.right,
        metrics,
      } as Partial<JoinSourceDescriptor>,
    });
  };

  _onWhereQueryChange = (whereQuery?: Query) => {
    this.props.onChange({
      leftField: this.props.join.leftField,
      right: {
        ...this.props.join.right,
        whereQuery,
      } as Partial<JoinSourceDescriptor>,
    });
  };

  _onApplyGlobalQueryChange = (applyGlobalQuery: boolean) => {
    this.props.onChange({
      leftField: this.props.join.leftField,
      right: {
        ...this.props.join.right,
        applyGlobalQuery,
      } as Partial<JoinSourceDescriptor>,
    });
  };

  _onApplyGlobalTimeChange = (applyGlobalTime: boolean) => {
    this.props.onChange({
      leftField: this.props.join.leftField,
      right: {
        ...this.props.join.right,
        applyGlobalTime,
      } as Partial<JoinSourceDescriptor>,
    });
  };

  render() {
    const { join, onRemove, leftFields, leftSourceName } = this.props;
    const { rightFields, indexPattern } = this.state;
    const right = (join?.right ?? {}) as Partial<AbstractESJoinSourceDescriptor>;

    let isJoinConfigComplete = false;
    let joinExpression;
    if (right.type === SOURCE_TYPES.ES_TERM_SOURCE) {
      isJoinConfigComplete =
        join.leftField !== undefined &&
        isTermSourceComplete(right as Partial<ESTermSourceDescriptor>);
      joinExpression = (
        <TermJoinExpression
          leftSourceName={leftSourceName}
          leftValue={join.leftField}
          leftFields={leftFields}
          onLeftFieldChange={this._onLeftFieldChange}
          sourceDescriptor={right as Partial<ESTermSourceDescriptor>}
          onSourceDescriptorChange={this._onRightSourceDescriptorChange}
          rightFields={rightFields}
        />
      );
    } else if (isSpatialJoin(this.props.join)) {
      isJoinConfigComplete =
        join.leftField !== undefined &&
        isSpatialSourceComplete(right as Partial<ESDistanceSourceDescriptor>);
      joinExpression = (
        <SpatialJoinExpression
          sourceDescriptor={right as Partial<ESDistanceSourceDescriptor>}
          onSourceDescriptorChange={this._onRightSourceDescriptorChange}
        />
      );
    } else {
      joinExpression = (
        <EuiText size="s">
          <p>
            <EuiTextColor color="warning">
              {i18n.translate('xpack.maps.layerPanel.join.joinExpression.noEditorMsg', {
                defaultMessage: 'Unable to edit {type} join.',
                values: { type: right.type },
              })}
            </EuiTextColor>
          </p>
        </EuiText>
      );
    }

    let metricsExpression;
    let globalFilterCheckbox;
    let globalTimeCheckbox;

    if (isJoinConfigComplete) {
      metricsExpression = (
        <EuiFlexItem grow={false}>
          <MetricsExpression
            metrics={right.metrics ? right.metrics : [{ type: AGG_TYPE.COUNT }]}
            rightFields={rightFields}
            onChange={this._onMetricsChange}
          />
        </EuiFlexItem>
      );
      globalFilterCheckbox = (
        <GlobalFilterCheckbox
          applyGlobalQuery={
            typeof right.applyGlobalQuery === 'undefined' ? true : right.applyGlobalQuery
          }
          setApplyGlobalQuery={this._onApplyGlobalQueryChange}
          label={i18n.translate('xpack.maps.layerPanel.join.applyGlobalQueryCheckboxLabel', {
            defaultMessage: `Apply global search to join`,
          })}
        />
      );
      if (this.state.indexPattern && this.state.indexPattern.timeFieldName) {
        globalTimeCheckbox = (
          <GlobalTimeCheckbox
            applyGlobalTime={
              typeof right.applyGlobalTime === 'undefined' ? true : right.applyGlobalTime
            }
            setApplyGlobalTime={this._onApplyGlobalTimeChange}
            label={i18n.translate('xpack.maps.layerPanel.join.applyGlobalTimeCheckboxLabel', {
              defaultMessage: `Apply global time to join`,
            })}
          />
        );
      }
    }

    let whereExpression;
    if (indexPattern && isJoinConfigComplete) {
      whereExpression = (
        <EuiFlexItem grow={false}>
          <WhereExpression
            indexPattern={indexPattern}
            whereQuery={right.whereQuery}
            onChange={this._onWhereQueryChange}
          />
        </EuiFlexItem>
      );
    }

    return (
      <div className="mapJoinItem">
        <EuiFlexGroup className="mapJoinItem__inner" responsive={false} wrap={true} gutterSize="s">
          <EuiFlexItem grow={false}>{joinExpression}</EuiFlexItem>

          {metricsExpression}

          {whereExpression}
        </EuiFlexGroup>

        {globalFilterCheckbox}

        {globalTimeCheckbox}

        <EuiToolTip
          content={i18n.translate('xpack.maps.layerPanel.join.deleteJoinTitle', {
            defaultMessage: 'Delete join',
          })}
          anchorClassName="mapJoinItem__delete"
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            aria-label={i18n.translate('xpack.maps.layerPanel.join.deleteJoinAriaLabel', {
              defaultMessage: 'Delete join',
            })}
            onClick={onRemove}
          />
        </EuiToolTip>
      </div>
    );
  }
}
