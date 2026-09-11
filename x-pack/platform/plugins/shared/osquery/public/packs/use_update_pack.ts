/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseMutationOptions } from '@kbn/react-query';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';

import { API_VERSIONS } from '../../common/constants';
import { useKibana } from '../common/lib/kibana';
import { PLUGIN_ID } from '../../common';
import { pagePathGetters } from '../common/page_paths';
import { PACKS_ID } from './constants';
import { useErrorToast } from '../common/hooks/use_error_toast';
import { showTargetingWarningToast } from './targeting_warning_toast';
import type { PackSavedObject } from './types';

interface UseUpdatePackProps {
  withRedirect?: boolean;
  options?: UseMutationOptions<
    { data: PackSavedObject },
    { body: { message: string; error: string } },
    Partial<PackSavedObject> & { id: string }
  >;
}

export const useUpdatePack = ({ withRedirect, options }: UseUpdatePackProps) => {
  const queryClient = useQueryClient();
  const {
    application: { navigateToApp },
    http,
    notifications: { toasts },
  } = useKibana().services;
  const setErrorToast = useErrorToast();

  return useMutation<
    { data: PackSavedObject },
    { body: { message: string; error: string } },
    Partial<PackSavedObject> & { id: string }
  >(
    ({ id, ...payload }) =>
      http.put(`/api/osquery/packs/${id}`, {
        version: API_VERSIONS.public.v1,
        body: JSON.stringify(payload),
      }),
    {
      onError: (error) => {
        setErrorToast(error, { title: error?.body?.error, toastMessage: error?.body?.message });
      },
      onSuccess: (response, { id }) => {
        queryClient.invalidateQueries([PACKS_ID]);
        // Also the single pack: usePack keeps previous data, so the edit page
        // would otherwise show pre-update queries until a hard reload.
        queryClient.invalidateQueries(['pack', { packId: id }]);
        if (withRedirect) {
          navigateToApp(PLUGIN_ID, { path: pagePathGetters.packs() });
        }

        toasts.addSuccess(
          i18n.translate('xpack.osquery.updatePack.successToastMessageText', {
            defaultMessage: 'Successfully updated "{packName}" pack',
            values: {
              packName: response?.data?.name ?? '',
            },
          })
        );

        showTargetingWarningToast(toasts, response?.data?.targeting_warning);
      },
      ...options,
    }
  );
};
