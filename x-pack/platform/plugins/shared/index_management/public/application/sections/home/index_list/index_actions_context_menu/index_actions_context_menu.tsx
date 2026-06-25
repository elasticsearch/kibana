/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useState, useRef } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { every } from 'lodash';
import type { EuiPopoverProps, EuiButtonProps } from '@elastic/eui';
import {
  EuiButton,
  EuiContextMenu,
  EuiPopover,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import useObservable from 'react-use/lib/useObservable';
import { EMPTY } from 'rxjs';

import type { HttpSetup } from '@kbn/core-http-browser';
import { flattenPanelTree } from '../../../../lib/flatten_panel_tree';
import { isClosedIndexStatus } from '../../../../lib/is_closed_index_status';
import {
  INDEX_OPEN,
  IndexDetailsSection,
  MAX_DOCUMENTS_FOR_CONVERT_TO_LOOKUP_INDEX,
  MAX_SHARDS_FOR_CONVERT_TO_LOOKUP_INDEX,
} from '../../../../../../common/constants';
import { getIndexDetailsLink } from '../../../../services/routing';
import { useAppContext } from '../../../../app_context';
import type { Index } from '../../../../../../common';
import { type DocCountApi, RequestResultType } from '../index_table/get_doc_count';
import { ModalHost, type ModalHostHandles } from './modal_host/modal_host';

export interface IndexActionsContextMenuProps {
  // either an array of indices selected in the list view or an array of 1 index name on the details panel/page
  indexNames: string[];
  // indices data
  indices: Index[];

  // indicates if the context menu is on the list view (to show additional actions)
  isOnListView?: boolean;
  // a callback used to reset selected indices on the list view
  resetSelection?: () => void;

  // these props are only set on the details panel to change style
  anchorPosition?: EuiPopoverProps['anchorPosition'];
  iconSide?: EuiButtonProps['iconSide'];
  iconType?: EuiButtonProps['iconType'];
  label?: ReactNode;

  // index actions: functions are called with indexNames prop so no need to pass it as argument here
  closeIndices: () => Promise<void>;
  openIndices: () => Promise<void>;
  flushIndices: () => Promise<void>;
  refreshIndices: () => Promise<void>;
  clearCacheIndices: () => Promise<void>;
  forcemergeIndices: (maxNumSegments: string) => Promise<void>;
  deleteIndices: () => Promise<void>;

  // used to determine if all indices are open
  indexStatusByName: {
    [indexName: string]: Index['status'] | undefined;
  };

  // this function is called with an extension service action
  performExtensionAction: (
    requestMethod: (indexNames: string[], http: HttpSetup) => Promise<void>,
    successMessage: string
  ) => Promise<void>;
  // this function is called to "refresh" the indices data after and extension service action that uses a modal
  reloadIndices: () => void;

  // observable API for doc counts
  docCountApi?: DocCountApi;

  /**
   * Props added to use the context menu on the new index details page
   */
  // makes the button secondary
  fill?: boolean;
  // sets the button's loading state
  isLoading?: boolean;
  indicesListURLParams?: string;
}

export const IndexActionsContextMenu = ({
  indexNames,
  indices,
  isOnListView,
  resetSelection,
  anchorPosition,
  iconSide = 'right',
  iconType = 'chevronSingleDown',
  label,
  closeIndices,
  openIndices,
  flushIndices,
  refreshIndices,
  clearCacheIndices,
  forcemergeIndices,
  deleteIndices,
  indexStatusByName,
  docCountApi,
  performExtensionAction,
  reloadIndices,
  fill = true,
  isLoading = false,
  indicesListURLParams = '',
}: IndexActionsContextMenuProps) => {
  const {
    services: { extensionsService },
    plugins: { reindexService },
    core: { getUrlForApp },
    history,
    config: { enableIndexActions, isServerless },
  } = useAppContext();

  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  const modalRef = useRef<ModalHostHandles | null>(null);
  const { euiTheme } = useEuiTheme();
  const docCountMap = useObservable(docCountApi?.getObservable() ?? EMPTY);

  const computedAnchorPosition: EuiPopoverProps['anchorPosition'] =
    anchorPosition ?? (isOnListView ? 'downLeft' : 'downRight');

  const popoverStyles = css`
    overflow-x: hidden;
    max-height: min(60vh, calc(100vh - ${euiTheme.size.xxxl} - ${euiTheme.size.m}));
    max-width: calc(100vw - ${euiTheme.size.xl});
    @supports (height: 100dvh) {
      max-height: min(60dvh, calc(100dvh - ${euiTheme.size.xxxl} - ${euiTheme.size.m}));
    }
    @supports (width: 100dvw) {
      max-width: calc(100dvw - ${euiTheme.size.xl});
    }
  `;

  const onButtonClick = () => {
    // When opening for a single index, trigger a doc-count fetch if neither the
    // index data nor the observable cache already has a result. Without this,
    // isConvertableToLookupIndex returns false until the index list page
    // populates the count, so the action may appear disabled incorrectly.
    if (!isPopoverOpen && indexNames.length === 1 && docCountApi) {
      const indexName = indexNames[0];
      const selectedIndex = indices.find((index) => index.name === indexName);
      const indexStatus = indexStatusByName[indexName] ?? selectedIndex?.status;
      if (
        selectedIndex?.documents === undefined &&
        !docCountMap?.[indexName] &&
        !isClosedIndexStatus(indexStatus)
      ) {
        docCountApi.getByName(indexName);
      }
    }
    setIsPopoverOpen((prevState) => !prevState);
  };

  const closePopoverAndExecute = async (func: () => void | Promise<void>) => {
    setIsPopoverOpen(false);
    try {
      await func();
    } finally {
      resetSelection?.();
    }
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const isConvertableToLookupIndex = (indexName: string) => {
    const selectedIndex = indices.find((index) => index.name === indexName);
    if (!selectedIndex) {
      return false;
    }

    const docCount = docCountMap?.[indexName];
    const documents =
      selectedIndex.documents ??
      (docCount?.status === RequestResultType.Success ? docCount.count : undefined);

    if (documents === undefined) {
      return false;
    }

    // In non-serverless mode, we also need to check primary shards
    if (!isServerless && selectedIndex.primary === undefined) {
      return false;
    }

    const isWithinDocumentLimit =
      documents >= 0 && documents <= MAX_DOCUMENTS_FOR_CONVERT_TO_LOOKUP_INDEX;

    const hasSinglePrimaryShard =
      Number(selectedIndex.primary) === MAX_SHARDS_FOR_CONVERT_TO_LOOKUP_INDEX;

    // In serverless mode, only check document limit
    // In non-serverless mode, require both document limit and single primary shard
    if (isServerless) {
      return isWithinDocumentLimit;
    }

    return isWithinDocumentLimit && hasSinglePrimaryShard;
  };

  const getPanels = () => {
    const allOpen = every(indexNames, (indexName) => {
      return indexStatusByName[indexName] === INDEX_OPEN;
    });

    const selectedIndexCount = indexNames.length;
    const items = [];
    if (isOnListView && selectedIndexCount === 1) {
      items.push({
        'data-test-subj': 'showOverviewIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.showIndexOverviewLabel', {
          defaultMessage: 'Show index overview',
        }),
        onClick: () => {
          history.push(
            getIndexDetailsLink(indexNames[0], indicesListURLParams, IndexDetailsSection.Overview)
          );
        },
      });
      items.push({
        'data-test-subj': 'showSettingsIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.showIndexSettingsLabel', {
          defaultMessage: 'Show index settings',
        }),
        onClick: () => {
          history.push(
            getIndexDetailsLink(indexNames[0], indicesListURLParams, IndexDetailsSection.Settings)
          );
        },
      });
      items.push({
        'data-test-subj': 'showMappingsIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.showIndexMappingLabel', {
          defaultMessage: 'Show index mapping',
        }),
        onClick: () => {
          history.push(
            getIndexDetailsLink(indexNames[0], indicesListURLParams, IndexDetailsSection.Mappings)
          );
        },
      });
      if (allOpen && enableIndexActions) {
        items.push({
          'data-test-subj': 'showStatsIndexMenuButton',
          name: i18n.translate('xpack.idxMgmt.indexActionsMenu.showIndexStatsLabel', {
            defaultMessage: 'Show index stats',
          }),
          onClick: () => {
            history.push(
              getIndexDetailsLink(indexNames[0], indicesListURLParams, IndexDetailsSection.Stats)
            );
          },
        });
      }
    }
    if (allOpen && enableIndexActions) {
      items.push({
        'data-test-subj': 'closeIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.closeIndexLabel', {
          defaultMessage: 'Close {selectedIndexCount, plural, one {index} other {indices} }',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopoverAndExecute(closeIndices);
        },
      });
      items.push({
        'data-test-subj': 'forcemergeIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.forceMergeIndexLabel', {
          defaultMessage: 'Force merge {selectedIndexCount, plural, one {index} other {indices} }',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopover();
          modalRef.current?.openModal({ kind: 'forcemerge' });
        },
      });
      items.push({
        'data-test-subj': 'refreshIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.refreshIndexLabel', {
          defaultMessage: 'Refresh {selectedIndexCount, plural, one {index} other {indices} }',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopoverAndExecute(refreshIndices);
        },
      });
      items.push({
        'data-test-subj': 'clearCacheIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.clearIndexCacheLabel', {
          defaultMessage: 'Clear {selectedIndexCount, plural, one {index} other {indices} } cache',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopoverAndExecute(clearCacheIndices);
        },
      });
      items.push({
        'data-test-subj': 'flushIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.flushIndexLabel', {
          defaultMessage: 'Flush {selectedIndexCount, plural, one {index} other {indices} }',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopoverAndExecute(flushIndices);
        },
      });
    } else if (!allOpen && enableIndexActions) {
      items.push({
        'data-test-subj': 'openIndexMenuButton',
        name: i18n.translate('xpack.idxMgmt.indexActionsMenu.openIndexLabel', {
          defaultMessage: 'Open {selectedIndexCount, plural, one {index} other {indices} }',
          values: { selectedIndexCount },
        }),
        onClick: () => {
          closePopoverAndExecute(openIndices);
        },
      });
    }
    items.push({
      'data-test-subj': 'deleteIndexMenuButton',
      name: i18n.translate('xpack.idxMgmt.indexActionsMenu.deleteIndexLabel', {
        defaultMessage: 'Delete {selectedIndexCount, plural, one {index} other {indices} }',
        values: { selectedIndexCount },
      }),
      onClick: () => {
        closePopover();
        modalRef.current?.openModal({ kind: 'delete' });
      },
    });
    extensionsService.actions.forEach((actionExtension, actionIndex) => {
      const actionExtensionDefinition = actionExtension({
        indices,
        reloadIndices,
        getUrlForApp,
      });
      if (actionExtensionDefinition) {
        const { buttonLabel, requestMethod, successMessage, renderConfirmModal } =
          actionExtensionDefinition;
        if (requestMethod) {
          items.push({
            name: buttonLabel,
            onClick: () => {
              closePopoverAndExecute(async () => {
                await performExtensionAction(requestMethod, successMessage);
              });
            },
          });
        } else if (renderConfirmModal) {
          items.push({
            name: buttonLabel,
            onClick: () => {
              closePopover();
              modalRef.current?.openModal({ kind: 'extension', actionIndex });
            },
          });
        }
      }
    });
    if (selectedIndexCount === 1) {
      const indexName = indexNames[0];
      const isConvertable = isConvertableToLookupIndex(indexName);

      const selectedIndex = indices.find((index) => index.name === indexName);

      // Only show the "Convert to lookup index" action if the reindexService plugin is available,
      // the index is not already a lookup index and the index is not hidden
      if (reindexService && selectedIndex?.mode !== 'lookup' && !selectedIndex?.hidden) {
        items.push({
          'data-test-subj': 'convertToLookupIndexButton',
          name: (
            <>
              <EuiText size="s">
                <FormattedMessage
                  id="xpack.idxMgmt.indexActionsMenu.convertToLookupIndexButton"
                  defaultMessage="Convert to lookup index"
                />
              </EuiText>
              {!isConvertable && (
                <>
                  <EuiSpacer size="xs" />
                  <EuiText size="xs">
                    {isServerless ? (
                      <FormattedMessage
                        id="xpack.idxMgmt.indexActionsMenu.convertToLookupIndexButton.serverlessError"
                        defaultMessage="The index must have less than 2 billion documents to be converted."
                      />
                    ) : (
                      <FormattedMessage
                        id="xpack.idxMgmt.indexActionsMenu.convertToLookupIndexButton.error"
                        defaultMessage="The index must have less than 2 billion documents and a single shard to be converted."
                      />
                    )}
                  </EuiText>
                </>
              )}
            </>
          ),
          disabled: !isConvertable,
          onClick: () => {
            closePopover();
            modalRef.current?.openModal({ kind: 'convertToLookup' });
          },
        });
      }
    }
    const panelTree = {
      id: 0,
      title: i18n.translate('xpack.idxMgmt.indexActionsMenu.panelTitle', {
        defaultMessage: '{selectedIndexCount, plural, one {Index} other {Indices} } options',
        values: { selectedIndexCount },
      }),
      items,
    };
    return flattenPanelTree(panelTree);
  };

  const selectedIndexCount = indexNames.length;

  const panels = getPanels();

  const button = (
    <EuiButton
      data-test-subj="indexActionsContextMenuButton"
      iconSide={iconSide}
      aria-label={i18n.translate('xpack.idxMgmt.indexActionsMenu.manageButtonAriaLabel', {
        defaultMessage:
          'Manage {selectedIndexCount, plural, one {index} other {{selectedIndexCount} indices}}',
        values: { selectedIndexCount },
      })}
      onClick={onButtonClick}
      iconType={iconType}
      fill={fill}
      isLoading={isLoading}
    >
      {label ? (
        label
      ) : (
        <FormattedMessage
          id="xpack.idxMgmt.indexActionsMenu.manageButtonLabel"
          defaultMessage="Manage {selectedIndexCount, plural, one {index} other {{selectedIndexCount} indices}}"
          values={{ selectedIndexCount }}
        />
      )}
    </EuiButton>
  );

  return (
    <div>
      <ModalHost
        ref={modalRef}
        indexNames={indexNames}
        indices={indices}
        indicesListURLParams={indicesListURLParams}
        resetSelection={resetSelection}
        forcemergeIndices={forcemergeIndices}
        deleteIndices={deleteIndices}
        reloadIndices={reloadIndices}
        extensionsService={extensionsService}
        getUrlForApp={getUrlForApp}
        history={history}
      />
      <EuiPopover
        id="contextMenuIndices"
        aria-label={i18n.translate('xpack.idxMgmt.indexActionsMenu.popoverAriaLabel', {
          defaultMessage: 'Index actions menu',
        })}
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition={computedAnchorPosition}
        repositionOnScroll
        repositionToCrossAxis={false}
        panelProps={{
          css: popoverStyles,
        }}
      >
        <EuiContextMenu data-test-subj="indexContextMenu" initialPanelId={0} panels={panels} />
      </EuiPopover>
    </div>
  );
};
