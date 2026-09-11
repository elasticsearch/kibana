/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';

import type { Position } from '@elastic/charts';
import React, { useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiTitle } from '@elastic/eui';
import type { LensPublicStart, UserMessage, XYVisualizationState } from '@kbn/lens-plugin/public';
import { observabilityFeatureId } from '@kbn/observability-shared-plugin/public';
import styled from '@emotion/styled';
import type { AnalyticsServiceSetup } from '@kbn/core-analytics-browser';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { useEBTTelemetry } from '../hooks/use_ebt_telemetry';
import type { AllSeries } from '../../../..';
import type { AppDataType, ReportViewType } from '../types';
import { OperationTypeComponent } from '../series_editor/columns/operation_type_select';
import type { DataViewState } from '../hooks/use_app_data_view';
import type { ReportConfigMap } from '../contexts/exploratory_view_config';
import type { ActionTypes } from './use_actions';
import { useActions } from './use_actions';
import { AddToCaseAction } from '../header/add_to_case_action';
import { useEmbeddableAttributes } from './use_embeddable_attributes';

// The cases plugin auto-registers its own "Add to case" action on the Lens panel
// menu. Exploratory View already provides its own `expViewAddToCase` action, so we
// disable the built-in one to avoid a duplicate menu entry (see issue #231475).
const DISABLED_ACTIONS = ['embeddable_addToExistingCase'];

// Compact KPI/sparkline embeddables cannot surface Lens inspector warnings usefully.
const hideLensWarningBadges = () => [];

export interface ExploratoryEmbeddableProps {
  id?: string;
  appendTitle?: JSX.Element;
  attributes: AllSeries;
  axisTitlesVisibility?: XYVisualizationState['axisTitlesVisibilitySettings'];
  gridlinesVisibilitySettings?: XYVisualizationState['gridlinesVisibilitySettings'];
  customHeight?: string;
  customTimeRange?: { from: string; to: string }; // required if rendered with LensAttributes
  dataTypesIndexPatterns?: Partial<Record<AppDataType, string>>;
  isSingleMetric?: boolean;
  legendIsVisible?: boolean;
  legendPosition?: Position;
  hideTicks?: boolean;
  onBrushEnd?: (param: { range: number[] }) => void;
  onLoad?: (loading: boolean) => void;
  onBeforeBadgesRender?: (userMessages: UserMessage[]) => UserMessage[];
  caseOwner?: string;
  reportConfigMap?: ReportConfigMap;
  reportType: ReportViewType;
  showCalculationMethod?: boolean;
  title?: string | JSX.Element;
  withActions?: boolean | ActionTypes[];
  align?: 'left' | 'right' | 'center';
  sparklineMode?: boolean;
  noLabel?: boolean;
  fontSize?: number;
  lineHeight?: number;
  dataTestSubj?: string;
  searchSessionId?: string;
  dslFilters?: QueryDslQueryContainer[];
}

export interface ExploratoryEmbeddableComponentProps extends ExploratoryEmbeddableProps {
  lens: LensPublicStart;
  dataViewState: DataViewState;
  analytics?: AnalyticsServiceSetup;
}

