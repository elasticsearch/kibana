/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';

import { isEqual } from 'lodash';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { AggregateQuery, Query, TimeRange } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { useStore } from 'react-redux';
import type { TopNavMenuData, TopNavMenuProps } from '@kbn/navigation-plugin/public';
import { getEsQueryConfig } from '@kbn/data-plugin/public';
import type { SavedQuery } from '@kbn/data-plugin/public';
import type { DataView, DataViewSpec } from '@kbn/data-views-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { DataViewPickerProps } from '@kbn/unified-search-plugin/public';
import { getManagedContentBadge } from '@kbn/managed-content-badge';
import moment from 'moment';
import type { UseEuiTheme } from '@elastic/eui';
import { euiBreakpoint } from '@elastic/eui';
import type { SerializedStyles } from '@emotion/react';
import { css } from '@emotion/react';
import { LENS_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { LensAppState, LensAppServices } from '@kbn/lens-common';
import { LENS_APP_NAME } from '../../common/constants';
import type { LensTopNavActions, LensTopNavMenuProps } from './types';
import { toggleSettingsMenuOpen } from './settings_menu';
import {
  setState,
  useLensSelector,
  useLensDispatch,
  switchAndCleanDatasource,
  selectIsManaged,
} from '../state_management';
import {
  getIndexPatternsObjects,
  getIndexPatternsIds,
  getResolvedDateRange,
  refreshIndexPatternsList,
} from '../utils';
import { combineQueryAndFilters, getLayerMetaInfo } from './show_underlying_data';
import { changeIndexPattern } from '../state_management/lens_slice';
import type { ShareableConfiguration } from './share_action';
import { DEFAULT_LENS_LAYOUT_DIMENSIONS, getLocatorParams, getShareURL } from './share_action';
import { getDatasourceLayers } from '../state_management/utils';
import { useEditorFrameService } from '../editor_frame_service/editor_frame_service_context';

function getSaveButtonMeta({
  contextFromEmbeddable,
  showSaveAndReturn,
  showReplaceInDashboard,
  showReplaceInCanvas,
}: {
  contextFromEmbeddable: boolean | undefined;
  showSaveAndReturn: boolean;
  showReplaceInDashboard: boolean;
  showReplaceInCanvas: boolean;
}) {
  if (showSaveAndReturn) {
    return {
      label: contextFromEmbeddable
        ? i18n.translate('xpack.lens.app.saveAndReplace', {
            defaultMessage: 'Save and replace',
          })
        : i18n.translate('xpack.lens.app.saveAndReturn', {
            defaultMessage: 'Save and return',
          }),
      emphasize: true,
      iconType: contextFromEmbeddable ? 'save' : 'checkCircleFill',
      testId: 'lnsApp_saveAndReturnButton',
      description: i18n.translate('xpack.lens.app.saveAndReturnButtonAriaLabel', {
        defaultMessage: 'Save the current lens visualization and return to the last app',
      }),
    };
  }

  if (showReplaceInDashboard) {
    return {
      label: i18n.translate('xpack.lens.app.replaceInDashboard', {
        defaultMessage: 'Replace in dashboard',
      }),
      emphasize: true,
      iconType: 'merge',
      testId: 'lnsApp_replaceInDashboardButton',
      description: i18n.translate('xpack.lens.app.replaceInDashboardButtonAriaLabel', {
        defaultMessage:
          'Replace legacy visualization with lens visualization and return to the dashboard',
      }),
    };
  }

  if (showReplaceInCanvas) {
    return {
      label: i18n.translate('xpack.lens.app.replaceInCanvas', {
        defaultMessage: 'Replace in canvas',
      }),
      emphasize: true,
      iconType: 'merge',
      testId: 'lnsApp_replaceInCanvasButton',
      description: i18n.translate('xpack.lens.app.replaceInCanvasButtonAriaLabel', {
        defaultMessage:
          'Replace legacy visualization with lens visualization and return to the canvas',
      }),
    };
  }
}

const navItemWithDividerStyles = (euiThemeContext: UseEuiTheme) => css`
  ${euiBreakpoint(euiThemeContext, ['m', 'l', 'xl'])} {
    margin-right: ${euiThemeContext.euiTheme.size.m};
    position: relative;
    &:after {
      border-right: ${euiThemeContext.euiTheme.border.thin};
      bottom: 0;
      content: '';
      display: block;
      pointer-events: none;
      position: absolute;
      right: -${euiThemeContext.euiTheme.size.s};
      top: 0;
    }
  }
`;

function getLensTopNavConfig(options: {
  isByValueMode: boolean;
  actions: LensTopNavActions;
  savingToLibraryPermitted: boolean;
  savingToDashboardPermitted: boolean;
  contextOriginatingApp?: string;
  isSaveable: boolean;
  showReplaceInDashboard: boolean;
  showReplaceInCanvas: boolean;
  contextFromEmbeddable?: boolean;
}): TopNavMenuData[] {
  const {
    actions,
    savingToLibraryPermitted,
    savingToDashboardPermitted,
    contextOriginatingApp,
    showReplaceInDashboard,
    showReplaceInCanvas,
    contextFromEmbeddable,
    isByValueMode,
  } = options;

  const topNavMenu: Array<
    TopNavMenuData | ({ css: ({ euiTheme }: UseEuiTheme) => SerializedStyles } & TopNavMenuData)
  > = [];

  const showSaveAndReturn = actions.saveAndReturn.visible;

  const enableSaveButton =
    savingToLibraryPermitted ||
    (savingToDashboardPermitted && !isByValueMode && !showSaveAndReturn);

  const saveButtonLabel = isByValueMode
    ? i18n.translate('xpack.lens.app.addToLibrary', {
        defaultMessage: 'Save to library',
      })
    : actions.saveAndReturn.visible
    ? i18n.translate('xpack.lens.app.saveAs', {
        defaultMessage: 'Save as',
      })
    : i18n.translate('xpack.lens.app.save', {
        defaultMessage: 'Save',
      });

  if (contextOriginatingApp && !actions.cancel.visible) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.goBackLabel', {
        defaultMessage: `Go back to {contextOriginatingApp}`,
        values: { contextOriginatingApp },
      }),
      run: actions.goBack.execute,
      testId: 'lnsApp_goBackToAppButton',
      description: i18n.translate('xpack.lens.app.goBackLabel', {
        defaultMessage: `Go back to {contextOriginatingApp}`,
        values: { contextOriginatingApp },
      }),
      disableButton: !actions.goBack.enabled,
      css: navItemWithDividerStyles,
    });
  }

  if (actions.getUnderlyingDataUrl.visible) {
    const exploreDataInDiscoverLabel = i18n.translate('xpack.lens.app.exploreDataInDiscover', {
      defaultMessage: 'Explore in Discover',
    });

    topNavMenu.push({
      label: exploreDataInDiscoverLabel,
      run: actions.getUnderlyingDataUrl.execute,
      testId: 'lnsApp_openInDiscover',
      description: exploreDataInDiscoverLabel,
      disableButton: !actions.getUnderlyingDataUrl.enabled,
      tooltip: actions.getUnderlyingDataUrl.tooltip,
      target: '_blank',
      href: actions.getUnderlyingDataUrl.getLink?.(),
      css: navItemWithDividerStyles,
    });
  }

  topNavMenu.push({
    label: i18n.translate('xpack.lens.app.inspect', {
      defaultMessage: 'Inspect',
    }),
    run: actions.inspect.execute,
    testId: 'lnsApp_inspectButton',
    description: i18n.translate('xpack.lens.app.inspectAriaLabel', {
      defaultMessage: 'inspect',
    }),
    disableButton: false,
  });

  if (actions.export.visible) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.shareTitle', {
        defaultMessage: 'Export',
      }),
      iconType: 'download',
      iconOnly: true,
      run: actions.export.execute,
      testId: 'lnsApp_exportButton',
      description: i18n.translate('xpack.lens.app.shareTitleAria', {
        defaultMessage: 'Export visualization',
      }),
      disableButton: !actions.export.enabled,
      tooltip: actions.export.tooltip,
    });
  }

  if (actions.share.visible) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.shareTitle', {
        defaultMessage: 'Share',
      }),
      iconType: 'share',
      iconOnly: true,
      run: actions.share.execute,
      testId: 'lnsApp_shareButton',
      description: i18n.translate('xpack.lens.app.shareTitleAria', {
        defaultMessage: 'Share visualization',
      }),
      disableButton: !actions.share.enabled,
      tooltip: actions.share.tooltip,
    });
  }

  topNavMenu.push({
    label: i18n.translate('xpack.lens.app.settings', {
      defaultMessage: 'Settings',
    }),
    run: actions.openSettings.execute,
    testId: 'lnsApp_settingsButton',
    description: i18n.translate('xpack.lens.app.settingsAriaLabel', {
      defaultMessage: 'Open the Lens settings menu',
    }),
    css: navItemWithDividerStyles,
  });

  if (actions.cancel.visible) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.cancel', {
        defaultMessage: 'Cancel',
      }),
      run: actions.cancel.execute,
      testId: 'lnsApp_cancelButton',
      description: i18n.translate('xpack.lens.app.cancelButtonAriaLabel', {
        defaultMessage: 'Return to the last app without saving changes',
      }),
    });
  }

  topNavMenu.push({
    label: saveButtonLabel,
    iconType: (showReplaceInDashboard || showReplaceInCanvas ? false : !showSaveAndReturn)
      ? 'save'
      : undefined,
    emphasize: showReplaceInDashboard || showReplaceInCanvas ? false : !showSaveAndReturn,
    run: actions.showSaveModal.execute,
    testId: 'lnsApp_saveButton',
    description: i18n.translate('xpack.lens.app.saveButtonAriaLabel', {
      defaultMessage: 'Save the current lens visualization',
    }),
    disableButton: !enableSaveButton,
  });

  const saveButtonMeta = getSaveButtonMeta({
    showSaveAndReturn,
    showReplaceInDashboard,
    showReplaceInCanvas,
    contextFromEmbeddable,
  });

  if (saveButtonMeta) {
    topNavMenu.push({
      ...saveButtonMeta,
      run: actions.saveAndReturn.execute,
      disableButton: !actions.saveAndReturn.enabled,
    });
  }

  return topNavMenu;
}

