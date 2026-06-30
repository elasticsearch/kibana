/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';

import { isEqual } from 'lodash';
import { i18n } from '@kbn/i18n';
import { useI18n } from '@kbn/i18n-react';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import useObservable from 'react-use/lib/useObservable';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { TopNavMenuData, TopNavMenuProps } from '@kbn/navigation-plugin/public';
import { getEsQueryConfig } from '@kbn/data-plugin/public';
import type { DataView, DataViewSpec } from '@kbn/data-views-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { DataViewPickerProps } from '@kbn/unified-search-plugin/public';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderBadge } from '@kbn/app-header';
import { getManagedContentBadge } from '@kbn/managed-content-badge';
import type { ChromeBreadcrumbsBadge } from '@kbn/core-chrome-browser';
import type {
  AppMenuConfig,
  AppMenuItemType,
  AppMenuPrimaryActionItem,
  AppMenuRunActionParams,
} from '@kbn/core-chrome-app-menu-components';
import { APP_MENU_SHARE_ID } from '@kbn/core-chrome-app-menu-components';
import type { ShareActionIntents } from '@kbn/share-plugin/public/types';
import moment from 'moment';
import { LENS_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { LensAppState, LensAppServices } from '@kbn/lens-common';
import { LENS_APP_NAME } from '../../common/constants';
import type { LensTopNavActions, LensTopNavMenuProps } from './types';
import {
  setState,
  useLensSelector,
  useLensDispatch,
  switchAndCleanDatasource,
  selectIsManaged,
  selectAutoApplyEnabled,
  enableAutoApply,
  disableAutoApply,
} from '../state_management';
import { writeToStorage } from '../settings_storage';
import { AUTO_APPLY_DISABLED_STORAGE_KEY } from '../editor_frame_service/editor_frame/workspace_panel/workspace_panel_wrapper';
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

const wrapTopNavRun = (run: TopNavMenuData['run']) => (params?: AppMenuRunActionParams) => {
  if (params?.triggerElement) {
    run(params.triggerElement);
  }
};

// Static metadata (label, icon, order) for each registered Lens export integration,
// keyed by integration id. The actual export handler is resolved lazily at click time.
const getLensExportItemMeta = (integrationId: string) => {
  switch (integrationId) {
    case 'csvDownloadLens':
      return {
        label: i18n.translate('xpack.lens.app.export.csvLabel', { defaultMessage: 'CSV' }),
        iconType: 'table',
        testId: 'exportMenuItem-CSV',
        order: 0,
      };
    case 'pdfReports':
      return {
        label: i18n.translate('xpack.lens.app.export.pdfLabel', { defaultMessage: 'PDF' }),
        iconType: 'document',
        testId: 'exportMenuItem-PDF',
        order: 1,
      };
    case 'imageReports':
      return {
        label: i18n.translate('xpack.lens.app.export.pngLabel', { defaultMessage: 'PNG' }),
        iconType: 'image',
        testId: 'exportMenuItem-PNG',
        order: 2,
      };
    case 'scheduledReports':
      return {
        label: i18n.translate('xpack.lens.app.export.scheduleExportLabel', {
          defaultMessage: 'Schedule export',
        }),
        iconType: 'calendar',
        testId: 'scheduleExport',
        order: 3,
        separator: 'above' as const,
      };
    default:
      return {
        label: integrationId,
        iconType: 'empty',
        testId: `exportMenuItem-${integrationId}`,
        order: 100,
      };
  }
};

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
  exportItems?: NonNullable<AppMenuItemType['items']>;
}): AppMenuConfig {
  const {
    actions,
    savingToLibraryPermitted,
    savingToDashboardPermitted,
    contextOriginatingApp,
    showReplaceInDashboard,
    showReplaceInCanvas,
    contextFromEmbeddable,
    isByValueMode,
    exportItems,
  } = options;

  const items: AppMenuItemType[] = [];

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
    items.push({
      id: 'lnsApp_goBackToAppButton',
      label: i18n.translate('xpack.lens.app.goBackLabel', {
        defaultMessage: `Go back to {contextOriginatingApp}`,
        values: { contextOriginatingApp },
      }),
      iconType: 'arrowLeft',
      testId: 'lnsApp_goBackToAppButton',
      disableButton: !actions.goBack.enabled,
      order: 0,
      run: wrapTopNavRun(actions.goBack.execute),
    });
  }

  if (actions.getUnderlyingDataUrl.visible) {
    items.push({
      id: 'lnsApp_openInDiscover',
      label: i18n.translate('xpack.lens.app.exploreDataInDiscover', {
        defaultMessage: 'Open in Discover',
      }),
      iconType: 'discoverApp',
      testId: 'lnsApp_openInDiscover',
      disableButton: !actions.getUnderlyingDataUrl.enabled,
      tooltipContent: actions.getUnderlyingDataUrl.tooltip,
      target: '_blank',
      href: actions.getUnderlyingDataUrl.getLink?.(),
      order: 2,
      run: wrapTopNavRun(actions.getUnderlyingDataUrl.execute),
    });
  }

  items.push({
    id: 'lnsApp_inspectButton',
    label: i18n.translate('xpack.lens.app.inspect', {
      defaultMessage: 'Inspect',
    }),
    iconType: 'inspect',
    testId: 'lnsApp_inspectButton',
    disableButton: false,
    order: 3,
    run: wrapTopNavRun(actions.inspect.execute),
  });

  if (actions.export.visible) {
    const exportButtonBase = {
      id: 'lnsApp_exportButton',
      label: i18n.translate('xpack.lens.app.shareTitle', {
        defaultMessage: 'Export',
      }),
      iconType: 'download',
      testId: 'lnsApp_exportButton',
      disableButton: !actions.export.enabled,
      tooltipContent: actions.export.tooltip,
      order: 4,
    };

    if (exportItems && exportItems.length > 1) {
      // Multiple export integrations are available: render them as nested popover items.
      items.push({
        ...exportButtonBase,
        items: exportItems,
        popoverTestId: 'exportPopoverPanel',
      });
    } else if (exportItems && exportItems.length === 1) {
      // A single export integration is available: trigger it directly.
      items.push({
        ...exportButtonBase,
        run: (params) => exportItems[0].run?.(params),
      });
    } else {
      items.push({
        ...exportButtonBase,
        run: wrapTopNavRun(actions.export.execute),
      });
    }
  }

  if (actions.share.visible) {
    items.push({
      id: APP_MENU_SHARE_ID,
      label: i18n.translate('xpack.lens.app.shareTitle', {
        defaultMessage: 'Share',
      }),
      iconType: 'share',
      testId: 'lnsApp_shareButton',
      disableButton: !actions.share.enabled,
      tooltipContent: actions.share.tooltip,
      order: 6,
      run: wrapTopNavRun(actions.share.execute),
    });
  }

  if (actions.cancel.visible) {
    items.push({
      id: 'lnsApp_cancelButton',
      label: i18n.translate('xpack.lens.app.cancel', {
        defaultMessage: 'Cancel',
      }),
      iconType: 'cross',
      testId: 'lnsApp_cancelButton',
      order: 0,
      run: wrapTopNavRun(actions.cancel.execute),
    });
  }

  const isSaveEmphasized =
    showReplaceInDashboard || showReplaceInCanvas ? false : !showSaveAndReturn;

  let primaryActionItem: AppMenuPrimaryActionItem | undefined;

  const saveButtonItem = {
    id: 'lnsApp_saveButton',
    label: saveButtonLabel,
    iconType: 'save',
    testId: 'lnsApp_saveButton',
    disableButton: !enableSaveButton,
    run: wrapTopNavRun(actions.showSaveModal.execute),
  };

  if (isSaveEmphasized) {
    primaryActionItem = saveButtonItem;
  } else {
    items.push({ ...saveButtonItem, order: 1 });
  }

  const saveButtonMeta = getSaveButtonMeta({
    showSaveAndReturn,
    showReplaceInDashboard,
    showReplaceInCanvas,
    contextFromEmbeddable,
  });

  if (saveButtonMeta) {
    primaryActionItem = {
      id: saveButtonMeta.testId,
      label: saveButtonMeta.label,
      iconType: saveButtonMeta.iconType,
      testId: saveButtonMeta.testId,
      disableButton: !actions.saveAndReturn.enabled,
      run: wrapTopNavRun(actions.saveAndReturn.execute),
    };
  }

  return { items, primaryActionItem };
}