// eslint-disable-next-line import/no-default-export
export default function Embeddable(props: ExploratoryEmbeddableComponentProps) {
  const {
    appendTitle,
    attributes = [],
    axisTitlesVisibility,
    gridlinesVisibilitySettings,
    customHeight,
    customTimeRange,
    legendIsVisible,
    legendPosition,
    lens,
    onBrushEnd,
    caseOwner = observabilityFeatureId,
    reportType,
    showCalculationMethod = false,
    title,
    withActions = true,
    hideTicks,
    align,
    noLabel,
    fontSize = 27,
    lineHeight = 32,
    searchSessionId,
    onLoad,
    onBeforeBadgesRender,
    analytics,
  } = props;
  const LensComponent = lens?.EmbeddableComponent;
  const LensSaveModalComponent = lens?.SaveModalComponent;

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isAddToCaseOpen, setAddToCaseOpen] = useState(false);

  const series = Object.entries(attributes)[0]?.[1];

  const [operationType, setOperationType] = useState(series?.operationType);

  const attributesJSON = useEmbeddableAttributes(props);

  const timeRange = customTimeRange ?? series?.time;

  const { reportEvent } = useEBTTelemetry({
    analytics,
    queryName: series
      ? `${series.dataType}_${series.name}`
      : typeof title === 'string'
      ? title
      : 'Exp View embeddable query',
  });

  const actions = useActions({
    withActions,
    attributes,
    reportType,
    setIsSaveOpen,
    setAddToCaseOpen,
    lensAttributes: attributesJSON,
    timeRange,
  });

  if (!attributesJSON) {
    return null;
  }

  if (typeof axisTitlesVisibility !== 'undefined') {
    (attributesJSON.state.visualization as XYVisualizationState).axisTitlesVisibilitySettings =
      axisTitlesVisibility;
  }

  if (typeof gridlinesVisibilitySettings !== 'undefined') {
    (attributesJSON.state.visualization as XYVisualizationState).gridlinesVisibilitySettings =
      gridlinesVisibilitySettings;
  }

  if (typeof legendIsVisible !== 'undefined') {
    (attributesJSON.state.visualization as XYVisualizationState).legend.isVisible = legendIsVisible;
  }
  if (typeof legendPosition !== 'undefined') {
    (attributesJSON.state.visualization as XYVisualizationState).legend.position = legendPosition;
  }

  if (hideTicks) {
    (attributesJSON.state.visualization as XYVisualizationState).tickLabelsVisibilitySettings = {
      x: false,
      yRight: false,
      yLeft: false,
    };
  }

  if (!attributesJSON) {
    return null;
  }

  if (!LensComponent) {
    return (
      <EuiText>
        {i18n.translate('xpack.exploratoryView.embeddable.noLensComponentTextLabel', {
          defaultMessage: 'No lens component',
        })}
      </EuiText>
    );
  }

  return (
    <Wrapper
      $customHeight={customHeight}
      align={align}
      noLabel={noLabel}
      fontSize={fontSize}
      lineHeight={lineHeight}
    >
      {(title || showCalculationMethod || appendTitle) && (
        <EuiFlexGroup alignItems="center" gutterSize="none">
          {title && (
            <EuiFlexItem data-test-subj="exploratoryView-title">
              <EuiTitle size="xs">
                <h3>{title}</h3>
              </EuiTitle>
            </EuiFlexItem>
          )}
          {showCalculationMethod && (
            <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
              <OperationTypeComponent
                operationType={operationType}
                onChange={(val) => {
                  setOperationType(val);
                }}
              />
            </EuiFlexItem>
          )}
          {appendTitle && appendTitle}
        </EuiFlexGroup>
      )}

      <LensComponent
        id="exploratoryView"
        data-test-subj="exploratoryView"
        style={{ height: '100%' }}
        timeRange={timeRange}
        attributes={{ ...attributesJSON, title: '', description: '' }}
        onBrushEnd={onBrushEnd}
        withDefaultActions={Boolean(withActions)}
        disabledActions={DISABLED_ACTIONS}
        extraActions={actions}
        viewMode={'view'}
        searchSessionId={searchSessionId}
        onBeforeBadgesRender={onBeforeBadgesRender ?? hideLensWarningBadges}
        onLoad={(loading, inspectorAdapters) => {
          reportEvent(inspectorAdapters);
          onLoad?.(loading);
        }}
      />
      {isSaveOpen && attributesJSON && (
        <LensSaveModalComponent
          initialInput={{ attributes: attributesJSON }}
          onClose={() => setIsSaveOpen(false)}
          // if we want to do anything after the viz is saved
          // right now there is no action, so an empty function
          onSave={() => {}}
        />
      )}
      <AddToCaseAction
        lensAttributes={attributesJSON}
        timeRange={customTimeRange ?? series?.time}
        autoOpen={isAddToCaseOpen}
        setAutoOpen={setAddToCaseOpen}
        owner={caseOwner}
      />
    </Wrapper>
  );
}

const Wrapper = styled.div<{
  $customHeight?: string | number;
  align?: 'left' | 'right' | 'center';
  noLabel?: boolean;
  fontSize?: number;
  lineHeight?: number;
}>`
  height: ${(props) => (props.$customHeight ? `${props.$customHeight};` : `100%;`)};
  position: relative;
  min-width: 80px;
  &&& {
    > :nth-child(2) {
      height: ${(props) =>
        props.$customHeight ? `${props.$customHeight};` : `calc(100% - 32px);`};
    }
    .expExpressionRenderer__expression {
      padding: 0 !important;
    }

    .legacyMtrVis {
      > :first-child {
        justify-content: ${(props) =>
          props.align === 'left'
            ? `flex-start;`
            : props.align === 'right'
            ? `flex-end;`
            : 'center;'};
      }
      justify-content: flex-end;
      &__container {
        padding: 0;
        [data-test-subj='metric_label'] {
          ${({ noLabel }) =>
            noLabel &&
            ` display: none;
        `}
        }
      }
      &__value {
        line-height: ${({ lineHeight }) => lineHeight}px !important;
        font-size: ${({ fontSize }) => fontSize}px !important;
      }
      > :first-child {
        transform: none !important;
      }
    }

    .euiLoadingChart {
      position: absolute;
      top: 50%;
      right: 50%;
      transform: translate(50%, -50%);
    }
  }
`;