export const LensTopNavMenu = ({
  setHeaderActionMenu,
  initialInput,
  incomingState,
  indicateNoData,
  lensInspector,
  setIsSaveModalVisible,
  getIsByValueMode,
  runSave,
  onAppLeave,
  redirectToOrigin,
  title,
  goBackToOriginatingApp,
  contextOriginatingApp,
  topNavMenuEntryGenerators,
  initialContext,
  indexPatternService,
  currentDoc,
  getUserMessages,
  shortUrlService,
  isCurrentStateDirty,
  startServices,
}: LensTopNavMenuProps) => {
  const {
    data,
    navigation,
    uiSettings,
    application,
    share,
    dataViewFieldEditor,
    dataViewEditor,
    dataViews: dataViewsService,
  } = useKibana<LensAppServices>().services;

  const { datasourceMap, visualizationMap } = useEditorFrameService();

  const {
    isSaveable,
    query,
    activeData,
    savedQuery,
    activeDatasourceId,
    datasourceStates,
    visualization,
    filters,
    dataViews,
  } = useLensSelector((state) => state.lens);

  const dispatch = useLensDispatch();
  const dispatchSetState = React.useCallback(
    (state: Partial<LensAppState>) => dispatch(setState(state)),
    [dispatch]
  );
  const [indexPatterns, setIndexPatterns] = useState<DataView[]>([]);
  const [currentIndexPattern, setCurrentIndexPattern] = useState<DataView>();
  const isOnTextBasedMode =
    query != null && typeof query === 'object' && isOfAggregateQueryType(query);
  const [rejectedIndexPatterns, setRejectedIndexPatterns] = useState<string[]>([]);

  const dispatchChangeIndexPattern = React.useCallback(
    async (dataViewOrId: DataView | string) => {
      const indexPatternId = typeof dataViewOrId === 'string' ? dataViewOrId : dataViewOrId.id!;
      const newIndexPatterns = await indexPatternService.ensureIndexPattern({
        id: indexPatternId,
        cache: dataViews.indexPatterns,
      });
      dispatch(
        changeIndexPattern({
          dataViews: { indexPatterns: newIndexPatterns },
          datasourceIds: Object.keys(datasourceStates),
          visualizationIds: visualization.activeId ? [visualization.activeId] : [],
          indexPatternId,
        })
      );
    },
    [
      dataViews.indexPatterns,
      datasourceStates,
      dispatch,
      indexPatternService,
      visualization.activeId,
    ]
  );

  const canEditDataView =
    Boolean(dataViewEditor?.userPermissions.editDataView()) || !currentIndexPattern?.isPersisted();
  const closeFieldEditor = useRef<() => void | undefined>();

  const allLoaded = Object.values(datasourceStates).every(({ isLoading }) => isLoading === false);

  useEffect(() => {
    const activeDatasource =
      datasourceMap && activeDatasourceId && !datasourceStates[activeDatasourceId].isLoading
        ? datasourceMap[activeDatasourceId]
        : undefined;
    if (!activeDatasource) {
      return;
    }
    const indexPatternIds = new Set(
      getIndexPatternsIds({
        activeDatasourceId,
        activeDatasources: Object.keys(datasourceStates).reduce(
          (acc, datasourceId) => ({
            ...acc,
            [datasourceId]: datasourceMap[datasourceId],
          }),
          {}
        ),
        datasourceStates,
        visualizationState: visualization.state,
        activeVisualization: visualization.activeId
          ? visualizationMap[visualization.activeId]
          : undefined,
      })
    );
    // Add ad-hoc data views from the Lens state even if they are not used
    Object.values(dataViews.indexPatterns)
      .filter((indexPattern) => !indexPattern.isPersisted)
      .forEach((indexPattern) => {
        indexPatternIds.add(indexPattern.id);
      });

    const hasIndexPatternsChanged =
      indexPatterns.length + rejectedIndexPatterns.length !== indexPatternIds.size ||
      [...indexPatternIds].some(
        (id) =>
          !indexPatterns
            .map((ip) => ip.id)
            .concat(rejectedIndexPatterns)
            .some((loadedId) => loadedId === id)
      );

    // Update the cached index patterns if the user made a change to any of them
    if (hasIndexPatternsChanged) {
      getIndexPatternsObjects([...indexPatternIds], dataViewsService).then(
        ({ indexPatterns: indexPatternObjects, rejectedIds }) => {
          setIndexPatterns(indexPatternObjects);
          setRejectedIndexPatterns(rejectedIds);
        }
      );
    }
  }, [
    datasourceStates,
    activeDatasourceId,
    rejectedIndexPatterns,
    datasourceMap,
    visualizationMap,
    visualization,
    indexPatterns,
    dataViewsService,
    dataViews,
  ]);

  useEffect(() => {
    const setCurrentPattern = async () => {
      if (activeDatasourceId && datasourceStates[activeDatasourceId].state) {
        const dataViewId = datasourceMap[activeDatasourceId].getUsedDataView(
          datasourceStates[activeDatasourceId].state
        );
        const dataView = dataViewId ? await data.dataViews.get(dataViewId) : undefined;
        setCurrentIndexPattern(dataView ?? indexPatterns[0]);
      }
    };

    setCurrentPattern();
  }, [
    activeDatasourceId,
    datasourceMap,
    datasourceStates,
    indexPatterns,
    data.dataViews,
    isOnTextBasedMode,
  ]);

  const hasShareIntegration = useMemo(() => {
    if (!share) return false;
    return share.availableIntegrations('lens', 'export').length > 0;
  }, [share]);

  useEffect(() => {
    return () => {
      // Make sure to close the editors when unmounting
      closeFieldEditor.current?.();
    };
  }, []);

  const { AggregateQueryTopNavMenu } = navigation.ui;
  const { from, to } = data.query.timefilter.timefilter.getTime();

  const savingToLibraryPermitted = Boolean(
    isSaveable && application.capabilities.visualize_v2.save
  );
  const savingToDashboardPermitted = Boolean(
    isSaveable && application.capabilities.dashboard_v2?.showWriteControls
  );

  const defaultLensTitle = i18n.translate('xpack.lens.app.share.defaultDashboardTitle', {
    defaultMessage: 'Lens Visualization [{date}]',
    values: { date: moment().toISOString(true) },
  });
  const additionalMenuEntries = useMemo(() => {
    if (!visualization.activeId) return undefined;
    const visualizationId = visualization.activeId;
    const entries = topNavMenuEntryGenerators.flatMap((menuEntryGenerator) => {
      const menuEntry = menuEntryGenerator({
        datasourceStates,
        visualizationId,
        visualizationState: visualization.state,
        query,
        filters,
        initialContext,
        currentDoc,
      });
      return menuEntry ? [menuEntry] : [];
    });
    if (entries.length > 0) {
      return entries;
    }
  }, [
    datasourceStates,
    topNavMenuEntryGenerators,
    visualization.activeId,
    visualization.state,
    query,
    filters,
    initialContext,
    currentDoc,
  ]);

  const discoverLocator = share?.url.locators.get('DISCOVER_APP_LOCATOR');

  const layerMetaInfo = useMemo(() => {
    if (!activeDatasourceId || !discoverLocator) {
      return;
    }
    if (visualization.activeId == null) {
      return;
    }
    return getLayerMetaInfo(
      datasourceMap[activeDatasourceId],
      datasourceStates[activeDatasourceId].state,
      visualizationMap[visualization.activeId],
      visualization.state,
      activeData,
      dataViews.indexPatterns,
      data.query.timefilter.timefilter.getTime(),
      application.capabilities
    );
  }, [
    activeDatasourceId,
    discoverLocator,
    visualization,
    datasourceMap,
    datasourceStates,
    visualizationMap,
    activeData,
    dataViews.indexPatterns,
    data.query.timefilter.timefilter,
    application.capabilities,
  ]);

  const lensStore = useStore();

  const adHocDataViews = indexPatterns.filter((pattern) => !pattern.isPersisted());

  const topNavConfig = useMemo(() => {
    const contextFromEmbeddable =
      initialContext && 'isEmbeddable' in initialContext && initialContext.isEmbeddable;
    const showReplaceInDashboard = Boolean(
      !initialInput?.ref_id && contextFromEmbeddable && initialContext?.embeddableId
    );
    const showReplaceInCanvas =
      initialContext?.originatingApp === 'canvas' && !initialInput?.ref_id;

    const isComingFromDashboardView =
      incomingState?.originatingApp &&
      incomingState.originatingApp !== 'visualize' &&
      incomingState?.originatingPath &&
      !incomingState.originatingPath.includes('/list/');

    const showSaveAndReturn =
      !(showReplaceInDashboard || showReplaceInCanvas) && Boolean(isComingFromDashboardView);

    const hasData = Boolean(activeData && Object.keys(activeData).length);
    const csvEnabled = Boolean(isSaveable && hasData);
    const shareUrlEnabled = Boolean(
      application.capabilities.visualize_v2.createShortUrl && hasData
    );

    const showShareMenu = csvEnabled || shareUrlEnabled;

    const shareExecutor = async (anchorElement: HTMLElement, asExport?: boolean) => {
      if (!share) {
        return;
      }

      if (visualization.activeId == null || !visualizationMap[visualization.activeId]) {
        return;
      }

      const activeVisualization = visualizationMap[visualization.activeId];

      const configuration: ShareableConfiguration = {
        filters,
        query,
        activeDatasourceId,
        datasourceStates,
        datasourceMap,
        visualizationMap,
        visualization,
        currentDoc,
        adHocDataViews: adHocDataViews.map((dataView) => dataView.toSpec()),
      };

      const { shareURL: shareLocatorParams, reporting: reportingLocatorParams } = getLocatorParams(
        data,
        configuration,
        isCurrentStateDirty
      );

      const datasourceLayers = getDatasourceLayers(
        datasourceStates,
        datasourceMap,
        dataViews.indexPatterns
      );

      const exportDatatables =
        activeVisualization.getExportDatatables?.(
          visualization.state,
          datasourceLayers,
          activeData
        ) ?? [];
      const datatables =
        exportDatatables.length > 0 ? exportDatatables : Object.values(activeData ?? {});
      const sharingData = {
        datatables,
        csvEnabled,
        reportingDisabled: !csvEnabled,
        title: title || defaultLensTitle,
        locatorParams: {
          id: LENS_APP_LOCATOR,
          params: reportingLocatorParams,
        },
        layout: {
          dimensions:
            activeVisualization.getReportingLayout?.(visualization.state) ??
            DEFAULT_LENS_LAYOUT_DIMENSIONS,
        },
      };

      share.toggleShareContextMenu({
        asExport,
        anchorElement,
        allowShortUrl: false,
        objectId: currentDoc?.savedObjectId,
        objectType: 'lens',
        objectTypeMeta: {
          title: i18n.translate('xpack.lens.app.shareModal.title', {
            defaultMessage: 'Share this Lens visualization',
          }),
          config: {
            link: {
              draftModeCallOut: true,
              delegatedShareUrlHandler: async () => {
                const { shareableUrl, savedObjectURL } = getShareURL(
                  shortUrlService,
                  shareLocatorParams,
                  { application, data },
                  configuration,
                  shareUrlEnabled
                );

                return !currentDoc?.savedObjectId ? (await shareableUrl)! : savedObjectURL.href;
              },
              // disable the menu if both shortURL permission and the visualization has not been saved
              // TODO: improve here the disabling state with more specific checks
              disabled: Boolean(!shareUrlEnabled && !currentDoc?.savedObjectId),
            },
            embed: {
              disabled: true,
              showPublicUrlSwitch: () => false,
            },
            integration: {
              export: {
                csvDownloadLens: {
                  draftModeCallOut: true,
                },
                imageReports: {
                  draftModeCallOut: true,
                },
                pdfReports: {
                  draftModeCallOut: true,
                },
              },
            },
          },
        },
        sharingData,
        // only want to know about changes when savedObjectURL.href
        isDirty: isCurrentStateDirty || !currentDoc?.savedObjectId,
        onClose: () => {
          anchorElement?.focus();
        },
      });
    };

    const baseMenuEntries = getLensTopNavConfig({
      isByValueMode: getIsByValueMode(),
      savingToLibraryPermitted,
      savingToDashboardPermitted,
      isSaveable,
      contextOriginatingApp,
      showReplaceInDashboard,
      showReplaceInCanvas,
      contextFromEmbeddable,
      actions: {
        inspect: { visible: true, execute: () => lensInspector.inspect({ title }) },
        export: {
          // Only show the export button if the current user meets the requirements for at least one registered export integration
          visible: hasShareIntegration,
          enabled: showShareMenu,
          tooltip: () => {
            if (!showShareMenu) {
              return i18n.translate('xpack.lens.app.exportButtonDisabledWarning', {
                defaultMessage: 'The visualization has no data to export.',
              });
            }
          },
          execute: (anchorElement) => shareExecutor(anchorElement, true),
        },
        share: {
          visible: true,
          enabled: showShareMenu,
          tooltip: () => {
            if (!showShareMenu) {
              return i18n.translate('xpack.lens.app.shareButtonDisabledWarning', {
                defaultMessage: 'The visualization has no data to share.',
              });
            }
          },
          execute: shareExecutor,
        },
        saveAndReturn: {
          visible: showSaveAndReturn,
          enabled: isSaveable,
          execute: () => {
            if (isSaveable) {
              // disabling the validation on app leave because the document has been saved.
              onAppLeave((actions) => {
                return actions.default();
              });
              runSave(
                {
                  newTitle:
                    title ||
                    (contextFromEmbeddable
                      ? i18n.translate('xpack.lens.app.convertedLabel', {
                          defaultMessage: '{title} (converted)',
                          values: {
                            title:
                              initialContext.title ||
                              `${initialContext.visTypeTitle} visualization`,
                          },
                        })
                      : ''),
                  newCopyOnSave: false,
                  returnToOrigin: true,
                  ...(contextFromEmbeddable && { newDescription: initialContext.description }),
                  panelTimeRange: contextFromEmbeddable ? initialContext.panelTimeRange : undefined,
                },
                {
                  saveToLibrary: Boolean(initialInput?.ref_id),
                }
              );
            }
          },
        },
        showSaveModal: {
          visible: Boolean(savingToDashboardPermitted || savingToLibraryPermitted),
          execute: () => {
            if (savingToDashboardPermitted || savingToLibraryPermitted) {
              setIsSaveModalVisible(true);
            }
          },
        },
        goBack: {
          visible: Boolean(contextOriginatingApp),
          enabled: Boolean(contextOriginatingApp),
          execute: () => {
            if (contextOriginatingApp) {
              goBackToOriginatingApp?.();
            }
          },
        },
        cancel: {
          visible: Boolean(isComingFromDashboardView),
          execute: () => {
            if (redirectToOrigin) {
              redirectToOrigin();
            }
          },
        },
        getUnderlyingDataUrl: {
          visible: Boolean(layerMetaInfo?.isVisible),
          enabled: !layerMetaInfo?.error,
          tooltip: () => {
            return layerMetaInfo?.error;
          },
          execute: () => {},
          getLink: () => {
            if (!layerMetaInfo) {
              return;
            }
            const { error, meta } = layerMetaInfo;
            // If Discover is not available, return
            // If there's no data, return
            if (error || !discoverLocator || !meta) {
              return;
            }
            const { filters: newFilters, query: newQuery } = combineQueryAndFilters(
              query,
              filters,
              meta,
              indexPatterns,
              getEsQueryConfig(uiSettings)
            );

            return discoverLocator.getRedirectUrl({
              dataViewSpec: dataViews.indexPatterns[meta.id]?.spec,
              timeRange: data.query.timefilter.timefilter.getTime(),
              filters: newFilters,
              query: isOnTextBasedMode ? query : newQuery,
              columns: meta.columns,
            });
          },
        },
        openSettings: {
          visible: true,
          execute: (anchorElement) =>
            toggleSettingsMenuOpen({
              lensStore,
              anchorElement,
              startServices,
            }),
        },
      },
    });
    return (additionalMenuEntries || []).concat(baseMenuEntries);
  }, [
    initialContext,
    initialInput?.ref_id,
    incomingState,
    activeData,
    isSaveable,
    application,
    getIsByValueMode,
    savingToLibraryPermitted,
    savingToDashboardPermitted,
    contextOriginatingApp,
    hasShareIntegration,
    layerMetaInfo,
    additionalMenuEntries,
    share,
    visualization,
    visualizationMap,
    filters,
    query,
    activeDatasourceId,
    datasourceStates,
    datasourceMap,
    currentDoc,
    adHocDataViews,
    data,
    isCurrentStateDirty,
    dataViews.indexPatterns,
    title,
    defaultLensTitle,
    shortUrlService,
    lensInspector,
    onAppLeave,
    runSave,
    setIsSaveModalVisible,
    goBackToOriginatingApp,
    redirectToOrigin,
    discoverLocator,
    indexPatterns,
    uiSettings,
    isOnTextBasedMode,
    lensStore,
    startServices,
  ]);

  const onQuerySubmitWrapped = useCallback<
    Required<TopNavMenuProps<AggregateQuery>>['onQuerySubmit']
  >(
    (payload: { dateRange: TimeRange; query?: AggregateQuery | Query }) => {
      const { dateRange, query: newQuery } = payload;
      const currentRange = data.query.timefilter.timefilter.getTime();
      if (dateRange.from !== currentRange.from || dateRange.to !== currentRange.to) {
        data.query.timefilter.timefilter.setTime(dateRange);
      } else {
        // Query has changed, renew the session id.
        // recalculate resolvedDateRange (relevant for relative time range)
        dispatchSetState({
          searchSessionId: data.search.session.start(),
          resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
        });
      }
      if (newQuery) {
        if (!isEqual(newQuery, query)) {
          dispatchSetState({ query: newQuery as Query });
          // check if query is text-based (esql etc) and switchAndCleanDatasource
          if (isOfAggregateQueryType(newQuery) && !isOnTextBasedMode) {
            dispatch(
              switchAndCleanDatasource({
                newDatasourceId: LENS_DATASOURCE_ID.TEXT_BASED,
                visualizationId: visualization?.activeId,
                currentIndexPatternId: currentIndexPattern?.id,
              })
            );
          }
        }
      }
    },
    [
      currentIndexPattern?.id,
      data.query.timefilter.timefilter,
      data.search.session,
      dispatch,
      dispatchSetState,
      isOnTextBasedMode,
      query,
      visualization?.activeId,
    ]
  );

  const onSavedWrapped = useCallback<Required<TopNavMenuProps<AggregateQuery>>['onSaved']>(
    (newSavedQuery: SavedQuery) => {
      dispatchSetState({ savedQuery: newSavedQuery });
    },
    [dispatchSetState]
  );

  const onSavedQueryUpdatedWrapped = useCallback<
    Required<TopNavMenuProps<AggregateQuery>>['onSavedQueryUpdated']
  >(
    (newSavedQuery: SavedQuery) => {
      // If the user tries to load the same saved query that is already loaded,
      // we will receive the same object reference which was previously frozen
      // by Redux Toolkit. `filterManager.setFilters` will then try to modify
      // the query's filters, which will throw an error. To avoid this, we need
      // to clone the filters before passing them to `filterManager.setFilters`.
      const savedQueryFilters = structuredClone(newSavedQuery.attributes.filters || []);
      const globalFilters = data.query.filterManager.getGlobalFilters();
      data.query.filterManager.setFilters([...globalFilters, ...savedQueryFilters]);
      dispatchSetState({
        query: newSavedQuery.attributes.query,
        savedQuery: { ...newSavedQuery },
      }); // Shallow query for reference issues
    },
    [data.query.filterManager, dispatchSetState]
  );

  const onClearSavedQueryWrapped = useCallback(() => {
    data.query.filterManager.setFilters(data.query.filterManager.getGlobalFilters());
    dispatchSetState({
      filters: data.query.filterManager.getGlobalFilters(),
      query: data.query.queryString.getDefaultQuery(),
      savedQuery: undefined,
    });
  }, [data.query.filterManager, data.query.queryString, dispatchSetState]);

  const refreshFieldList = useCallback(async () => {
    if (currentIndexPattern?.id) {
      refreshIndexPatternsList({
        activeDatasources: Object.keys(datasourceStates).reduce(
          (acc, datasourceId) => ({
            ...acc,
            [datasourceId]: datasourceMap[datasourceId],
          }),
          {}
        ),
        indexPatternId: currentIndexPattern.id,
        indexPatternService,
        indexPatternsCache: dataViews.indexPatterns,
      });
    }
    // start a new session so all charts are refreshed
    data.search.session.start();
  }, [
    currentIndexPattern,
    data.search.session,
    datasourceMap,
    datasourceStates,
    indexPatternService,
    dataViews.indexPatterns,
  ]);

  const editField = useMemo(
    () =>
      canEditDataView
        ? async (fieldName?: string, _uiAction: 'edit' | 'add' = 'edit') => {
            if (currentIndexPattern?.id) {
              const indexPatternInstance = await data.dataViews.get(currentIndexPattern?.id);
              closeFieldEditor.current = await dataViewFieldEditor.openEditor({
                ctx: {
                  dataView: indexPatternInstance,
                },
                fieldName,
                onSave: () => {
                  if (indexPatternInstance.isPersisted()) {
                    refreshFieldList();
                  } else {
                    indexPatternService.replaceDataViewId(indexPatternInstance);
                  }
                },
              });
            }
          }
        : undefined,
    [
      canEditDataView,
      currentIndexPattern?.id,
      data.dataViews,
      dataViewFieldEditor,
      indexPatternService,
      refreshFieldList,
    ]
  );

  const addField = useMemo(
    () => (canEditDataView && editField ? () => editField(undefined, 'add') : undefined),
    [editField, canEditDataView]
  );

  const createNewDataView = useCallback(
    async (dataView: DataView) => {
      if (dataView.id) {
        if (isOnTextBasedMode) {
          dispatch(
            switchAndCleanDatasource({
              newDatasourceId: LENS_DATASOURCE_ID.FORM_BASED,
              visualizationId: visualization?.activeId,
              currentIndexPatternId: dataView?.id,
            })
          );
        }
        dispatchChangeIndexPattern(dataView);
        setCurrentIndexPattern(dataView);
      }
    },
    [dispatch, dispatchChangeIndexPattern, isOnTextBasedMode, visualization?.activeId]
  );

  const onCreateDefaultAdHocDataView = useCallback(
    async (dataViewSpec: DataViewSpec) => {
      const dataView = await dataViewsService.create(dataViewSpec);
      if (dataView.fields.getByName('@timestamp')?.type === 'date') {
        dataView.timeFieldName = '@timestamp';
      }
      if (isOnTextBasedMode) {
        dispatch(
          switchAndCleanDatasource({
            newDatasourceId: LENS_DATASOURCE_ID.FORM_BASED,
            visualizationId: visualization?.activeId,
            currentIndexPatternId: dataView?.id,
          })
        );
      }
      dispatchChangeIndexPattern(dataView);
      setCurrentIndexPattern(dataView);
    },
    [
      dataViewsService,
      dispatch,
      dispatchChangeIndexPattern,
      isOnTextBasedMode,
      visualization?.activeId,
    ]
  );

  const dataViewPickerProps: DataViewPickerProps = {
    trigger: {
      label: currentIndexPattern?.getName?.() || '',
      'data-test-subj': 'lns-dataView-switch-link',
      title: currentIndexPattern?.title || '',
    },
    currentDataViewId: currentIndexPattern?.id,
    onAddField: addField,
    onDataViewCreated: createNewDataView,
    onCreateDefaultAdHocDataView,
    adHocDataViews,
    onChangeDataView: async (newIndexPatternId: string) => {
      const currentDataView = await data.dataViews.get(newIndexPatternId);
      setCurrentIndexPattern(currentDataView);
      dispatchChangeIndexPattern(newIndexPatternId);
      if (isOnTextBasedMode) {
        dispatch(
          switchAndCleanDatasource({
            newDatasourceId: LENS_DATASOURCE_ID.FORM_BASED,
            visualizationId: visualization?.activeId,
            currentIndexPatternId: newIndexPatternId,
          })
        );
      }
    },
    onEditDataView: async (updatedDataViewStub) => {
      if (!currentIndexPattern) return;
      if (currentIndexPattern.isPersisted()) {
        // clear instance cache and fetch again to make sure fields are up to date (in case pattern changed)
        dataViewsService.clearInstanceCache(currentIndexPattern.id);
        const updatedCurrentIndexPattern = await dataViewsService.get(currentIndexPattern.id!);
        // if the data view was persisted, reload it from cache
        const updatedCache = {
          ...dataViews.indexPatterns,
        };
        delete updatedCache[currentIndexPattern.id!];
        const newIndexPatterns = await indexPatternService.ensureIndexPattern({
          id: updatedCurrentIndexPattern.id!,
          cache: updatedCache,
        });
        dispatch(
          changeIndexPattern({
            dataViews: { indexPatterns: newIndexPatterns },
            indexPatternId: updatedCurrentIndexPattern.id!,
          })
        );
        // Renew session id to make sure the request is done again
        dispatchSetState({
          searchSessionId: data.search.session.start(),
          resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
        });
        // update list of index patterns to pick up mutations in the changed data view
        setCurrentIndexPattern(updatedCurrentIndexPattern);
      } else {
        // if it was an ad-hoc data view, we need to switch to a new data view anyway
        indexPatternService.replaceDataViewId(updatedDataViewStub);
      }
    },
  };

  const textBasedLanguageModeErrors = getUserMessages('textBasedLanguagesQueryInput', {
    severity: 'error',
  }).map(({ shortMessage }) => new Error(shortMessage));

  const managed = useLensSelector(selectIsManaged);

  return (
    <AggregateQueryTopNavMenu
      setMenuMountPoint={setHeaderActionMenu}
      popoverBreakpoints={['xs', 's', 'm']}
      config={topNavConfig}
      allowSavingQueries
      badges={
        managed
          ? [
              getManagedContentBadge(
                i18n.translate('xpack.lens.managedBadgeTooltip', {
                  defaultMessage:
                    'This visualization is managed by Elastic. Changes made here must be saved in a new visualization.',
                })
              ),
            ]
          : undefined
      }
      savedQuery={savedQuery}
      onQuerySubmit={onQuerySubmitWrapped}
      onSaved={onSavedWrapped}
      onSavedQueryUpdated={onSavedQueryUpdatedWrapped}
      onClearSavedQuery={onClearSavedQueryWrapped}
      indexPatterns={indexPatterns}
      query={query}
      dateRangeFrom={from}
      dateRangeTo={to}
      indicateNoData={indicateNoData}
      showSearchBar={true}
      dataViewPickerComponentProps={dataViewPickerProps}
      showDatePicker={
        indexPatterns.some((ip) => ip.isTimeBased()) ||
        // always show the timepicker for text based languages
        isOnTextBasedMode ||
        Boolean(
          allLoaded &&
            activeDatasourceId &&
            datasourceMap[activeDatasourceId].isTimeBased(
              datasourceStates[activeDatasourceId].state,
              dataViews.indexPatterns
            )
        )
      }
      textBasedLanguageModeErrors={textBasedLanguageModeErrors}
      showFilterBar={true}
      data-test-subj="lnsApp_topNav"
      screenTitle={'lens'}
      appName={LENS_APP_NAME}
      displayStyle="detached"
      className="hide-for-sharing"
    />
  );
};
