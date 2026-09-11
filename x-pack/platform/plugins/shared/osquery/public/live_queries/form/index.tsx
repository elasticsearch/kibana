/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ECSMapping } from '@kbn/osquery-io-ts-types';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useForm as useHookForm, FormProvider } from 'react-hook-form';
import { isEmpty, find, pickBy, isNumber } from 'lodash';

import { QUERY_TIMEOUT } from '../../../common/constants';
import {
  containsDynamicQuery,
  replaceParamsQuery,
} from '../../../common/utils/replace_params_query';
import { QueryPackSelectable } from './query_pack_selectable';
import { useKibana } from '../../common/lib/kibana';
import { usePacks } from '../../packs/use_packs';
import { useCreateLiveQuery } from '../use_create_live_query_action';
import { useLiveQueryDetails } from '../../actions/use_live_query_details';
import type { AgentSelection } from '../../agents/types';
import type { AddToTimelineHandler } from '../../types';
import LiveQueryQueryField from './live_query_query_field';
import { AgentsTableField } from './agents_table_field';
import { PackFieldWrapper } from '../../shared_components/osquery_response_action_type/pack_field_wrapper';
import { AlertAttachmentContext } from '../../common/contexts';
import { PackQueriesStatusTable } from './pack_queries_status_table';

export interface LiveQueryFormFields {
  alertIds?: string[];
  query?: string;
  agentSelection: AgentSelection;
  savedQueryId?: string | null;
  ecs_mapping: ECSMapping;
  packId: string[];
  timeout?: number;
  queryType: 'query' | 'pack';
}

interface DefaultLiveQueryFormFields {
  query?: string;
  agentSelection?: AgentSelection;
  alertIds?: string[];
  savedQueryId?: string | null;
  ecs_mapping?: ECSMapping;
  packId?: string;
  timeout?: number;
}

type FormType = 'simple' | 'steps';

interface LiveQueryFormProps {
  defaultValue?: DefaultLiveQueryFormFields;
  onSuccess?: (actionId: string) => void;
  redirectsOnSuccess?: boolean;
  queryField?: boolean;
  ecsMappingField?: boolean;
  formType?: FormType;
  enabled?: boolean;
  hideAgentsField?: boolean;
  addToTimeline?: AddToTimelineHandler;
}

