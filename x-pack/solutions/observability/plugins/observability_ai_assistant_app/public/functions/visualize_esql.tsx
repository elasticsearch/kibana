/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiToolTip,
  EuiDescriptionListDescription,
  EuiIcon,
  EuiText,
  EuiDescriptionList,
} from '@elastic/eui';
import type { ESQLRow } from '@kbn/es-types';
import { ESQLDataGrid } from '@kbn/esql-datagrid/public';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public/types';
import { getESQLAdHocDataview } from '@kbn/esql-utils';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { i18n } from '@kbn/i18n';
import type {
  InlineEditLensEmbeddableContext,
  LensPublicStart,
  TypedLensByValueInput,
} from '@kbn/lens-plugin/public';
import type {
  ChatActionClickHandler,
  ObservabilityAIAssistantPublicStart,
  RegisterRenderFunctionDefinition,
  RenderFunction,
} from '@kbn/observability-ai-assistant-plugin/public';
import {
  ChatActionClickType,
  VisualizeESQLUserIntention,
} from '@kbn/observability-ai-assistant-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import { getLensAttributesFromSuggestion, ChartType } from '@kbn/visualization-utils';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import useAsync from 'react-use/lib/useAsync';
import { v4 as uuidv4 } from 'uuid';
import {
  type VisualizeESQLFunctionArguments,
  type VisualizeQueryResponse,
} from '../../common/functions/visualize_esql';

import type { ObservabilityAIAssistantAppPluginStartDependencies } from '../types';

const VISUALIZE_QUERY_FUNCTION_NAME = 'visualize_query';

interface VisualizeESQLProps {
  /** Lens start contract, get the ES|QL charts suggestions api */
  lens: LensPublicStart;
  /** Dataviews start contract, creates an adhoc dataview */
  dataViews: DataViewsServicePublic;
  /** UiActions start contract, triggers the inline editing flyout */
  uiActions: UiActionsStart;
  /** Datatable columns as returned from the ES|QL _query api, slightly processed to be kibana compliant */
  columns: DatatableColumn[];
  /** Datatable rows as returned from the ES|QL _query api */
  rows: ESQLRow[];
  /** The ES|QL query */
  query: string;
  /** Actions handler */
  onActionClick: ChatActionClickHandler;
  /** Optional, overwritten ES|QL Lens chart attributes
   * If not given, the embeddable gets them from the suggestions api
   */
  userOverrides?: unknown;
  /** User's preferation chart type as it comes from the model */
  preferredChartType?: ChartType;
  /** Error messages returned by the query validator */
  errorMessages?: string[];
  ObservabilityAIAssistantMultipaneFlyoutContext: ObservabilityAIAssistantPublicStart['ObservabilityAIAssistantMultipaneFlyoutContext'];
}

function generateId() {
  return uuidv4();
}
const saveVisualizationLabel = i18n.translate(
  'xpack.observabilityAiAssistant.lensESQLFunction.save',
  {
    defaultMessage: 'Save visualization',
  }
);

const editVisualizationLabel = i18n.translate(
  'xpack.observabilityAiAssistant.lensESQLFunction.edit',
  {
    defaultMessage: 'Edit visualization',
  }
);

