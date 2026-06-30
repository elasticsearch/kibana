/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useCallback, useMemo, useRef } from 'react';
import { i18n } from '@kbn/i18n';
import type { HttpSetup } from '@kbn/core-http-browser';
import type { AppMenuPopoverItem } from '@kbn/core-chrome-app-menu-components';

import type { Index } from '../../../../../../common';
import {
  INDEX_OPEN,
  MAX_DOCUMENTS_FOR_CONVERT_TO_LOOKUP_INDEX,
  MAX_SHARDS_FOR_CONVERT_TO_LOOKUP_INDEX,
} from '../../../../../../common/constants';
import {
  clearCacheIndices as clearCacheIndicesRequest,
  closeIndices as closeIndicesRequest,
  deleteIndices as deleteIndicesRequest,
  flushIndices as flushIndicesRequest,
  forcemergeIndices as forcemergeIndicesRequest,
  openIndices as openIndicesRequest,
  refreshIndices as refreshIndicesRequest,
} from '../../../../services';
import { httpService } from '../../../../services/http';
import { useAppContext } from '../../../../app_context';
import type { ModalHostHandles } from '../index_actions_context_menu/modal_host/modal_host';
import { ModalHost } from '../index_actions_context_menu/modal_host/modal_host';

interface UseManageIndexMenuArgs {
  index: Index;
  reloadIndexDetails: () => Promise<void>;
  navigateToIndicesList: () => void;
  onIndexRefresh?: () => Promise<void> | void;
}

interface UseManageIndexMenuReturn {
  manageIndexItems: AppMenuPopoverItem[];
  modalHost: ReactNode;
}

