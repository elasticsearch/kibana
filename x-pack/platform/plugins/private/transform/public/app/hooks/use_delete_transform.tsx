/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';
import { extractErrorMessage } from '@kbn/ml-error-utils';

import type {
  DeleteTransformsRequestSchema,
  DeleteTransformsResponseSchema,
} from '../../../server/routes/api_schemas/delete_transforms';
import { addInternalBasePath } from '../../../common/constants';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { type TransformListRow } from '../common';
import { useToastNotificationText } from '../components';

import { useTransformCapabilities } from './use_transform_capabilities';
import { useDataViewExists } from './use_data_view_exists';
import { useRefreshTransformList } from './use_refresh_transform_list';

export const useDeleteIndexAndTargetIndex = (items: TransformListRow[]) => {
  const {
    application: { capabilities },
  } = useAppDependencies();
  const toastNotifications = useToastNotifications();
  const { canDeleteIndex: userCanDeleteIndex } = useTransformCapabilities();

  const userCanDeleteDataView =
    capabilities.savedObjectsManagement?.delete === true ||
    capabilities.indexPatterns?.save === true;

  const [deleteDestIndex, setDeleteDestIndex] = useState<boolean>(true);
  const [deleteDataView, setDeleteDataView] = useState<boolean>(userCanDeleteDataView);

  const toggleDeleteIndex = useCallback(
    () => setDeleteDestIndex(!deleteDestIndex),
    [deleteDestIndex]
  );
  const toggleDeleteDataView = useCallback(
    () => setDeleteDataView(!deleteDataView),
    [deleteDataView]
  );

  const { error: dataViewExistsError, data: dataViewExists = items.length !== 1 } =
    useDataViewExists(items);

  useEffect(() => {
    if (dataViewExistsError !== null && items.length === 1) {
      const config = items[0].config;
      const indexName = config.dest.index;

      toastNotifications.addDanger(
        i18n.translate(
          'xpack.transform.deleteTransform.errorWithCheckingIfDataViewExistsNotificationErrorMessage',
          {
            defaultMessage: 'An error occurred checking if data view {dataView} exists: {error}',
            values: {
              dataView: indexName,
              error: extractErrorMessage(dataViewExistsError),
            },
          }
        )
      );
    }
    // custom comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataViewExistsError]);

  return {
    userCanDeleteIndex,
    userCanDeleteDataView,
    deleteDestIndex,
    dataViewExists,
    deleteDataView,
    toggleDeleteIndex,
    toggleDeleteDataView,
  };
};

export const useDeleteTransforms = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const mutation = useMutation({
    mutationFn: (reqBody: DeleteTransformsRequestSchema) =>
      http.post<DeleteTransformsResponseSchema>(addInternalBasePath('delete_transforms'), {
        body: JSON.stringify(reqBody),
        version: '1',
      }),
    onError: (error) =>
      toastNotifications.addDanger({
        title: i18n.translate('xpack.transform.transformList.deleteTransformGenericErrorMessage', {
          defaultMessage: 'An error occurred calling the API endpoint to delete transforms.',
        }),
        ...getToastNotificationText(getErrorMessage(error), 50),
      }),
    onSuccess: (results) => {
      for (const transformId in results) {
        // hasOwnProperty check to ensure only properties on object itself, and not its prototypes
        if (Object.hasOwn(results, transformId)) {
          const status = results[transformId];
          const destinationIndex = status.destinationIndex;

          if (status.transformDeleted?.error) {
            const error = status.transformDeleted.error.reason;
            toastNotifications.addDanger({
              title: i18n.translate('xpack.transform.transformList.deleteTransformErrorMessage', {
                defaultMessage: 'An error occurred deleting the transform {transformId}',
                values: { transformId },
              }),
              ...getToastNotificationText(error, 50),
            });
          }

          if (status.destIndexDeleted?.error) {
            const error = status.destIndexDeleted.error.reason;
            toastNotifications.addDanger({
              title: i18n.translate(
                'xpack.transform.deleteTransform.deleteAnalyticsWithIndexErrorMessage',
                {
                  defaultMessage: 'An error occurred deleting destination index {destinationIndex}',
                  values: { destinationIndex },
                }
              ),
              ...getToastNotificationText(error, 50),
            });
          }

          if (status.destDataViewDeleted?.error) {
            const error = extractErrorMessage(status.destDataViewDeleted.error);
            toastNotifications.addDanger({
              title: i18n.translate(
                'xpack.transform.deleteTransform.deleteAnalyticsWithDataViewErrorMessage',
                {
                  defaultMessage: 'An error occurred deleting data view {destinationIndex}',
                  values: { destinationIndex },
                }
              ),
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
