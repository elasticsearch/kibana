/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import styled from '@emotion/styled';
import { isEmpty } from 'lodash/fp';

import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlyout,
  EuiFlyoutBody,
  EuiHorizontalRule,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';

import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { ExceptionListSchema, OsTypeArray } from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import type {
  ExceptionsBuilderExceptionItem,
  ExceptionsBuilderReturnExceptionItem,
} from '@kbn/securitysolution-list-utils';
import {
  getMalformedMatchesFields,
  hasPartialCodeSignatureEntry,
  hasWrongOperatorWithWildcard,
} from '@kbn/securitysolution-list-utils';

import {
  MalformedMatchesValueCallout,
  PartialCodeSignatureCallout,
  WildCardWithWrongOperatorCallout,
} from '@kbn/securitysolution-exception-list-components';
import type { Moment } from 'moment';
import type { Status } from '../../../../../common/api/detection_engine';
import * as i18n from './translations';
import { ExceptionItemComments } from '../item_comments';
import { useKibana } from '../../../../common/lib/kibana';
import {
  defaultEndpointExceptionItems,
  getPrepopulatedRuleExceptionWithHighlightFields,
  retrieveAlertOsTypes,
} from '../../utils/helpers';
import { ENDPOINT_EXCEPTION, RULE_EXCEPTION } from '../../utils/translations';
import type { AlertData } from '../../utils/types';
import { createExceptionItemsReducer, initialState } from './reducer';
import { ExceptionsFlyoutMeta } from '../flyout_components/item_meta_form';
import { ExceptionsConditions } from '../flyout_components/item_conditions';
import { useFetchIndexPatterns } from '../../logic/use_exception_flyout_data';
import type { Rule } from '../../../rule_management/logic/types';
import { ExceptionItemsFlyoutAlertsActions } from '../flyout_components/alerts_actions';
import { ExceptionsAddToRulesOrLists } from '../flyout_components/add_exception_to_rule_or_list';
import { useAddNewExceptionItems } from './use_add_new_exceptions';
import { useCloseAlertsFromExceptions } from '../../logic/use_close_alerts';
import { ruleTypesThatAllowLargeValueLists } from '../../utils/constants';
import { useInvalidateFetchRuleByIdQuery } from '../../../rule_management/api/hooks/use_fetch_rule_by_id_query';
import { ExceptionsExpireTime } from '../flyout_components/expire_time';
import {
  ArtifactConfirmModal,
  CONFIRM_WARNING_MODAL_LABELS,
} from '../../../../management/components/artifact_list_page/components/artifact_confirm_modal';
import { ExceptionFlyoutFooter } from '../flyout_components/footer';
import { ExceptionFlyoutHeader } from '../flyout_components/header';
import * as headerI18n from '../flyout_components/header/translations';
import { isSubmitDisabled, prepareNewItemsForSubmission, prepareToCloseAlerts } from './helpers';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

const SectionHeader = styled(EuiTitle)`
  font-weight: ${({ theme }) => theme.euiTheme.font.weight.semiBold};
`;

export interface AddExceptionFlyoutProps {
  rules: Rule[] | null;
  isBulkAction: boolean;
  showAlertCloseOptions: boolean;
  isEndpointItem: boolean;
  alertData?: AlertData;
  /**
   * The components that use this may or may not define `alertData`
   * If they do, they need to fetch it async. In that case `alertData` will be
   * undefined while `isAlertDataLoading` will be true. In the case that `alertData`
   *  is not used, `isAlertDataLoading` will be undefined
   */
  isAlertDataLoading?: boolean;
  alertStatus?: Status;
  sharedListToAddTo?: ExceptionListSchema[];
  onCancel: (didRuleChange: boolean) => void;
  onConfirm: (didRuleChange: boolean, didCloseAlert: boolean, didBulkCloseAlert: boolean) => void;
}

const FlyoutBodySection = styled(EuiFlyoutBody)`
  &.builder-section {
    overflow-y: scroll;
  }
`;