export function VisualizeESQL({
  lens,
  dataViews,
  uiActions,
  columns,
  rows,
  query,
  onActionClick,
  userOverrides,
  preferredChartType,
  ObservabilityAIAssistantMultipaneFlyoutContext,
  errorMessages,
}: VisualizeESQLProps) {
  const lensHelpersAsync = useAsync(() => {
    return lens.stateHelperApi();
  }, [lens]);

  const dataViewAsync = useAsync(() => {
    return getESQLAdHocDataview({
      dataViewsService: dataViews,
      query,
      options: { skipFetchFields: true },
    });
  }, [query, dataViews]);

  const chatFlyoutSecondSlotHandler = useContext(ObservabilityAIAssistantMultipaneFlyoutContext);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isTableVisible, setIsTableVisible] = useState(false);
  const [lensInput, setLensInput] = useState<TypedLensByValueInput | undefined>(
    userOverrides as TypedLensByValueInput
  );
  const [lensLoadEvent, setLensLoadEvent] = useState<
    InlineEditLensEmbeddableContext['lensEvent'] | null
  >(null);

  const onLoad = useCallback(
    (
      isLoading: boolean,
      adapters: InlineEditLensEmbeddableContext['lensEvent']['adapters'] | undefined,
      dataLoading$?: InlineEditLensEmbeddableContext['lensEvent']['dataLoading$']
    ) => {
      const adapterTables = adapters?.tables?.tables;
      if (adapterTables && !isLoading) {
        setLensLoadEvent({
          adapters,
          dataLoading$,
        });
      }
    },
    []
  );

  // initialization
  useEffect(() => {
    if (lensHelpersAsync.value && dataViewAsync.value && !lensInput) {
      const context = {
        dataViewSpec: dataViewAsync.value?.toSpec(),
        fieldName: '',
        textBasedColumns: columns,
        query: {
          esql: query,
        },
      };

      const chartSuggestions = lensHelpersAsync.value.suggestions(
        context,
        dataViewAsync.value,
        [],
        preferredChartType
      );

      if (chartSuggestions?.length) {
        const [suggestion] = chartSuggestions;

        const attrs = getLensAttributesFromSuggestion({
          filters: [],
          query: {
            esql: query,
          },
          suggestion,
          dataView: dataViewAsync.value,
        }) as TypedLensByValueInput['attributes'];

        const lensEmbeddableInput = {
          attributes: attrs,
          id: generateId(),
        };
        setLensInput(lensEmbeddableInput);
      }
    }
  }, [columns, dataViewAsync.value, lensHelpersAsync.value, lensInput, query, preferredChartType]);

  // trigger options to open the inline editing flyout correctly
  const triggerOptions: InlineEditLensEmbeddableContext | undefined = useMemo(() => {
    if (lensInput?.attributes) {
      return {
        attributes: lensInput?.attributes,
        lensEvent: lensLoadEvent ?? { adapters: {} },
        onUpdate: (newAttributes: TypedLensByValueInput['attributes']) => {
          if (lensInput) {
            const newInput = {
              ...lensInput,
              attributes: newAttributes,
            };
            setLensInput(newInput);
          }
        },
        onApply: (newAttributes: TypedLensByValueInput['attributes']) => {
          const newInput = {
            ...lensInput,
            attributes: newAttributes,
          };
          onActionClick({
            type: ChatActionClickType.updateVisualization,
            userOverrides: newInput,
            query,
          });
          chatFlyoutSecondSlotHandler?.setVisibility?.(false);
          if (chatFlyoutSecondSlotHandler?.container) {
            ReactDOM.unmountComponentAtNode(chatFlyoutSecondSlotHandler.container);
          }
        },
        onCancel: () => {
          onActionClick({
            type: ChatActionClickType.updateVisualization,
            userOverrides: lensInput,
            query,
          });
          chatFlyoutSecondSlotHandler?.setVisibility?.(false);
          if (chatFlyoutSecondSlotHandler?.container) {
            ReactDOM.unmountComponentAtNode(chatFlyoutSecondSlotHandler.container);
          }
        },
        container: chatFlyoutSecondSlotHandler?.container,
      };
    }
  }, [chatFlyoutSecondSlotHandler, lensInput, lensLoadEvent, onActionClick, query]);

  if (!lensHelpersAsync.value || !dataViewAsync.value || !lensInput) {
    return <EuiLoadingSpinner />;
  }
  // if the Lens suggestions api suggests a table then we want to render a Discover table instead
  const isLensInputTable = lensInput?.attributes?.visualizationType === 'lnsDatatable';

  const visualizationComponentDataTestSubj = isTableVisible
    ? 'observabilityAiAssistantESQLDataGrid'
    : 'observabilityAiAssistantESQLLensChart';

  return (
    <>
      <EuiFlexGroup direction="column">
        {!!errorMessages?.length && (
          <>
            <EuiText size="s">
              {i18n.translate('xpack.observabilityAiAssistant.lensESQLFunction.errorMessage', {
                defaultMessage: 'There were some errors in the generated query',
              })}
            </EuiText>
            <EuiDescriptionList data-test-subj="observabilityAiAssistantErrorsList">
              {errorMessages.map((error, index) => {
                return (
                  <EuiDescriptionListDescription key={index}>
                    <EuiFlexGroup gutterSize="s" alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="error" color="danger" size="s" aria-hidden={true} />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>{error}</EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiDescriptionListDescription>
                );
              })}
            </EuiDescriptionList>
          </>
        )}
        {!isLensInputTable && (
          <>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup direction="row" gutterSize="s" justifyContent="flexEnd">
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={
                      isTableVisible
                        ? i18n.translate(
                            'xpack.observabilityAiAssistant.lensESQLFunction.visualization',
                            {
                              defaultMessage: 'Visualization',
                            }
                          )
                        : i18n.translate('xpack.observabilityAiAssistant.lensESQLFunction.table', {
                            defaultMessage: 'Table of results',
                          })
                    }
                  >
                    <EuiButtonIcon
                      size="xs"
                      iconType={isTableVisible ? 'chartBarVerticalStack' : 'tableDensityLow'}
                      onClick={() => setIsTableVisible(!isTableVisible)}
                      data-test-subj="observabilityAiAssistantLensESQLDisplayTableButton"
                      aria-label={
                        isTableVisible
                          ? i18n.translate(
                              'xpack.observabilityAiAssistant.lensESQLFunction.displayChart',
                              {
                                defaultMessage: 'Display chart',
                              }
                            )
                          : i18n.translate(
                              'xpack.observabilityAiAssistant.lensESQLFunction.displayTable',
                              {
                                defaultMessage: 'Display table',
                              }
                            )
                      }
                    />
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiToolTip content={editVisualizationLabel} disableScreenReaderOutput>
                  <EuiButtonIcon
                    size="xs"
                    iconType="pencil"
                    onClick={() => {
                      chatFlyoutSecondSlotHandler?.setVisibility?.(true);
                      if (triggerOptions) {
                        uiActions.executeTriggerActions(
                          'IN_APP_EMBEDDABLE_EDIT_TRIGGER',
                          triggerOptions
                        );
                      }
                    }}
                    data-test-subj="observabilityAiAssistantLensESQLEditButton"
                    aria-label={editVisualizationLabel}
                  />
                </EuiToolTip>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={saveVisualizationLabel} disableScreenReaderOutput>
                    <EuiButtonIcon
                      size="xs"
                      iconType="save"
                      onClick={() => setIsSaveModalOpen(true)}
                      data-test-subj="observabilityAiAssistantLensESQLSaveButton"
                      aria-label={saveVisualizationLabel}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem data-test-subj={visualizationComponentDataTestSubj}>
              {isTableVisible ? (
                <ESQLDataGrid
                  rows={rows}
                  columns={columns}
                  dataView={dataViewAsync.value}
                  query={{ esql: query }}
                  flyoutType="overlay"
                  isTableView
                  initialRowHeight={0}
                />
              ) : (
                <lens.EmbeddableComponent
                  {...lensInput}
                  style={{
                    height: 240,
                  }}
                  onLoad={onLoad}
                />
              )}
            </EuiFlexItem>
          </>
        )}
        {/* hide the grid in case of errors (as the user can't fix them) */}
        {isLensInputTable && !errorMessages?.length && (
          <EuiFlexItem data-test-subj="observabilityAiAssistantESQLDataGrid">
            <ESQLDataGrid
              rows={rows}
              columns={columns}
              dataView={dataViewAsync.value}
              query={{ esql: query }}
              flyoutType="overlay"
              initialRowHeight={0}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {isSaveModalOpen ? (
        <lens.SaveModalComponent
          initialInput={lensInput}
          onClose={() => {
            setIsSaveModalOpen(() => false);
          }}
          // For now, we don't want to allow saving ESQL charts to the library
          isSaveable={false}
        />
      ) : null}
    </>
  );
}

export function registerVisualizeQueryRenderFunction({
  registerRenderFunction,
  pluginsStart,
}: {
  registerRenderFunction: RegisterRenderFunctionDefinition;
  pluginsStart: ObservabilityAIAssistantAppPluginStartDependencies;
}) {
  registerRenderFunction(
    VISUALIZE_QUERY_FUNCTION_NAME,
    ({
      arguments: { query, userOverrides, intention },
      response,
      onActionClick,
    }: Parameters<RenderFunction<VisualizeESQLFunctionArguments, {}>>[0]) => {
      const typedResponse = response as VisualizeQueryResponse;

      const columns = 'data' in typedResponse ? typedResponse.data.columns : typedResponse.content;
      const rows = 'data' in typedResponse ? typedResponse.data.rows : [];
      const errorMessages =
        'content' in typedResponse && 'errorMessages' in typedResponse.content
          ? typedResponse.content.errorMessages
          : [];

      const correctedQuery =
        'data' in typedResponse && 'correctedQuery' in typedResponse.data
          ? typedResponse.data.correctedQuery
          : query;

      if ('data' in typedResponse && 'userOverrides' in typedResponse.data) {
        userOverrides = typedResponse.data.userOverrides;
      }

      let preferredChartType: ChartType | undefined;

      switch (intention) {
        case VisualizeESQLUserIntention.executeAndReturnResults:
        case VisualizeESQLUserIntention.generateQueryOnly:
        case VisualizeESQLUserIntention.visualizeAuto:
          break;

        case VisualizeESQLUserIntention.visualizeBar:
          preferredChartType = ChartType.Bar;
          break;

        case VisualizeESQLUserIntention.visualizeDonut:
          preferredChartType = ChartType.Donut;
          break;

        case VisualizeESQLUserIntention.visualizeHeatmap:
          preferredChartType = ChartType.Heatmap;
          break;

        case VisualizeESQLUserIntention.visualizeLine:
          preferredChartType = ChartType.Line;
          break;

        case VisualizeESQLUserIntention.visualizeArea:
          preferredChartType = ChartType.Area;
          break;

        case VisualizeESQLUserIntention.visualizeTable:
          preferredChartType = ChartType.Table;
          break;

        case VisualizeESQLUserIntention.visualizeTagcloud:
          preferredChartType = ChartType.Tagcloud;
          break;

        case VisualizeESQLUserIntention.visualizeTreemap:
          preferredChartType = ChartType.Treemap;
          break;

        case VisualizeESQLUserIntention.visualizeWaffle:
          preferredChartType = ChartType.Waffle;
          break;

        case VisualizeESQLUserIntention.visualizeXy:
          preferredChartType = ChartType.XY;
          break;
      }

      const trimmedQuery = correctedQuery.trim();

      return (
        <VisualizeESQL
          ObservabilityAIAssistantMultipaneFlyoutContext={
            pluginsStart.observabilityAIAssistant.ObservabilityAIAssistantMultipaneFlyoutContext
          }
          lens={pluginsStart.lens}
          dataViews={pluginsStart.dataViews}
          uiActions={pluginsStart.uiActions}
          columns={columns}
          rows={rows}
          query={trimmedQuery}
          onActionClick={onActionClick}
          userOverrides={userOverrides}
          preferredChartType={preferredChartType}
          errorMessages={errorMessages}
        />
      );
    }
  );
}
