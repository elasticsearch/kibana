/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';

import type {
  ResetTransformsRequestSchema,
  ResetTransformsResponseSchema,
} from '../../../server/routes/api_schemas/reset_transforms';
import { addInternalBasePath } from '../../../common/constants';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { useToastNotificationText } from '../components';

import { useRefreshTransformList } from './use_refresh_transform_list';

export const useResetTransforms = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const mutation = useMutation({
    mutationFn: (reqBody: ResetTransformsRequestSchema) =>
      http.post<ResetTransformsResponseSchema>(addInternalBasePath('reset_transforms'), {
        body: JSON.stringify(reqBody),
        version: '1',
      }),
    onError: (error) =>
      toastNotifications.addDanger({
        title: i18n.translate('xpack.transform.transformList.resetTransformGenericErrorMessage', {
          defaultMessage: 'An error occurred calling the API endpoint to reset transforms.',
        }),
        ...getToastNotificationText(getErrorMessage(error), 50),
      }),
    onSuccess: (results) => {
      for (const transformId in results) {
        // hasOwnProperty check to ensure only properties on object itself, and not its prototypes
        if (Object.hasOwn(results, transformId)) {
          const status = results[transformId];

          if (status.transformReset?.error) {
            const error = status.transformReset.error.reason;
            toastNotifications.addDanger({
              title: i18n.translate('xpack.transform.transformList.resetTransformErrorMessage', {
                defaultMessage: 'An error occurred resetting the transform {transformId}',
                values: { transformId },
              }),
              ...getToastNotificationText(error, 50),
            });
          }
        }
      }

      refreshTransformList();
    },
  });

  return mutation.mutate;
};
