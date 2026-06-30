/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { CreateRuleData, RuleResponse } from '@kbn/alerting-v2-schemas';
import { useKibana } from '../../common/lib/kibana';
import type { Rule } from '../../detection_engine/rule_management/logic/types';
import {
  BulkActionTypeEnum,
  BulkActionEditTypeEnum,
} from '../../../common/api/detection_engine/rule_management';
import { useExecuteBulkAction } from '../../detection_engine/rule_management/logic/bulk_actions/use_execute_bulk_action';

interface ConvertResult {
  v2RuleId: string;
}

interface CreateV2MutationArgs {
  rule: Rule;
  prebuiltPayload: CreateRuleData | null;
}

export const useConvertToV2 = () => {
  const { http, notifications } = useKibana().services;
  const queryClient = useQueryClient();
  const { executeBulkAction } = useExecuteBulkAction({ suppressSuccessToast: true });
  const [isConverting, setIsConverting] = useState(false);

  const createV2Mutation = useMutation({
    mutationFn: async ({ prebuiltPayload }: CreateV2MutationArgs): Promise<RuleResponse> => {
      if (!prebuiltPayload) {
        throw new Error('No v2 payload available. Build the payload before converting.');
      }

      const created = await http.post<RuleResponse>(ALERTING_V2_RULE_API_PATH, {
        body: JSON.stringify(prebuiltPayload),
      });

      await http.patch<RuleResponse>(`${ALERTING_V2_RULE_API_PATH}/${created.id}`, {
        body: JSON.stringify({ enabled: false }),
      });

      return { ...created, enabled: false };
    },
  });

  const convertRule = useCallback(
    async (
      rule: Rule,
      disableOriginal: boolean,
      prebuiltPayload: CreateRuleData | null
    ): Promise<ConvertResult | null> => {
      if (isConverting) {
        return null;
      }

      setIsConverting(true);
      try {
        const v2Rule = await createV2Mutation.mutateAsync({ rule, prebuiltPayload });

        if (disableOriginal) {
          await executeBulkAction({
            type: BulkActionTypeEnum.disable,
            ids: [rule.id],
          });
        }

        await executeBulkAction({
          type: BulkActionTypeEnum.edit,
          ids: [rule.id],
          editPayload: [{ type: BulkActionEditTypeEnum.add_tags, value: ['migrated_to_v2'] }],
        });

        queryClient.invalidateQueries({ queryKey: ['v2RulesSectionList'] });

        notifications.toasts.addSuccess({
          title: i18n.translate('xpack.securitySolution.ruleManagement.convertToV2.successTitle', {
            defaultMessage: 'Rule "{name}" converted to v2',
            values: { name: rule.name },
          }),
          text: disableOriginal
            ? i18n.translate(
                'xpack.securitySolution.ruleManagement.convertToV2.successTextWithDisable',
                {
                  defaultMessage:
                    'A new v2 rule was created (disabled), the original rule was disabled and tagged.',
                }
              )
            : i18n.translate('xpack.securitySolution.ruleManagement.convertToV2.successText', {
                defaultMessage:
                  'A new v2 rule was created (disabled) and the original rule was tagged.',
              }),
        });

        return { v2RuleId: v2Rule.id };
      } catch (error) {
        notifications.toasts.addDanger(
          i18n.translate('xpack.securitySolution.ruleManagement.convertToV2.errorMessage', {
            defaultMessage: 'Failed to convert rule "{name}" to v2: {error}',
            values: {
              name: rule.name,
              error: error instanceof Error ? error.message : String(error),
            },
          })
        );
        return null;
      } finally {
        setIsConverting(false);
      }
    },
    [isConverting, createV2Mutation, executeBulkAction, queryClient, notifications.toasts]
  );

  return {
    convertRule,
    isConverting,
  };
};