const LiveQueryFormComponent: React.FC<LiveQueryFormProps> = ({
  defaultValue,
  onSuccess,
  redirectsOnSuccess,
  queryField = true,
  formType = 'steps',
  enabled = true,
  hideAgentsField = false,
  addToTimeline,
}) => {
  const alertAttachmentContext = useContext(AlertAttachmentContext);

  const { application } = useKibana().services;
  const permissions = application.capabilities.osquery;
  const canRunPacks = useMemo(
    () =>
      !!((permissions.runSavedQueries || permissions.writeLiveQueries) && permissions.readPacks),
    [permissions]
  );

  const hooksForm = useHookForm<LiveQueryFormFields>();
  const { handleSubmit, watch, setValue, resetField, clearErrors, register } = hooksForm;

  const canRunSingleQuery = useMemo(
    () =>
      !!(
        permissions.writeLiveQueries ||
        (permissions.runSavedQueries && permissions.readSavedQueries)
      ),
    [permissions]
  );

  const [isLive, setIsLive] = useState(false);

  const watchedValues = watch();

  const { queryType } = watchedValues;
  const {
    data,
    isLoading,
    mutateAsync,
    reset: cleanupLiveQuery,
  } = useCreateLiveQuery({ onSuccess });

  const { data: liveQueryDetails } = useLiveQueryDetails({
    actionId: data?.action_id,
    isLive,
  });

  useEffect(() => {
    register('savedQueryId');
    register('alertIds');
  }, [register]);

  const onSubmit = useCallback(
    async (values: LiveQueryFormFields) => {
      // Temporary, frontend solution for params substitution. To be removed once alert_ids refactored in create_live_query_route
      const query =
        values.query && containsDynamicQuery(values.query) && alertAttachmentContext
          ? replaceParamsQuery(values.query, alertAttachmentContext).result
          : values.query;

      const serializedData = {
        ...pickBy(
          {
            agentSelection: values.agentSelection,
            // Single-query fields must not ride along in pack mode. `defaultValue` suppresses
            // the reset effect below, so a saved query picked before switching to Pack would
            // otherwise still be posted and get compared against the pack's queries server-side.
            saved_query_id: queryType === 'query' ? values.savedQueryId : undefined,
            query: queryType === 'query' ? query : undefined,
            alert_ids: values.alertIds,
            pack_id: queryType === 'pack' && values?.packId?.length ? values?.packId[0] : undefined,
            ecs_mapping: queryType === 'query' ? values.ecs_mapping : undefined,
            ...(queryType === 'query' ? { timeout: values.timeout } : {}),
          },
          (value) => !isEmpty(value) || isNumber(value)
        ),
      } as unknown as LiveQueryFormFields;
      await mutateAsync(serializedData);
    },
    [alertAttachmentContext, mutateAsync, queryType]
  );

  const { data: packsData, isFetched: isPackDataFetched } = usePacks({});

  const submitButtonContent = useMemo(
    () => (
      <EuiFlexItem>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButton
              id="submit-button"
              disabled={!enabled}
              isLoading={isLoading}
              onClick={handleSubmit(onSubmit)}
            >
              <FormattedMessage
                id="xpack.osquery.liveQueryForm.form.submitButtonLabel"
                defaultMessage="Submit"
              />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ),
    [enabled, isLoading, handleSubmit, onSubmit]
  );

  const liveQueryActionId = useMemo(() => liveQueryDetails?.action_id, [liveQueryDetails]);

  useEffect(() => {
    if (defaultValue) {
      if (defaultValue.agentSelection) {
        setValue('agentSelection', defaultValue.agentSelection);
      }

      if (defaultValue.alertIds?.length) {
        setValue('alertIds', defaultValue.alertIds);
      }

      if (defaultValue.packId && canRunPacks) {
        setValue('queryType', 'pack');

        if (!isPackDataFetched) return;
        const selectedPackOption = find(packsData?.data, ['saved_object_id', defaultValue.packId]);
        if (selectedPackOption) {
          setValue('packId', [defaultValue.packId]);
        }

        return;
      }

      if (defaultValue.query && canRunSingleQuery) {
        setValue('query', defaultValue.query);
        setValue('savedQueryId', defaultValue.savedQueryId);
        setValue('ecs_mapping', defaultValue.ecs_mapping ?? {});
        setValue('timeout', defaultValue.timeout ?? QUERY_TIMEOUT.DEFAULT);

        return;
      }

      if (canRunSingleQuery) {
        return setValue('queryType', 'query');
      }

      if (canRunPacks) {
        return setValue('queryType', 'pack');
      }
    }
  }, [canRunPacks, canRunSingleQuery, defaultValue, isPackDataFetched, packsData?.data, setValue]);

  useEffect(() => {
    setIsLive(() => !(liveQueryDetails?.status === 'completed'));
  }, [liveQueryDetails?.status]);

  useEffect(() => {
    cleanupLiveQuery();
    if (!defaultValue) {
      resetField('packId');
      resetField('query');
      resetField('ecs_mapping');
      resetField('savedQueryId');
      resetField('alertIds');
      clearErrors();
    }
  }, [queryType, cleanupLiveQuery, resetField, setValue, clearErrors, defaultValue]);

  const groupStyles = useMemo(() => ({ gap: 16 }), []);

  return (
    <>
      <FormProvider {...hooksForm}>
        <EuiFlexGroup direction="column" css={groupStyles}>
          {queryField && (
            <QueryPackSelectable canRunPacks={canRunPacks} canRunSingleQuery={canRunSingleQuery} />
          )}
          {!hideAgentsField && (
            <EuiFlexItem>
              <AgentsTableField />
            </EuiFlexItem>
          )}
          {queryType === 'pack' ? (
            <PackFieldWrapper
              liveQueryDetails={liveQueryDetails}
              submitButtonContent={submitButtonContent}
              showResultsHeader
              addToTimeline={addToTimeline}
            />
          ) : (
            <>
              <EuiFlexItem>
                <LiveQueryQueryField handleSubmitForm={handleSubmit(onSubmit)} />
              </EuiFlexItem>
              {submitButtonContent}
              {data?.action_id && !redirectsOnSuccess ? (
                <EuiFlexItem>
                  <PackQueriesStatusTable
                    actionId={liveQueryActionId}
                    data={liveQueryDetails?.queries}
                    startDate={liveQueryDetails?.['@timestamp']}
                    expirationDate={liveQueryDetails?.expiration}
                    agentIds={liveQueryDetails?.agents}
                    showResultsHeader
                    tags={liveQueryDetails?.tags}
                    addToTimeline={addToTimeline}
                  />
                </EuiFlexItem>
              ) : null}
            </>
          )}
        </EuiFlexGroup>
      </FormProvider>
    </>
  );
};

export const LiveQueryForm = React.memo(LiveQueryFormComponent);
