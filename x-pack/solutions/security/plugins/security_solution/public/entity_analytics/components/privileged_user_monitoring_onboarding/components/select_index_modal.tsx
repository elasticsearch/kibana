/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiFlexItem,
  EuiFlexGroup,
  EuiButton,
  EuiModalFooter,
  EuiSpacer,
  EuiComboBox,
  EuiModalHeaderTitle,
  EuiModalHeader,
  EuiModalBody,
  EuiModal,
  EuiFormRow,
  EuiCallOut,
  useGeneratedHtmlId,
  EuiText,
  EuiCode,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useBoolean, useDebounceFn } from '@kbn/react-hooks';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import { useFetchPrivilegedUserIndices } from '../hooks/use_fetch_privileged_user_indices';
import { useEntityAnalyticsRoutes } from '../../../api/api';
import { CreateIndexModal } from './create_index_modal';
import { useUserLimitStatus } from '../../../hooks/use_privileged_monitoring_health';

export const SELECT_INDEX_LABEL = i18n.translate(
  'xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.comboboxPlaceholder',
  {
    defaultMessage: 'Select index',
  }
);

export const LOADING_ERROR_MESSAGE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.error',
  {
    defaultMessage: 'Error loading indices. Please try again later.',
  }
);

export const DEBOUNCE_OPTIONS = { wait: 300 };

export const IndexSelectorModal = ({
  onClose,
  onImport,
  editDataSource,
}: {
  onClose: () => void;
  onImport: (userCount: number) => void;
  editDataSource?: {
    id: string;
    indexPattern?: string;
  };
}) => {
  const modalTitleId = useGeneratedHtmlId();
  const [selectedOptions, setSelected] = useState<Array<EuiComboBoxOptionOption<string>>>(
    editDataSource?.indexPattern?.split(',').map((index) => ({ label: index })) ?? []
  );

  const [isCreateIndexModalOpen, { on: showCreateIndexModal, off: hideCreateIndexModal }] =
    useBoolean(false);
  const { addError } = useAppToasts();
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined);
  const { data: indices, isFetching, error, refetch } = useFetchPrivilegedUserIndices(searchQuery);
  const debouncedSetSearchQuery = useDebounceFn(setSearchQuery, DEBOUNCE_OPTIONS);
  const { registerPrivMonMonitoredIndices, updatePrivMonMonitoredIndices } =
    useEntityAnalyticsRoutes();
  const { userStats } = useUserLimitStatus();
  const maxUsersAllowed = userStats?.maxAllowed ?? 10000; // fallback to default config value
  const options = useMemo(
    () =>
      indices?.map((index) => ({
        label: index,
        'data-test-subj': `privMonIndexOption-${index}`,
      })) ?? [],
    [indices]
  );

  useEffect(() => {
    if (error != null) {
      addError(error, { title: LOADING_ERROR_MESSAGE });
    }
  }, [addError, error]);

  const addPrivilegedUsers = useCallback(async () => {
    if (selectedOptions.length > 0) {
      if (editDataSource?.id) {
        await updatePrivMonMonitoredIndices(
          editDataSource.id,
          selectedOptions.map(({ label }) => label).join(',')
        );
      } else {
        await registerPrivMonMonitoredIndices(selectedOptions.map(({ label }) => label).join(','));
      }

      onImport(0); // The API does not return the user count because it is not available at this point.
    }
  }, [
    editDataSource?.id,
    onImport,
    registerPrivMonMonitoredIndices,
    selectedOptions,
    updatePrivMonMonitoredIndices,
  ]);

  const onCreateIndex = useCallback(
    (indexName: string) => {
      hideCreateIndexModal();
      setSelected(selectedOptions.concat({ label: indexName }));
      refetch();
    },
    [hideCreateIndexModal, refetch, selectedOptions, setSelected]
  );

  return isCreateIndexModalOpen ? (
    <CreateIndexModal onClose={hideCreateIndexModal} onCreate={onCreateIndex} />
  ) : (
    <EuiModal
      onClose={onClose}
      maxWidth="624px"
      data-test-subj="index-selector-modal"
      aria-labelledby={modalTitleId}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.title"
            defaultMessage="Select index"
          />
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size="s">
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.description"
            defaultMessage="Add your privileged users by selecting one or more indices as a data source. All users specified in the {nameField} field will be defined as privileged users (maximum number allowed: {maxPrivilegedUsersAllowed})."
            values={{
              nameField: <EuiCode>{'user.name'}</EuiCode>,
              maxPrivilegedUsersAllowed: maxUsersAllowed,
            }}
          />
        </EuiText>
        <EuiSpacer size="m" />
        {error ? (
          <>
            <EuiCallOut announceOnMount color="danger">
              {LOADING_ERROR_MESSAGE}
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.comboboxLabel"
              defaultMessage="Index"
            />
          }
          fullWidth
        >
          <EuiComboBox
            isLoading={isFetching && !error}
            fullWidth
            aria-label={SELECT_INDEX_LABEL}
            placeholder={SELECT_INDEX_LABEL}
            options={options}
            selectedOptions={selectedOptions}
            onChange={setSelected}
            isClearable={true}
            onSearchChange={(query) => {
              debouncedSetSearchQuery.run(query);
            }}
            async
            optionMatcher={(_) => false} // prevent the combo box from searching on the client side
          />
        </EuiFormRow>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="plusCircle"
              onClick={showCreateIndexModal}
              data-test-subj="create-index-button"
              aria-label={i18n.translate(
                'xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.createIndexButtonAriaLabel',
                { defaultMessage: 'Create index' }
              )}
            >
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.createIndexButtonLabel"
                defaultMessage="Create index"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={true}>
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiButtonEmpty
                onClick={onClose}
                aria-label={i18n.translate(
                  'xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.cancelButtonAriaLabel',
                  { defaultMessage: 'Cancel' }
                )}
              >
                <FormattedMessage
                  id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.cancelButtonLabel"
                  defaultMessage="Cancel"
                />
              </EuiButtonEmpty>
              <EuiButton
                onClick={addPrivilegedUsers}
                fill
                disabled={selectedOptions.length === 0}
                data-test-subj="privileged-user-monitoring-update-button"
              >
                <FormattedMessage
                  id="xpack.securitySolution.entityAnalytics.privilegedUserMonitoring.selectIndex.addUserButtonLabel"
                  defaultMessage="Update privileged users"
                />
              </EuiButton>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
};
