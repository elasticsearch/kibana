/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateRuleExceptionListItemSchema,
  ExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import {
  addExceptionList,
  addExceptionListItem,
} from '@kbn/securitysolution-list-api';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { RuleResponse as V2RuleResponse, ExceptionListReference } from '@kbn/alerting-v2-schemas';

import { useKibana } from '../../../common/lib/kibana';
import type { Rule } from '../../rule_management/logic/types';
import { isV2AdaptedRule } from '../../../rules_v2/utils/v2_rule_to_v1_shape';

export type AddV2RuleExceptionsFunc = (
  exceptions: CreateRuleExceptionListItemSchema[],
  rules: Rule[]
) => Promise<ExceptionListItemSchema[]>;

export type ReturnUseAddV2RuleException = [boolean, AddV2RuleExceptionsFunc | null];

/**
 * Hook for adding exception items to a v2 (RNA) rule's default exception list.
 *
 * Unlike the v1 hook (useAddRuleDefaultException), this does NOT call
 * POST /api/detection_engine/rules/{id}/exceptions. Instead it:
 *   1. Creates a rule_default exception list via the Lists plugin API (if needed)
 *   2. Creates exception items via the Lists plugin API
 *   3. Updates the v2 rule's `exceptions` field via PATCH /api/alerting_v2/rules/{id}
 */
export const useAddV2RuleDefaultException = (): ReturnUseAddV2RuleException => {
  const {
    services: { http },
  } = useKibana();
  const [isLoading, setIsLoading] = useState(false);
  const addExceptionFunc = useRef<AddV2RuleExceptionsFunc | null>(null);

  useEffect(() => {
    const abortCtrl = new AbortController();

    const addExceptionItemsToV2Rule: AddV2RuleExceptionsFunc = async (
      exceptions,
      rules
    ): Promise<ExceptionListItemSchema[]> => {
      try {
        setIsLoading(true);

        const allCreatedItems: ExceptionListItemSchema[] = [];

        for (const rule of rules) {
          if (!isV2AdaptedRule(rule)) {
            continue;
          }

          const existingExceptions: ExceptionListReference[] = rule._v2Exceptions;

          const existingDefault = existingExceptions.find(
            (ref) => ref.type === 'rule_default'
          );

          let defaultListId: string;
          let defaultListSoId: string;

          if (existingDefault) {
            defaultListId = existingDefault.list_id;
            defaultListSoId = existingDefault.id;
          } else {
            const newListId = uuidv4();
            const createdList = await addExceptionList({
              http,
              list: {
                name: `${rule.name} Exception List`,
                description: `Default exception list for rule: ${rule.name}`,
                list_id: newListId,
                type: ExceptionListTypeEnum.RULE_DEFAULT,
                namespace_type: 'single',
                tags: [],
              },
              signal: abortCtrl.signal,
            });

            defaultListId = createdList.list_id;
            defaultListSoId = createdList.id;
          }

          const createdItems = await Promise.all(
            exceptions.map((item) =>
              addExceptionListItem({
                http,
                listItem: {
                  ...item,
                  list_id: defaultListId,
                  namespace_type: 'single',
                },
                signal: abortCtrl.signal,
              })
            )
          );

          allCreatedItems.push(...createdItems);

          const newRef: ExceptionListReference = {
            id: defaultListSoId,
            list_id: defaultListId,
            type: 'rule_default',
            namespace_type: 'single',
          };

          const updatedExceptions = existingDefault
            ? existingExceptions
            : [...existingExceptions, newRef];

          await http.patch<V2RuleResponse>(`${ALERTING_V2_RULE_API_PATH}/${rule.id}`, {
            body: JSON.stringify({ exceptions: updatedExceptions }),
          });
        }

        setIsLoading(false);
        return allCreatedItems;
      } catch (e) {
        setIsLoading(false);
        throw e;
      }
    };

    addExceptionFunc.current = addExceptionItemsToV2Rule;
    return (): void => {
      setIsLoading(false);
      abortCtrl.abort();
    };
  }, [http]);

  return [isLoading, addExceptionFunc.current];
};