export const LensTopNavMenu = ({
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
}: LensTopNavMenuProps) => {
  const {
    data,
    unifiedSearch,
    uiSettings,
    application,
    share,
    chrome,
    dataViewFieldEditor,
    dataViewEditor,
    dataViews: dataViewsService,
  } = useKibana<LensAppServices>().services;

  const isClassicChrome =
    useObservable(chrome.getChromeStyle$(), chrome.getChromeStyle()) === 'classic';

  const intl = useI18n();

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
  const autoApplyEnabled = useLensSelector(selectAutoApplyEnabled);
  const toggleAutoApply = useCallback(() => {
    writeToStorage(
      new Storage(localStorage),
      AUTO_APPLY_DISABLED_STORAGE_KEY,
      String(autoApplyEnabled)
    );
    dispatch(autoApplyEnabled ? disableAutoApply() : enableAutoApply());
  }, [dispatch, autoApplyEnabled]);
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

  const { AggregateQuerySearchBar } = unifiedSearch.ui;
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

  const adHocDataViews = indexPatterns.filter((pattern) => !pattern.isPersisted());

  const appMenuConfig = useMemo<AppMenuConfig>(() => {
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

    // Builds the shared share-menu options reused by both the Share flyout and the
    // per-integration export handlers. Returns `undefined` when sharing is not possible.
    const buildShareContextMenuOptions = () => {
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

      return {
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
      };
    };

    const shareExecutor = async (anchorElement: HTMLElement, asExport?: boolean) => {
      const shareOptions = buildShareContextMenuOptions();
      if (!share || !shareOptions) {
        return;
      }

      share.toggleShareContextMenu({
        ...shareOptions,
        asExport,
        anchorElement,
        onClose: () => {
          anchorElement?.focus();
        },
      });
    };

    // Build the export sub-items from the registered share integrations, so the Export
    // button can render them as nested popover items instead of opening the share flyout.
    const exportMenuItems: NonNullable<AppMenuItemType['items']> = [];
    if (share) {
      const exportIntegrations: ShareActionIntents[] = share.availableIntegrations(
        'lens',
        'export'
      );
      const exportDerivatives: ShareActionIntents[] = share.availableIntegrations(
        'lens',
        'exportDerivatives'
      );

      exportIntegrations
        .filter(
          (
            integration
          ): integration is typeof integration & { shareType: 'integration'; id: string } =>
            integration.shareType === 'integration'
        )
        .forEach((integration) => {
          exportMenuItems.push({
            ...getLensExportItemMeta(integration.id),
            id: integration.id,
            run: async () => {
              const shareOptions = buildShareContextMenuOptions();
              if (!shareOptions) {
                return;
              }
              const handler = await share.getExportHandler(shareOptions, integration.id, intl);
              await handler?.();
            },
          });
        });

      exportDerivatives
        .filter(
          (
            integration
          ): integration is typeof integration & { shareType: 'integration'; id: string } =>
            integration.shareType === 'integration' && integration.groupId === 'exportDerivatives'
        )
        .forEach((integration) => {
          exportMenuItems.push({
            ...getLensExportItemMeta(integration.id),
            id: integration.id,
            run: async () => {
              const shareOptions = buildShareContextMenuOptions();
              if (!shareOptions) {
                return;
              }
              const handler = await share.getExportDerivativeHandler(shareOptions, integration.id);
              await handler?.();
            },
          });
        });
    }

    const baseMenuEntries = getLensTopNavConfig({
      isByValueMode: getIsByValueMode(),
      savingToLibraryPermitted,
      savingToDashboardPermitted,
      isSaveable,
      contextOriginatingApp,
      showReplaceInDashboard,
      showReplaceInCanvas,
      contextFromEmbeddable,
      exportItems: exportMenuItems,
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
      },
    });

    const extraItems: AppMenuItemType[] = (additionalMenuEntries ?? []).map((entry, index) => ({
      id: entry.id ?? entry.testId ?? `lnsTopNavEntry_${index}`,
      label: entry.label,
      iconType: entry.iconType ?? 'empty',
      testId: entry.testId,
      disableButton: entry.disableButton,
      tooltipContent: entry.tooltip,
      // Render external entries before the built-in actions
      order: index - (additionalMenuEntries?.length ?? 0),
      run: wrapTopNavRun(entry.run),
    }));

    return {
      ...baseMenuEntries,
      items: [...extraItems, ...(baseMenuEntries.items ?? [])],
      switch: {
        id: 'lnsToggleAutoApply',
        label: i18n.translate('xpack.lens.settings.autoApply', {
          defaultMessage: 'Auto-apply visualization changes',
        }),
        labelProps: {},
        checked: autoApplyEnabled,
        onChange: toggleAutoApply,
        'data-test-subj': 'lnsToggleAutoApply',
      },
    };
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
    intl,
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
    autoApplyEnabled,
    toggleAutoApply,
  ]);

  const onQuerySubmitWrapped = useCallback<
    Required<TopNavMenuProps<AggregateQuery>>['onQuerySubmit']
  >(
    (payload) => {
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
    (newSavedQuery) => {
      dispatchSetState({ savedQuery: newSavedQuery });
    },
    [dispatchSetState]
  );

  const onSavedQueryUpdatedWrapped = useCallback<
    Required<TopNavMenuProps<AggregateQuery>>['onSavedQueryUpdated']
  >(
    (newSavedQuery) => {
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

  const managedBadgeTooltip = i18n.translate('xpack.lens.managedBadgeTooltip', {
    defaultMessage:
      'This visualization is managed by Elastic. Changes made here must be saved in a new visualization.',
  });

  const badges: AppHeaderBadge[] | undefined = managed
    ? [
        {
          label: i18n.translate('xpack.lens.managedBadgeLabel', {
            defaultMessage: 'Managed',
          }),
          color: 'primary',
          tooltip: managedBadgeTooltip,
          'data-test-subj': 'managedContentBadge',
        },
      ]
    : undefined;

  const breadcrumbsBadges = useMemo<ChromeBreadcrumbsBadge[]>(
    () => (managed ? [getManagedContentBadge(managedBadgeTooltip)] : []),
    [managed, managedBadgeTooltip]
  );

  useEffect(() => {
    if (!isClassicChrome) {
      return;
    }
    chrome.setAppMenu(appMenuConfig);
    chrome.setBreadcrumbsBadges(breadcrumbsBadges);
    return () => {
      chrome.setAppMenu();
      chrome.setBreadcrumbsBadges([]);
    };
  }, [isClassicChrome, chrome, appMenuConfig, breadcrumbsBadges]);

  return (
    <>
      {!isClassicChrome && (
        <AppHeader
          title={
            title ||
            i18n.translate('xpack.lens.app.headerTitle', {
              defaultMessage: 'New visualization',
            })
          }
          menu={appMenuConfig}
          badges={badges}
        />
      )}
      <AggregateQuerySearchBar
        allowSavingQueries
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
        dataTestSubj="lnsApp_topNav"
        screenTitle="lens"
        appName={LENS_APP_NAME}
        displayStyle="detached"
      />
    </>
  );
};
