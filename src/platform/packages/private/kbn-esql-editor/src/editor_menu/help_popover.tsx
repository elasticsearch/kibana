/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { EuiFlyoutProps } from '@elastic/eui';
import {
  EuiPopover,
  EuiButtonIcon,
  type EuiContextMenuPanelDescriptor,
  EuiContextMenuItem,
  EuiContextMenu,
  EuiToolTip,
  useEuiScrollBar,
  useEuiTheme,
} from '@elastic/eui';
import { isEqual } from 'lodash';
import { css } from '@emotion/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import useObservable from 'react-use/lib/useObservable';
import { i18n } from '@kbn/i18n';
import { getESQLAdHocDataview, getEditorExtensions } from '@kbn/esql-utils';
import {
  type RecommendedQuery,
  type ESQLRegistrySolutionId,
  QuerySource,
  ESQL_CLASSIC_SOLUTION_ID,
} from '@kbn/esql-types';
import { getRecommendedQueriesTemplates } from '@kbn/esql-language/src/commands/registry/options/recommended_queries';
import { LanguageDocumentationFlyout } from '@kbn/language-documentation';
import { getCategorizationField } from '@kbn/aiops-utils';
import { prettifyQueryTemplate } from '@kbn/esql-language/src/commands/registry/options/recommended_queries/utils';
import { ESQLEditorTelemetryService } from '../telemetry/telemetry_service';
import { reportEsqlError } from '../report_error';
import type { ESQLEditorDeps } from '../types';
import { useEsqlEditorActions } from '../editor_actions_context';
import { helpLabel } from './menu_i18n';