export function useManageIndexMenu({
  index,
  reloadIndexDetails,
  navigateToIndicesList,
  onIndexRefresh,
}: UseManageIndexMenuArgs): UseManageIndexMenuReturn {
  const {
    services: { extensionsService, notificationService },
    plugins: { reindexService },
    core: { getUrlForApp },
    history,
    config: { enableIndexActions, isServerless },
  } = useAppContext();

  const modalRef = useRef<ModalHostHandles | null>(null);
  const indexNames = useMemo(() => [index.name], [index]);

  const reloadIndices = useCallback(async () => {
    await reloadIndexDetails();
  }, [reloadIndexDetails]);

  const closeIndices = useCallback(async () => {
    try {
      await closeIndicesRequest(indexNames);
      await reloadIndices();
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.closeIndicesAction.indexClosedMessage', {
          defaultMessage: 'The index {indexNames} was closed.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [reloadIndices, indexNames, notificationService]);

  const openIndices = useCallback(async () => {
    try {
      await openIndicesRequest(indexNames);
      await reloadIndices();
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.openIndicesAction.indexOpenedMessage', {
          defaultMessage: 'The index {indexNames} was opened.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [reloadIndices, indexNames, notificationService]);

  const flushIndices = useCallback(async () => {
    try {
      await flushIndicesRequest(indexNames);
      await reloadIndices();
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.flushIndicesAction.indexFlushedMessage', {
          defaultMessage: 'The index {indexNames} was flushed.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [reloadIndices, indexNames, notificationService]);

  const refreshIndices = useCallback(async () => {
    try {
      await refreshIndicesRequest(indexNames);
      await reloadIndices();
      await onIndexRefresh?.();
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.refreshIndicesAction.indexRefreshedMessage', {
          defaultMessage: 'The index {indexNames} was refreshed.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [reloadIndices, indexNames, onIndexRefresh, notificationService]);

  const clearCacheIndices = useCallback(async () => {
    try {
      await clearCacheIndicesRequest(indexNames);
      await reloadIndices();
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.clearCacheIndicesAction.indexCacheClearedMessage', {
          defaultMessage: 'The cache of the index {indexNames} was cleared.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [reloadIndices, indexNames, notificationService]);

  const forcemergeIndices = useCallback(
    async (maxNumSegments: string) => {
      try {
        await forcemergeIndicesRequest(indexNames, maxNumSegments);
        await reloadIndices();
        notificationService.showSuccessToast(
          i18n.translate('xpack.idxMgmt.forceMergeIndicesAction.indexForcemergedMessage', {
            defaultMessage: 'The index {indexNames} was force merged.',
            values: { indexNames: indexNames.join(', ') },
          })
        );
      } catch (error) {
        notificationService.showDangerToast(error.body.message);
      }
    },
    [reloadIndices, indexNames, notificationService]
  );

  const deleteIndices = useCallback(async () => {
    try {
      await deleteIndicesRequest(indexNames);
      notificationService.showSuccessToast(
        i18n.translate('xpack.idxMgmt.deleteIndicesAction.indexDeletedMessage', {
          defaultMessage: 'The index {indexNames} was deleted.',
          values: { indexNames: indexNames.join(', ') },
        })
      );
      navigateToIndicesList();
    } catch (error) {
      notificationService.showDangerToast(error.body.message);
    }
  }, [navigateToIndicesList, indexNames, notificationService]);

  const performExtensionAction = useCallback(
    async (
      requestMethod: (names: string[], http: HttpSetup) => Promise<void>,
      successMessage: string
    ) => {
      try {
        await requestMethod(indexNames, httpService.httpClient);
        await reloadIndices();
        notificationService.showSuccessToast(successMessage);
      } catch (error) {
        notificationService.showDangerToast(error.body.message);
      }
    },
    [reloadIndices, indexNames, notificationService]
  );

  const manageIndexItems = useMemo<AppMenuPopoverItem[]>(() => {
    const allOpen = index.status === INDEX_OPEN;
    const items: AppMenuPopoverItem[] = [];
    let order = 0;

    if (allOpen && enableIndexActions) {
      items.push({
        id: 'closeIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.closeIndexLabel', {
          defaultMessage: 'Close index',
        }),
        run: () => {
          closeIndices();
        },
        testId: 'closeIndexMenuButton',
      });
      items.push({
        id: 'forcemergeIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.forceMergeIndexLabel', {
          defaultMessage: 'Force merge index',
        }),
        run: () => {
          modalRef.current?.openModal({ kind: 'forcemerge' });
        },
        testId: 'forcemergeIndexMenuButton',
      });
      items.push({
        id: 'refreshIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.refreshIndexLabel', {
          defaultMessage: 'Refresh index',
        }),
        run: () => {
          refreshIndices();
        },
        testId: 'refreshIndexMenuButton',
      });
      items.push({
        id: 'clearCacheIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.clearIndexCacheLabel', {
          defaultMessage: 'Clear index cache',
        }),
        run: () => {
          clearCacheIndices();
        },
        testId: 'clearCacheIndexMenuButton',
      });
      items.push({
        id: 'flushIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.flushIndexLabel', {
          defaultMessage: 'Flush index',
        }),
        run: () => {
          flushIndices();
        },
        testId: 'flushIndexMenuButton',
      });
    } else if (!allOpen && enableIndexActions) {
      items.push({
        id: 'openIndex',
        order: order++,
        label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.openIndexLabel', {
          defaultMessage: 'Open index',
        }),
        run: () => {
          openIndices();
        },
        testId: 'openIndexMenuButton',
      });
    }

    items.push({
      id: 'deleteIndex',
      order: order++,
      label: i18n.translate('xpack.idxMgmt.indexActionsMenu.detailsPage.deleteIndexLabel', {
        defaultMessage: 'Delete index',
      }),
      run: () => {
        modalRef.current?.openModal({ kind: 'delete' });
      },
      testId: 'deleteIndexMenuButton',
    });

    extensionsService.actions.forEach((actionExtension, actionIndex) => {
      const actionDef = actionExtension({
        indices: [index],
        reloadIndices,
        getUrlForApp,
      });
      if (actionDef) {
        const { buttonLabel, requestMethod, successMessage, renderConfirmModal } = actionDef;
        if (requestMethod) {
          items.push({
            id: `extension-${actionIndex}`,
            order: order++,
            label: buttonLabel,
            run: () => {
              performExtensionAction(requestMethod, successMessage);
            },
          });
        } else if (renderConfirmModal) {
          items.push({
            id: `extension-${actionIndex}`,
            order: order++,
            label: buttonLabel,
            run: () => {
              modalRef.current?.openModal({ kind: 'extension', actionIndex });
            },
          });
        }
      }
    });

    if (reindexService && index.mode !== 'lookup' && !index.hidden) {
      const documents = index.documents;
      const isWithinDocumentLimit =
        documents !== undefined &&
        documents >= 0 &&
        documents <= MAX_DOCUMENTS_FOR_CONVERT_TO_LOOKUP_INDEX;
      const hasSinglePrimaryShard =
        Number(index.primary) === MAX_SHARDS_FOR_CONVERT_TO_LOOKUP_INDEX;
      const isConvertable = isServerless
        ? isWithinDocumentLimit
        : isWithinDocumentLimit && hasSinglePrimaryShard;

      items.push({
        id: 'convertToLookupIndex',
        order: order++,
        label: i18n.translate(
          'xpack.idxMgmt.indexActionsMenu.detailsPage.convertToLookupIndexButton',
          {
            defaultMessage: 'Convert to lookup index',
          }
        ),
        disableButton: !isConvertable,
        tooltipContent: !isConvertable
          ? isServerless
            ? i18n.translate(
                'xpack.idxMgmt.indexActionsMenu.detailsPage.convertToLookupIndexButton.serverlessError',
                {
                  defaultMessage:
                    'The index must have less than 2 billion documents to be converted.',
                }
              )
            : i18n.translate(
                'xpack.idxMgmt.indexActionsMenu.detailsPage.convertToLookupIndexButton.error',
                {
                  defaultMessage:
                    'The index must have less than 2 billion documents and a single shard to be converted.',
                }
              )
          : undefined,
        run: () => {
          modalRef.current?.openModal({ kind: 'convertToLookup' });
        },
        testId: 'convertToLookupIndexButton',
      });
    }

    return items;
  }, [
    index,
    enableIndexActions,
    isServerless,
    reindexService,
    extensionsService.actions,
    reloadIndices,
    getUrlForApp,
    closeIndices,
    openIndices,
    flushIndices,
    refreshIndices,
    clearCacheIndices,
    performExtensionAction,
  ]);

  const modalHost = useMemo<ReactNode>(
    () => (
      <ModalHost
        ref={modalRef}
        indexNames={[index.name]}
        indices={[index]}
        indicesListURLParams=""
        forcemergeIndices={forcemergeIndices}
        deleteIndices={deleteIndices}
        reloadIndices={reloadIndices}
        extensionsService={extensionsService}
        getUrlForApp={getUrlForApp}
        history={history}
      />
    ),
    [
      index,
      forcemergeIndices,
      deleteIndices,
      reloadIndices,
      extensionsService,
      getUrlForApp,
      history,
    ]
  );

  return { manageIndexItems, modalHost };
}
