/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import {
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSelect,
  EuiSpacer,
  EuiTablePagination,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { CaseUI } from '../../../../../common/ui/types';
import { useCasesContext } from '../../../cases_context/use_cases_context';
import { KibanaServices, useKibana } from '../../../../common/lib/kibana';
import { SavedObjectRow } from './saved_object_row';
import { useFindSavedObjects } from './use_find_saved_objects';
import { useAttachSavedObject } from './use_attach_saved_object';
import {
  canAccessSavedObject,
  getAttachedSavedObjectKeys,
  getSavedObjectKey,
  SO_TYPE_TO_ATTACHMENT_TYPE,
  SUPPORTED_SO_TYPES,
  type SupportedSavedObjectType,
} from './helpers';
import type { FoundSavedObject } from './types';
import * as i18n from './translations';

const DEFAULT_PAGE_SIZE = 10;
const MODAL_HEIGHT = 480;
const MODAL_WIDTH = 800;
const PER_PAGE_OPTIONS = [10, 25, 50];
const MODAL_CSS = { inlineSize: MODAL_WIDTH } as const;
const RESULTS_REGION_CSS = {
  blockSize: MODAL_HEIGHT,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
} as const;
const RESULTS_SPINNER_CSS = { blockSize: '100%' } as const;
const EMPTY_PROMPT_CSS = { margin: 'auto' } as const;

export interface AttachSavedObjectModalProps {
  caseData: CaseUI;
  onClose: () => void;
}

export const AttachSavedObjectModal: React.FC<AttachSavedObjectModalProps> = ({
  caseData,
  onClose,
}) => {
  const {
    services: { http, application, savedObjectsTaggingOss: contextTagging },
  } = useKibana();
  // Some host plugins (e.g. security_solution) strip `savedObjectsTaggingOss`
  // from their KibanaContextProvider and only forward the resolved tagging API
  // under a different key. Fall back to the cases-owned singleton (populated
  // from `plugins.savedObjectsTaggingOss` at start time) so tags resolve no
  // matter which host renders the modal.
  const savedObjectsTaggingOss = useMemo(() => {
    if (contextTagging) {
      return contextTagging;
    }
    try {
      return KibanaServices.get().savedObjectsTaggingOss;
    } catch {
      return undefined;
    }
  }, [contextTagging]);
  const { unifiedAttachmentTypeRegistry } = useCasesContext();
  const [attachedSavedObjectKeys, setAttachedSavedObjectKeys] = useState<Set<string>>(() =>
    getAttachedSavedObjectKeys(caseData.comments)
  );
  const caseOwner = caseData.owner;
  const modalTitleId = useGeneratedHtmlId();

  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<SupportedSavedObjectType | 'all'>('all');
  const [page, setPage] = useState<number>(0);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PAGE_SIZE);

  // Debounce so typing doesn't fire one find request per keystroke. The
  // visible input stays controlled by `query`; the find hook reads `debouncedQuery`.
  useDebounce(() => setDebouncedQuery(query), 250, [query]);

  // Tagging is optional (not available in serverless OSS); the badge component
  // tolerates `undefined` and skips tag resolution in that case.
  const taggingApi = useMemo(
    () =>
      savedObjectsTaggingOss?.isTaggingAvailable()
        ? savedObjectsTaggingOss.getTaggingApi()
        : undefined,
    [savedObjectsTaggingOss]
  );

  const {
    attach,
    attachmentId: attachInFlightId,
    isAttaching,
  } = useAttachSavedObject({
    caseId: caseData.id,
    caseOwner,
    onAttached: onClose,
  });

  const handleAttach = useCallback(
    async (savedObject: FoundSavedObject) => {
      try {
        await attach(savedObject);
      } catch {
        // `useCreateAttachments` (react-query) already surfaces an error toast
        // via its `onError`; swallow here to keep the rejection out of the
        // unhandled-rejection bucket and leave the modal open for retry.
        return;
      }
      const key = getSavedObjectKey(savedObject.type, savedObject.id);
      setAttachedSavedObjectKeys((prev) => {
        if (prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [attach]
  );

  const availableSoTypes = useMemo<SupportedSavedObjectType[]>(
    () =>
      SUPPORTED_SO_TYPES.filter((soType) =>
        unifiedAttachmentTypeRegistry.has(SO_TYPE_TO_ATTACHMENT_TYPE[soType])
      ),
    [unifiedAttachmentTypeRegistry]
  );

  const getDisplayName = useCallback(
    (soType: SupportedSavedObjectType): string => {
      // Fall back to the raw soType when the attachment type isn't registered
      const attachmentTypeId = SO_TYPE_TO_ATTACHMENT_TYPE[soType];
      if (!unifiedAttachmentTypeRegistry.has(attachmentTypeId)) return soType;
      return unifiedAttachmentTypeRegistry.get(attachmentTypeId).displayName;
    },
    [unifiedAttachmentTypeRegistry]
  );

  const typeOptions = useMemo(
    () => [
      { value: 'all', text: i18n.FILTER_ALL },
      ...availableSoTypes.map((soType) => ({
        value: soType,
        text: getDisplayName(soType),
      })),
    ],
    [availableSoTypes, getDisplayName]
  );

  const searchTypes = useMemo<SupportedSavedObjectType[]>(
    () => (selectedType === 'all' ? availableSoTypes : [selectedType]),
    [selectedType, availableSoTypes]
  );

  const { items, pageCount, isLoading } = useFindSavedObjects({
    types: searchTypes,
    query: debouncedQuery,
    page,
    perPage,
  });

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setPage(0);
  }, []);

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedType(e.target.value as SupportedSavedObjectType | 'all');
    setPage(0);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => setPage(nextPage), []);

  const handlePerPageChange = useCallback((nextPerPage: number) => {
    setPerPage(nextPerPage);
    setPage(0);
  }, []);

  const renderRow = useCallback(
    (savedObject: FoundSavedObject) => {
      const savedObjectKey = getSavedObjectKey(savedObject.type, savedObject.id);
      const title = savedObject.meta.title || `${savedObject.type} [id=${savedObject.id}]`;
      const inAppPath = savedObject.meta.inAppUrl?.path;
      // Only expose a clickable link when the user has the in-app capability;
      // otherwise SavedObjectLink renders the title as a disabled link.
      const href =
        inAppPath && canAccessSavedObject(savedObject, application.capabilities)
          ? http.basePath.prepend(inAppPath)
          : undefined;

      return (
        <SavedObjectRow
          key={savedObjectKey}
          savedObject={savedObject}
          title={title}
          typeLabel={getDisplayName(savedObject.type)}
          href={href}
          isAttached={attachedSavedObjectKeys.has(savedObjectKey)}
          isAttachInFlight={attachInFlightId === savedObject.id}
          isAttachingAny={isAttaching}
          taggingApi={taggingApi}
          onAttach={handleAttach}
        />
      );
    },
    [
      application.capabilities,
      attachInFlightId,
      attachedSavedObjectKeys,
      getDisplayName,
      handleAttach,
      http.basePath,
      isAttaching,
      taggingApi,
    ]
  );

  return (
    <EuiModal
      onClose={onClose}
      css={MODAL_CSS}
      aria-labelledby={modalTitleId}
      data-test-subj="cases-attach-so-modal"
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>{i18n.MODAL_TITLE}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiFlexGroup gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              placeholder={i18n.SEARCH_PLACEHOLDER}
              value={query}
              onChange={handleQueryChange}
              isClearable
              data-test-subj="cases-attach-so-search"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={typeOptions}
              value={selectedType}
              onChange={handleTypeChange}
              data-test-subj="cases-attach-so-type-select"
              aria-label={i18n.FILTER_TYPE_LABEL}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <div css={RESULTS_REGION_CSS} data-test-subj="cases-attach-so-results-region">
          {isLoading ? (
            <EuiFlexGroup
              justifyContent="center"
              alignItems="center"
              css={RESULTS_SPINNER_CSS}
              data-test-subj="cases-attach-so-loading"
            >
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="l" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : items.length === 0 ? (
            <EuiEmptyPrompt
              iconType="search"
              titleSize="xs"
              body={<p>{i18n.NO_ITEMS_FOUND}</p>}
              css={EMPTY_PROMPT_CSS}
              data-test-subj="cases-attach-so-empty"
            />
          ) : (
            <EuiFlexGroup
              direction="column"
              gutterSize="s"
              aria-label={i18n.SAVED_OBJECT_LIST_LABEL}
              data-test-subj="cases-attach-so-list"
            >
              {items.map((savedObject) => (
                <EuiFlexItem key={getSavedObjectKey(savedObject.type, savedObject.id)} grow={false}>
                  {renderRow(savedObject)}
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          )}
        </div>
        <EuiSpacer size="m" />
        <EuiTablePagination
          activePage={page}
          pageCount={pageCount}
          itemsPerPage={perPage}
          itemsPerPageOptions={PER_PAGE_OPTIONS}
          onChangePage={handlePageChange}
          onChangeItemsPerPage={handlePerPageChange}
          data-test-subj="cases-attach-so-pagination"
        />
      </EuiModalBody>
    </EuiModal>
  );
};

AttachSavedObjectModal.displayName = 'AttachSavedObjectModal';