export const AddExceptionFlyout = memo(function AddExceptionFlyout({
  rules,
  isBulkAction,
  isEndpointItem,
  alertData,
  showAlertCloseOptions,
  isAlertDataLoading,
  alertStatus,
  sharedListToAddTo,
  onCancel,
  onConfirm,
}: AddExceptionFlyoutProps) {
  const {
    docLinks: { links },
  } = useKibana().services;
  const { hasAlertsUpdate } = useAlertsPrivileges();
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const { isLoading, indexPatterns, getExtendedFields } = useFetchIndexPatterns(rules);
  const [isSubmitting, submitNewExceptionItems] = useAddNewExceptionItems();
  const [isClosingAlerts, closeAlerts] = useCloseAlertsFromExceptions();
  const invalidateFetchRuleByIdQuery = useInvalidateFetchRuleByIdQuery();
  const allowLargeValueLists = useMemo((): boolean => {
    if (rules != null && rules.length === 1) {
      // We'll only block this when we know what rule we're dealing with.
      // When dealing with numerous rules that can be a mix of those that do and
      // don't work with large value lists we'll need to communicate that to the
      // user but not block.
      return ruleTypesThatAllowLargeValueLists.includes(rules[0].type);
    } else {
      return true;
    }
  }, [rules]);

  const addExceptionToRuleOrListSelection = useMemo(() => {
    if (isBulkAction) return 'add_to_rules';
    if (rules?.length === 1 || isAlertDataLoading !== undefined) return 'add_to_rule';
    return 'select_rules_to_add_to';
  }, [isAlertDataLoading, isBulkAction, rules]);

  const getListType = useMemo(() => {
    if (isEndpointItem) return ExceptionListTypeEnum.ENDPOINT;
    if (sharedListToAddTo) return ExceptionListTypeEnum.DETECTION;

    return ExceptionListTypeEnum.RULE_DEFAULT;
  }, [isEndpointItem, sharedListToAddTo]);
  const [
    {
      exceptionItemMeta: { name: exceptionItemName },
      listType,
      selectedOs,
      initialItems,
      exceptionItems,
      disableBulkClose,
      bulkCloseAlerts,
      closeSingleAlert,
      bulkCloseIndex,
      addExceptionToRadioSelection,
      selectedRulesToAddTo,
      exceptionListsToAddTo,
      newComment,
      commentErrorExists,
      itemConditionValidationErrorExists,
      errorSubmitting,
      expireTime,
      expireErrorExists,
      wildcardWarningExists,
      partialCodeSignatureWarningExists,
      malformedMatchesValueExists,
      malformedMatchesFields,
    },
    dispatch,
  ] = useReducer(createExceptionItemsReducer(), {
    ...initialState,
    addExceptionToRadioSelection: addExceptionToRuleOrListSelection,
    listType: getListType,
    selectedRulesToAddTo: rules != null ? rules : [],
  });

  const hasAlertData = useMemo((): boolean => {
    return alertData != null;
  }, [alertData]);

  /**
   * Reducer action dispatchers
   * */
  const setInitialExceptionItems = useCallback(
    (items: ExceptionsBuilderExceptionItem[]): void => {
      dispatch({
        type: 'setInitialExceptionItems',
        items,
      });
    },
    [dispatch]
  );

  const setExceptionItemsToAdd = useCallback(
    (items: ExceptionsBuilderReturnExceptionItem[]): void => {
      dispatch({
        type: 'setWildcardWithWrongOperator',
        warningExists: hasWrongOperatorWithWildcard(items),
      });
      dispatch({
        type: 'setPartialCodeSignature',
        warningExists: hasPartialCodeSignatureEntry(items),
      });
      const fields = getMalformedMatchesFields(items);
      dispatch({ type: 'setMalformedMatchesValue', fields });
      dispatch({
        type: 'setExceptionItems',
        items,
      });
    },
    [dispatch]
  );

  const setRadioOption = useCallback(
    (option: string): void => {
      dispatch({
        type: 'setListOrRuleRadioOption',
        option,
      });
    },
    [dispatch]
  );

  const setSelectedRules = useCallback(
    (rulesSelectedToAdd: Rule[]): void => {
      dispatch({
        type: 'setSelectedRulesToAddTo',
        rules: rulesSelectedToAdd,
      });
    },
    [dispatch]
  );

  const setListsToAddExceptionTo = useCallback(
    (lists: ExceptionListSchema[]): void => {
      dispatch({
        type: 'setAddExceptionToLists',
        listsToAddTo: lists,
      });
    },
    [dispatch]
  );

  const setExceptionItemMeta = useCallback(
    (value: [string, string]): void => {
      dispatch({
        type: 'setExceptionItemMeta',
        value,
      });
    },
    [dispatch]
  );

  const setConditionsValidationError = useCallback(
    (errorExists: boolean): void => {
      dispatch({
        type: 'setConditionValidationErrorExists',
        errorExists,
      });
    },
    [dispatch]
  );

  const setSelectedOs = useCallback(
    (os: OsTypeArray | undefined): void => {
      dispatch({
        type: 'setSelectedOsOptions',
        selectedOs: os,
      });
    },
    [dispatch]
  );

  const setComment = useCallback(
    (comment: string): void => {
      dispatch({
        type: 'setComment',
        comment,
      });
    },
    [dispatch]
  );

  const setCommentError = useCallback(
    (errorExists: boolean): void => {
      dispatch({
        type: 'setCommentError',
        errorExists,
      });
    },
    [dispatch]
  );

  const setBulkCloseIndex = useCallback(
    (index: string[] | undefined): void => {
      dispatch({
        type: 'setBulkCloseIndex',
        bulkCloseIndex: index,
      });
    },
    [dispatch]
  );

  const setCloseSingleAlert = useCallback(
    (close: boolean): void => {
      dispatch({
        type: 'setCloseSingleAlert',
        close,
      });
    },
    [dispatch]
  );

  const setBulkCloseAlerts = useCallback(
    (bulkClose: boolean): void => {
      dispatch({
        type: 'setBulkCloseAlerts',
        bulkClose,
      });
    },
    [dispatch]
  );

  const setDisableBulkCloseAlerts = useCallback(
    (disableBulkCloseAlerts: boolean): void => {
      dispatch({
        type: 'setDisableBulkCloseAlerts',
        disableBulkCloseAlerts,
      });
    },
    [dispatch]
  );

  const setErrorSubmitting = useCallback(
    (err: Error | null): void => {
      dispatch({
        type: 'setErrorSubmitting',
        err,
      });
    },
    [dispatch]
  );

  const setExpireTime = useCallback(
    (exceptionExpireTime: Moment | undefined): void => {
      dispatch({
        type: 'setExpireTime',
        expireTime: exceptionExpireTime,
      });
    },
    [dispatch]
  );

  const setExpireError = useCallback(
    (errorExists: boolean): void => {
      dispatch({
        type: 'setExpireError',
        errorExists,
      });
    },
    [dispatch]
  );

  useEffect((): void => {
    if (alertData) {
      switch (listType) {
        case ExceptionListTypeEnum.ENDPOINT: {
          return setInitialExceptionItems(
            defaultEndpointExceptionItems(
              ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
              exceptionItemName,
              alertData
            )
          );
        }
        case ExceptionListTypeEnum.RULE_DEFAULT: {
          const populatedException = getPrepopulatedRuleExceptionWithHighlightFields({
            alertData,
            exceptionItemName,
            // With "rule_default" type, there is only ever one rule associated.
            // That is why it's ok to pull just the first item from rules array here.
            ruleCustomHighlightedFields: rules?.[0]?.investigation_fields?.field_names ?? [],
          });
          if (populatedException) {
            setComment(i18n.ADD_RULE_EXCEPTION_FROM_ALERT_COMMENT(alertData._id));
            return setInitialExceptionItems([populatedException]);
          }
        }
      }
    }
  }, [listType, exceptionItemName, alertData, rules, setInitialExceptionItems, setComment]);

  const osTypesSelection = useMemo((): OsTypeArray => {
    return hasAlertData ? retrieveAlertOsTypes(alertData) : selectedOs ? [...selectedOs] : [];
  }, [hasAlertData, alertData, selectedOs]);

  const submitException = useCallback(async (): Promise<void> => {
    if (submitNewExceptionItems == null) return;

    try {
      const { listsToAddTo, addToLists, addToRules, items } = prepareNewItemsForSubmission({
        sharedListToAddTo,
        addExceptionToRadioSelection,
        exceptionListsToAddTo,
        exceptionItemName,
        newComment,
        listType,
        osTypesSelection,
        expireTime,
        exceptionItems,
      });

      const addedItems = await submitNewExceptionItems({
        itemsToAdd: items,
        selectedRulesToAddTo,
        listType,
        addToRules: addToRules && !isEmpty(selectedRulesToAddTo),
        addToSharedLists: addToLists,
        sharedLists: listsToAddTo,
      });

      const { shouldCloseAlerts, alertIdToClose, ruleStaticIds } = prepareToCloseAlerts({
        alertData,
        closeSingleAlert,
        addToRules,
        rules,
        bulkCloseAlerts,
        selectedRulesToAddTo,
      });

      if (closeAlerts != null && shouldCloseAlerts) {
        await closeAlerts(ruleStaticIds, addedItems, alertIdToClose, bulkCloseIndex);
      }

      invalidateFetchRuleByIdQuery();
      // Rule only would have been updated if we had to create a rule default list
      // to attach to it, all shared lists would already be referenced on the rule
      onConfirm(true, closeSingleAlert, bulkCloseAlerts);
    } catch (e) {
      setErrorSubmitting(e);
    }
  }, [
    sharedListToAddTo,
    submitNewExceptionItems,
    addExceptionToRadioSelection,
    exceptionItemName,
    newComment,
    exceptionListsToAddTo,
    listType,
    osTypesSelection,
    exceptionItems,
    selectedRulesToAddTo,
    closeSingleAlert,
    alertData,
    rules,
    closeAlerts,
    bulkCloseAlerts,
    onConfirm,
    bulkCloseIndex,
    setErrorSubmitting,
    invalidateFetchRuleByIdQuery,
    expireTime,
  ]);

  const handleOnSubmit = useCallback(() => {
    if (wildcardWarningExists || malformedMatchesValueExists) {
      setShowConfirmModal(true);
    } else {
      return submitException();
    }
  }, [wildcardWarningExists, malformedMatchesValueExists, submitException]);

  const isSubmitButtonDisabled = isSubmitDisabled({
    isSubmitting,
    isClosingAlerts,
    errorSubmitting,
    exceptionItemName,
    exceptionItems,
    itemConditionValidationErrorExists,
    commentErrorExists,
    expireErrorExists,
    addExceptionToRadioSelection,
    selectedRulesToAddTo,
    listType,
    exceptionListsToAddTo,
  });

  const handleDismissError = useCallback((): void => {
    setErrorSubmitting(null);
  }, [setErrorSubmitting]);

  const handleCloseFlyout = useCallback((): void => {
    onCancel(false);
  }, [onCancel]);

  const exceptionFlyoutTitleId = useGeneratedHtmlId({
    prefix: 'exceptionFlyoutTitle',
  });

  const flyoutAriaLabel = useMemo(() => {
    return listType === ExceptionListTypeEnum.ENDPOINT
      ? headerI18n.ADD_ENDPOINT_EXCEPTION
      : headerI18n.CREATE_RULE_EXCEPTION;
  }, [listType]);

  const confirmModal = useMemo(() => {
    const labels = CONFIRM_WARNING_MODAL_LABELS(
      listType === ExceptionListTypeEnum.ENDPOINT ? ENDPOINT_EXCEPTION : RULE_EXCEPTION,
      {
        hasWildcardWithWrongOperator: wildcardWarningExists,
        hasMalformedMatchesValue: malformedMatchesFields,
      },
      links
    );

    return (
      <ArtifactConfirmModal
        labels={labels}
        onSuccess={submitException}
        onCancel={() => setShowConfirmModal(false)}
        data-test-subj="artifactConfirmModal"
      />
    );
  }, [links, listType, submitException, wildcardWarningExists, malformedMatchesFields]);

  return (
    <EuiFlyout
      size="l"
      onClose={handleCloseFlyout}
      data-test-subj="addExceptionFlyout"
      aria-label={flyoutAriaLabel}
    >
      <ExceptionFlyoutHeader
        listType={listType}
        titleId={exceptionFlyoutTitleId}
        dataTestSubjId={'exceptionFlyoutTitle'}
      />
      <FlyoutBodySection className="builder-section">
        {
          // TODO: This is a quick fix to make sure that we do not lose conditions state on refetching index patterns via `useFetchIndexPatterns`
          // which happens due to data being stale after 5 minutes (in `useFetchJobsSummaryQuery`, `useFetchModulesQuery` and `useFetchRecognizerQuery`)
          // which makes useQuery triggering data refetch.
          // To fix the issue properly, we will need to do refactoring and store conditions state in the parent component (`AddExceptionFlyout`)
          // instead of keeping it in `ExceptionsConditions` which can be removed and recreated due to fetching steps described above.
          // Refactoring ticket: https://github.com/elastic/security-team/issues/8197
        }
        {isLoading && <EuiSkeletonText data-test-subj="loadingAddExceptionFlyout" lines={4} />}
        {errorSubmitting != null && (
          <>
            <EuiCallOut
              announceOnMount
              data-test-subj="addExceptionErrorCallOut"
              title={i18n.SUBMIT_ERROR_TITLE}
              color="danger"
              iconType="warning"
            >
              <EuiText>{i18n.SUBMIT_ERROR_DISMISS_MESSAGE}</EuiText>
              <EuiSpacer size="s" />
              <EuiButton
                data-test-subj="addExceptionErrorDismissButton"
                color="danger"
                onClick={handleDismissError}
              >
                {i18n.SUBMIT_ERROR_DISMISS_BUTTON}
              </EuiButton>
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        )}
        <ExceptionsFlyoutMeta
          exceptionItemName={exceptionItemName}
          onChange={setExceptionItemMeta}
        />
        <EuiHorizontalRule />
        <ExceptionsConditions
          exceptionItemName={exceptionItemName}
          allowLargeValueLists={allowLargeValueLists}
          exceptionListItems={initialItems}
          exceptionListType={listType}
          indexPatterns={indexPatterns}
          rules={rules}
          selectedOs={selectedOs}
          showOsTypeOptions={listType === ExceptionListTypeEnum.ENDPOINT && !hasAlertData}
          isEdit={false}
          onOsChange={setSelectedOs}
          onExceptionItemAdd={setExceptionItemsToAdd}
          onSetErrorExists={setConditionsValidationError}
          getExtendedFields={getExtendedFields}
        />
        {(wildcardWarningExists ||
          malformedMatchesValueExists ||
          partialCodeSignatureWarningExists) && (
          <EuiFlexGroup direction="column" gutterSize="s">
            {wildcardWarningExists && <WildCardWithWrongOperatorCallout />}
            {malformedMatchesValueExists && <MalformedMatchesValueCallout />}
            {partialCodeSignatureWarningExists && <PartialCodeSignatureCallout />}
          </EuiFlexGroup>
        )}
        {listType !== ExceptionListTypeEnum.ENDPOINT && !sharedListToAddTo?.length && (
          <>
            <EuiHorizontalRule />
            <ExceptionsAddToRulesOrLists
              rules={rules}
              isBulkAction={isBulkAction}
              selectedRadioOption={addExceptionToRadioSelection}
              onListSelectionChange={setListsToAddExceptionTo}
              onRuleSelectionChange={setSelectedRules}
              onRadioChange={setRadioOption}
            />
          </>
        )}
        <EuiHorizontalRule />
        <ExceptionItemComments
          accordionTitle={
            <SectionHeader size="xs">
              <h3>{i18n.COMMENTS_SECTION_TITLE(newComment ? 1 : 0)}</h3>
            </SectionHeader>
          }
          initialIsOpen={!!newComment}
          newCommentValue={newComment}
          newCommentOnChange={setComment}
          setCommentError={setCommentError}
        />
        {listType !== ExceptionListTypeEnum.ENDPOINT && (
          <>
            <EuiHorizontalRule />
            <ExceptionsExpireTime
              expireTime={expireTime}
              setExpireTime={setExpireTime}
              setExpireError={setExpireError}
            />
          </>
        )}
        {hasAlertsUpdate && showAlertCloseOptions && (
          <>
            <EuiHorizontalRule />
            <ExceptionItemsFlyoutAlertsActions
              exceptionListType={listType}
              shouldCloseSingleAlert={closeSingleAlert}
              shouldBulkCloseAlert={bulkCloseAlerts}
              disableBulkClose={disableBulkClose}
              exceptionListItems={exceptionItems}
              alertData={alertData}
              alertStatus={alertStatus}
              isAlertDataLoading={isAlertDataLoading ?? false}
              onDisableBulkClose={setDisableBulkCloseAlerts}
              onUpdateBulkCloseIndex={setBulkCloseIndex}
              onBulkCloseCheckboxChange={setBulkCloseAlerts}
              onSingleAlertCloseCheckboxChange={setCloseSingleAlert}
            />
          </>
        )}
      </FlyoutBodySection>
      <ExceptionFlyoutFooter
        listType={listType}
        isSubmitButtonDisabled={isSubmitButtonDisabled}
        cancelButtonDataTestSubjId={'cancelExceptionAddButton'}
        submitButtonDataTestSubjId={'addExceptionConfirmButton'}
        handleOnSubmit={handleOnSubmit}
        handleCloseFlyout={handleCloseFlyout}
      />
      {showConfirmModal && confirmModal}
    </EuiFlyout>
  );
});