export const HelpPopover: React.FC<{
  onESQLDocsFlyoutVisibilityChanged?: (isOpen: boolean) => void;
  /** Size for the docs flyout. Pass a named size when embedded in another flyout. */
  docsFlyoutSize?: EuiFlyoutProps['size'];
}> = ({ onESQLDocsFlyoutVisibilityChanged, docsFlyoutSize }) => {
  const kibana = useKibana<ESQLEditorDeps>();
  const { core, data } = kibana.services;
  const { docLinks, http, chrome, analytics } = core;

  const { euiTheme } = useEuiTheme();
  const actions = useEsqlEditorActions();
  const currentQueryRef = useRef<string>('');
  currentQueryRef.current = actions?.currentQuery ?? '';

  const activeSolutionNavId = useObservable(chrome.getActiveSolutionNavId$());
  const activeSolutionId = activeSolutionNavId ?? ESQL_CLASSIC_SOLUTION_ID;
  const [isESQLMenuPopoverOpen, setIsESQLMenuPopoverOpen] = useState(false);
  const [isLanguageComponentOpen, setIsLanguageComponentOpen] = useState(false);

  const [dataviewDerived, setDataviewDerived] = useState<{
    queryForRecommendedQueries: string;
    timeFieldName: string | undefined;
    categorizationField: string | undefined;
    dataviewName: string | undefined;
  }>({
    queryForRecommendedQueries: '',
    timeFieldName: undefined,
    categorizationField: undefined,
    dataviewName: undefined,
  });

  useEffect(() => {
    onESQLDocsFlyoutVisibilityChanged?.(isLanguageComponentOpen);
  }, [isLanguageComponentOpen, onESQLDocsFlyoutVisibilityChanged]);

  const [solutionsRecommendedQueries, setSolutionsRecommendedQueries] = useState<
    RecommendedQuery[]
  >([]);

  const telemetryServiceRef = useRef(new ESQLEditorTelemetryService(analytics));

  useEffect(() => {
    let isMounted = true;
    if (!isESQLMenuPopoverOpen) {
      return () => {
        isMounted = false;
      };
    }

    const resetDataviewDerived = () => {
      setDataviewDerived({
        queryForRecommendedQueries: '',
        timeFieldName: undefined,
        categorizationField: undefined,
        dataviewName: undefined,
      });
    };

    const getDataViewForQuery = async () => {
      const currentQuery = currentQueryRef.current;
      try {
        const dataView = await getESQLAdHocDataview({
          dataViewsService: data.dataViews,
          query: currentQuery || '',
          http,
        });
        if (!isMounted) return;
        if (dataView) {
          const textFields = dataView.fields?.getByType('string') ?? [];
          const tempCategorizationField = textFields.length
            ? getCategorizationField(textFields.map((field) => field.name))
            : undefined;
          setDataviewDerived({
            queryForRecommendedQueries: `FROM ${dataView.name}`,
            timeFieldName: dataView.timeFieldName ?? dataView.fields?.getByType('date')?.[0]?.name,
            categorizationField: tempCategorizationField,
            dataviewName: dataView.name,
          });
        } else {
          resetDataviewDerived();
        }
      } catch (error) {
        if (isMounted) {
          resetDataviewDerived();
        }
      }
    };
    getDataViewForQuery();

    return () => {
      isMounted = false;
    };
  }, [data.dataViews, http, isESQLMenuPopoverOpen]);

  const { queryForRecommendedQueries, timeFieldName, categorizationField, dataviewName } =
    dataviewDerived;

  const lastFetchedQueries = useRef<RecommendedQuery[]>([]);

  useEffect(() => {
    let cancelled = false;
    const getESQLExtensions = async () => {
      if (!activeSolutionId || !queryForRecommendedQueries) {
        return;
      }

      try {
        const query = currentQueryRef.current || queryForRecommendedQueries;
        const extensions = await getEditorExtensions(
          http,
          query,
          activeSolutionId as ESQLRegistrySolutionId
        );

        if (cancelled) return;
        // Only update state if the new data is actually different from the *last successfully set* data
        if (!isEqual(extensions.recommendedQueries, lastFetchedQueries.current)) {
          setSolutionsRecommendedQueries(extensions.recommendedQueries);
          lastFetchedQueries.current = extensions.recommendedQueries;
        }
      } catch (error) {
        reportEsqlError(error, { errorType: 'HelpExtensionsFetch' });
      }
    };

    getESQLExtensions();

    return () => {
      cancelled = true;
    };
  }, [activeSolutionId, http, queryForRecommendedQueries]);

  const toggleLanguageComponent = useCallback(() => {
    if (actions?.editorIsInline) {
      actions.toggleLanguageComponent();
      setIsESQLMenuPopoverOpen(false);
      return;
    }
    setIsLanguageComponentOpen(!isLanguageComponentOpen);
    setIsESQLMenuPopoverOpen(false);
  }, [actions, isLanguageComponentOpen]);

  const onHelpMenuVisibilityChange = useCallback(
    (status: boolean) => {
      setIsLanguageComponentOpen(status);
    },
    [setIsLanguageComponentOpen]
  );

  const esqlContextMenuPanels = useMemo(() => {
    const recommendedQueries = [];
    if (solutionsRecommendedQueries.length) {
      recommendedQueries.push(
        ...solutionsRecommendedQueries.map((recommendedQuery) => {
          // If the query is standalone, return the query string directly
          if (recommendedQuery.isStandalone) {
            return {
              label: recommendedQuery.name,
              queryString: recommendedQuery.query,
            };
          }

          const template = prettifyQueryTemplate(recommendedQuery.query);
          // Check if query starts with FROM or TS
          const startsWithTs = recommendedQuery.query.startsWith('TS');
          const queryString = startsWithTs
            ? `TS ${dataviewName ?? ''} ${template}`
            : `${queryForRecommendedQueries} ${template}`;

          return {
            label: recommendedQuery.name,
            queryString,
          };
        })
      );
    }
    // Handle the static recommended queries, no solutions specific
    if (queryForRecommendedQueries && timeFieldName) {
      const recommendedQueriesFromStaticTemplates = getRecommendedQueriesTemplates({
        fromCommand: queryForRecommendedQueries,
        timeField: timeFieldName,
        categorizationField,
      });

      recommendedQueries.push(...recommendedQueriesFromStaticTemplates);
    }
    const panels = [
      {
        id: 0,
        items: [
          {
            name: i18n.translate('esqlEditor.menu.quickReference', {
              defaultMessage: 'Help',
            }),
            icon: 'documentation',
            renderItem: () => (
              <EuiContextMenuItem
                key="quickReference"
                data-test-subj="esql-quick-reference"
                onClick={() => toggleLanguageComponent()}
              >
                {i18n.translate('esqlEditor.menu.quickReference', {
                  defaultMessage: 'Help',
                })}
              </EuiContextMenuItem>
            ),
          },
          ...(Boolean(recommendedQueries.length)
            ? [
                {
                  name: i18n.translate('esqlEditor.menu.exampleQueries', {
                    defaultMessage: 'Recommended queries',
                  }),
                  panel: 1,
                  'data-test-subj': 'esql-recommended-queries',
                },
              ]
            : []),
        ],
      },
      {
        id: 1,
        title: i18n.translate('esqlEditor.menu.exampleQueries', {
          defaultMessage: 'Recommended queries',
        }),
        items: recommendedQueries.map((query) => {
          return {
            name: query.label,
            onClick: () => {
              telemetryServiceRef.current.trackRecommendedQueryClicked(
                QuerySource.HELP,
                query.label
              );
              actions?.submitEsqlQuery?.(query.queryString);
              telemetryServiceRef.current.trackQuerySubmitted({
                source: QuerySource.HELP,
                query: query.queryString,
              });
              setIsESQLMenuPopoverOpen(false);
            },
          };
        }),
      },
    ];
    return panels as EuiContextMenuPanelDescriptor[];
  }, [
    actions,
    categorizationField,
    dataviewName,
    queryForRecommendedQueries,
    solutionsRecommendedQueries,
    timeFieldName,
    toggleLanguageComponent,
  ]);

  const esqlMenuPopoverStyles = css`
    width: 240px;
    padding: ${euiTheme.size.s};
    max-height: 350px;
    overflow-y: auto;
    ${useEuiScrollBar()};
  `;

  return (
    <>
      <EuiPopover
        aria-label={helpLabel}
        button={
          <EuiToolTip position="top" content={helpLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              color="text"
              onClick={() => setIsESQLMenuPopoverOpen(!isESQLMenuPopoverOpen)}
              data-test-subj="esql-help-popover-button"
              size="xs"
              iconType="question"
              aria-label={helpLabel}
            />
          </EuiToolTip>
        }
        panelProps={{
          ['data-test-subj']: 'esql-menu-popover',
        }}
        isOpen={isESQLMenuPopoverOpen}
        closePopover={() => setIsESQLMenuPopoverOpen(false)}
        panelPaddingSize="none"
        display="block"
      >
        <div css={esqlMenuPopoverStyles}>
          <EuiContextMenu initialPanelId={0} panels={esqlContextMenuPanels} />
        </div>
      </EuiPopover>
      {!actions?.editorIsInline && (
        <LanguageDocumentationFlyout
          searchInDescription
          linkToDocumentation={docLinks?.links?.query?.queryESQL ?? ''}
          isHelpMenuOpen={isLanguageComponentOpen}
          onHelpMenuVisibilityChange={onHelpMenuVisibilityChange}
          size={docsFlyoutSize}
        />
      )}
    </>
  );
};
