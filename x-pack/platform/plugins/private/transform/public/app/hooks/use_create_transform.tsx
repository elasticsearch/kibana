/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';

import type {
  PutTransformsRequestSchema,
  PutTransformsResponseSchema,
} from '../../../server/routes/api_schemas/transforms';
import { addInternalBasePath } from '../../../common/constants';
import type { TransformId } from '../../../common/types/transform';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { useToastNotificationText } from '../components';

import { useRefreshTransformList } from './use_refresh_transform_list';

interface CreateTransformArgs {
  transformId: TransformId;
  transformConfig: PutTransformsRequestSchema;
  createDataView: boolean;
  timeFieldName?: string;
  deferValidation?: boolean;
}

export const useCreateTransform = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  function errorToast(error: unknown, { transformId }: CreateTransformArgs) {
    toastNotifications.addDanger({
      title: i18n.translate('xpack.transform.stepCreateForm.createTransformErrorMessage', {
        defaultMessage: 'An error occurred creating the transform {transformId}:',
        values: { transformId },
      }),
      ...getToastNotificationText(getErrorMessage(error)),
    });
  }

  const mutation = useMutation({
    mutationFn: ({
      transformId,
      transformConfig,
      createDataView = false,
      timeFieldName,
      deferValidation,
    }: CreateTransformArgs) => {
      return http.put<PutTransformsResponseSchema>(
        addInternalBasePath(`transforms/${transformId}`),
        {
          query: { createDataView, timeFieldName, deferValidation },
          body: JSON.stringify(transformConfig),
          version: '1',
        }
      );
    },
    onError: errorToast,
    onSuccess: (resp, options) => {
      if (resp.errors.length > 0) {
        errorToast(resp.errors.length === 1 ? resp.errors[0] : resp.errors, options);
      }

      refreshTransformList();
    },
  });

  return mutation.mutate;
};
