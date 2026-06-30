/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  CreateExceptionListItemSchema,
  CreateRuleExceptionListItemSchema,
  ExceptionListItemSchema,
  ExceptionListSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  createExceptionListItemSchema,
  exceptionListItemSchema,
  ExceptionListTypeEnum,
  createRuleExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import type { ExceptionsBuilderReturnExceptionItem } from '@kbn/securitysolution-list-utils';

import * as i18n from './translations';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import type { Rule } from '../../../rule_management/logic/types';
import { useCreateOrUpdateException } from '../../logic/use_create_update_exception';
import { useAddRuleDefaultException } from '../../logic/use_add_rule_exception';
import { useAddV2RuleDefaultException } from '../../logic/use_add_v2_rule_exception';
import { isV2AdaptedRule } from '../../../../rules_v2/utils/v2_rule_to_v1_shape';
import { getSuccessToastText, getSuccessToastTitle } from './helpers';

export interface AddNewExceptionItemHookProps {
  itemsToAdd: ExceptionsBuilderReturnExceptionItem[];
  listType: ExceptionListTypeEnum;
  selectedRulesToAddTo: Rule[];
  addToSharedLists: boolean;
  addToRules: boolean;
  sharedLists: ExceptionListSchema[];
}

export type AddNewExceptionItemHookFuncProps = (
  arg: AddNewExceptionItemHookProps
) => Promise<ExceptionListItemSchema[]>;

export type ReturnUseAddNewExceptionItems = [boolean, AddNewExceptionItemHookFuncProps | null];

/**
 * Hook for adding new exception items from flyout
 *
 */
export const useAddNewExceptionItems = (): ReturnUseAddNewExceptionItems => {
  const { addSuccess, addError, addWarning } = useAppToasts();
  const [isAddRuleExceptionLoading, addRuleExceptions] = useAddRuleDefaultException();
  const [isAddV2RuleExceptionLoading, addV2RuleExceptions] = useAddV2RuleDefaultException();
  const [isAddingExceptions, addSharedExceptions] = useCreateOrUpdateException();

  const [isLoading, setIsLoading] = useState(false);
  const addNewExceptionsRef = useRef<AddNewExceptionItemHookFuncProps | null>(null);

  const areRuleDefaultItems = useCallback(
    (
      items: ExceptionsBuilderReturnExceptionItem[]
    ): items is CreateRuleExceptionListItemSchema[] => {
      return items.every((item) => createRuleExceptionListItemSchema.is(item));
    },
    []
  );

  const areSharedListItems = useCallback(
    (
      items: ExceptionsBuilderReturnExceptionItem[]
    ): items is Array<ExceptionListItemSchema | CreateExceptionListItemSchema> => {
      return items.every(
        (item) => exceptionListItemSchema.is(item) || createExceptionListItemSchema.is(item)
      );
    },
    []
  );

  useEffect(() => {
    const abortCtrl = new AbortController();

    const addNewExceptions = async ({
      itemsToAdd,
      listType,
      selectedRulesToAddTo,
      addToRules,
      addToSharedLists,
      sharedLists,
    }: AddNewExceptionItemHookProps): Promise<ExceptionListItemSchema[]> => {
      try {
        let result: ExceptionListItemSchema[] = [];
        setIsLoading(true);

        if (
          addToRules &&
          listType !== ExceptionListTypeEnum.ENDPOINT &&
          areRuleDefaultItems(itemsToAdd)
        ) {
          const v2Rules = selectedRulesToAddTo.filter(isV2AdaptedRule);
          const v1Rules = selectedRulesToAddTo.filter((r) => !isV2AdaptedRule(r));

          if (v2Rules.length > 0 && addV2RuleExceptions != null) {
            const v2Result = await addV2RuleExceptions(itemsToAdd, v2Rules);
            result.push(...v2Result);
          }

          if (v1Rules.length > 0 && addRuleExceptions != null) {
            const v1Result = await addRuleExceptions(itemsToAdd, v1Rules);
            result.push(...v1Result);
          }

          const ruleNames = selectedRulesToAddTo.map(({ name }) => name).join(', ');

          addSuccess({
            title: i18n.ADD_RULE_EXCEPTION_SUCCESS_TITLE,
            text: i18n.ADD_RULE_EXCEPTION_SUCCESS_TEXT(ruleNames),
          });
        } else if (
          (listType === ExceptionListTypeEnum.ENDPOINT || addToSharedLists) &&
          addSharedExceptions != null &&
          areSharedListItems(itemsToAdd)
        ) {
          result = await addSharedExceptions(itemsToAdd);

          const sharedListNames = sharedLists.map(({ name }) => name);
          const title = getSuccessToastTitle(listType);
          const text = getSuccessToastText(listType, sharedListNames);

          addSuccess({
            title,
            text,
          });
        }

        setIsLoading(false);

        return result;
      } catch (e) {
        setIsLoading(false);
        addError(e, { title: i18n.SUBMIT_ERROR_TITLE });
        throw e;
      }
    };

    addNewExceptionsRef.current = addNewExceptions;
    return (): void => {
      abortCtrl.abort();
    };
  }, [
    addSuccess,
    addError,
    addWarning,
    addRuleExceptions,
    addV2RuleExceptions,
    addSharedExceptions,
    areRuleDefaultItems,
    areSharedListItems,
  ]);

  return [
    isLoading || isAddingExceptions || isAddRuleExceptionLoading || isAddV2RuleExceptionLoading,
    addNewExceptionsRef.current,
  ];
};
