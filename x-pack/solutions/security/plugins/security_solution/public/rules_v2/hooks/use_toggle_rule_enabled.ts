/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import { useKibana } from '../../common/lib/kibana';

export const useToggleRuleEnabled = () => {
  const { http, notifications } = useKibana().services;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      http.patch(`${ALERTING_V2_RULE_API_PATH}/${encodeURIComponent(id)}`, {
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (_data, variables) => {
      notifications.toasts.addSuccess(
        variables.enabled
          ? i18n.translate('xpack.securitySolution.rulesV2.toggleEnabled.enabledMessage', {
              defaultMessage: 'Rule enabled',
            })
          : i18n.translate('xpack.securitySolution.rulesV2.toggleEnabled.disabledMessage', {
              defaultMessage: 'Rule disabled',
            })
      );
      queryClient.invalidateQueries({ queryKey: ['rulesV2List'] });
    },
    onError: () => {
      notifications.toasts.addDanger(
        i18n.translate('xpack.securitySolution.rulesV2.toggleEnabled.errorMessage', {
          defaultMessage: 'Failed to update rule status',
        })
      );
    },
  });
};
