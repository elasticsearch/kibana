/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFormRow, EuiSpacer } from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';
import { appendStatsByToQuery, getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { AggregateQuery } from '@kbn/es-query';
import useEffectOnce from 'react-use/lib/useEffectOnce';
import { ESQLLangEditor } from '@kbn/esql/public';

import type { ESQLColumn } from '@kbn/es-types';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { apiCanAddNewPanel, apiCanPinPanels } from '@kbn/presentation-publishing';
import { DEFAULT_ESQL_OPTIONS_LIST_STATE, ESQL_CONTROL } from '@kbn/controls-constants';
import { ESQLValuesPreview } from '@kbn/control-editors-shared-ui';
import { dataService } from '../../../services/kibana_services';
import { getESQLSingleColumnValues } from '../../../../common/options_list';
import { getControlsTimezone } from '../../utils';
import type { DataControlEditorState } from './types';
import { getDataViewIdFromESQLQuery } from '../../utils/get_data_view_id_from_esql_query';
import { ValuesPreviewHeader } from './values_preview_header';

interface ConfigureValuesQueryProps {
  editorState: Partial<DataControlEditorState>;
  updateEditorState: (s: Partial<DataControlEditorState>) => void;
  setESQLQueryValidation: (status: boolean) => void;
  isEdit: boolean;
  esqlVariables?: ESQLControlVariable[];
  parentApi?: unknown;
  // Re-opens the parent data control editor flyout. Used after the inner ESQL variable
  // control creation flyout closes
  reopenEditor?: (overrides?: Partial<DataControlEditorState>) => void;
}

export const ConfigureValuesQuery = ({
  editorState,
  updateEditorState,
  setESQLQueryValidation,
  isEdit,
  esqlVariables = [],
  parentApi,
  reopenEditor,
}: ConfigureValuesQueryProps) => {
  const [previewOptions, setPreviewOptions] = useState<string[] | number[]>([]);
  const [previewColumns, setPreviewColumns] = useState<ESQLColumn[]>([]);
  const [previewError, setPreviewError] = useState<Error | undefined>();

  const [isPreviewQueryRunning, setIsPreviewQueryRunning] = useState<boolean>(isEdit);

  const updatePreviewOptionsAndColumns = useCallback(
    (nextOptions: string[] | number[], nextColumns: ESQLColumn[]) => {
      setPreviewOptions(nextOptions);
      setPreviewColumns(nextColumns);
    },
    []
  );

  const submitESQLQuery = useCallback(
    async (query: string) => {
      setIsPreviewQueryRunning(true);
      const result = await getESQLSingleColumnValues({
        query,
        search: dataService.search.search,
        esqlVariables,
        timeRange: dataService.query.timefilter.timefilter.getTime(),
        timezone: getControlsTimezone(),
      });

      setIsPreviewQueryRunning(false);
      const isSuccess = getESQLSingleColumnValues.isSuccess(result);
      const isMultiColumnError = getESQLSingleColumnValues.isMultiColumnError(result);
      const hasNoResults = getESQLSingleColumnValues.hasNoResults(result);

      if (!isSuccess && !isMultiColumnError) {
        setPreviewError(result.errors[0]);
        setESQLQueryValidation(false);
        return;
      } else {
        setPreviewError(undefined);
      }

      if (isSuccess) {
        updatePreviewOptionsAndColumns(result.values, [result.column]);
        setESQLQueryValidation(!hasNoResults);

        updateEditorState({
          esql_query: query,
          field_name: result.column.name,
          data_view_id: await getDataViewIdFromESQLQuery(query),
        });
      } else {
        updatePreviewOptionsAndColumns([], result.columns);
        setESQLQueryValidation(false);
      }
    },
    [esqlVariables, setESQLQueryValidation, updatePreviewOptionsAndColumns, updateEditorState]
  );

  // For edit mode, initialize the values preview
  useEffectOnce(() => {
    if (isEdit && editorState.esql_query) submitESQLQuery(editorState.esql_query);
  });

  const onESQLQueryChange = useCallback(
    (q: AggregateQuery) => {
      updateEditorState({ esql_query: q.esql });
      setPreviewError(undefined);
      setESQLQueryValidation(false);
    },
    [updateEditorState, setESQLQueryValidation]
  );

  const appendColumnToESQLQuery = useCallback(
    (column: string) => {
      const updatedQuery = appendStatsByToQuery(editorState.esql_query ?? '', column);
      updateEditorState({ esql_query: updatedQuery });
      submitESQLQuery(updatedQuery);
    },
    [editorState, updateEditorState, submitESQLQuery]
  );

  const onTextLangQuerySubmit = useCallback(
    (q?: AggregateQuery) => (q ? submitESQLQuery(q.esql) : Promise.resolve()),
    [submitESQLQuery]
  );

  const dataSource = useMemo(
    () => getIndexPatternFromESQLQuery(editorState.esql_query),
    [editorState.esql_query]
  );

  const controlsContext = useMemo(() => {
    const supportsControls = apiCanAddNewPanel(parentApi) || apiCanPinPanels(parentApi);
    if (!supportsControls) return undefined;

    const onSaveControl = async (controlState: Record<string, unknown>, updatedQuery: string) => {
      const newControl = {
        panelType: ESQL_CONTROL,
        serializedState: {
          ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
          ...controlState,
        },
      };

      if (apiCanPinPanels(parentApi)) {
        await parentApi.addPinnedPanel(newControl);
      } else if (apiCanAddNewPanel(parentApi)) {
        await parentApi.addNewPanel(newControl);
      }

      if (reopenEditor) {
        reopenEditor({ esql_query: updatedQuery });
      } else {
        updateEditorState({ esql_query: updatedQuery });
        await submitESQLQuery(updatedQuery);
      }
    };

    return {
      supportsControls: true,
      onSaveControl,
      onCancelControl: () => reopenEditor?.(),
    };
  }, [parentApi, reopenEditor, submitESQLQuery, updateEditorState]);

  return (
    <>
      <EuiFormRow>
        <ESQLLangEditor
          query={{
            esql: editorState.esql_query ?? '',
          }}
          editorIsInline
          errors={previewError ? [previewError] : []}
          disableAutoFocus={true}
          onTextLangQueryChange={onESQLQueryChange}
          onTextLangQuerySubmit={onTextLangQuerySubmit}
          isDisabled={false}
          isLoading={false}
          hasOutline
          expandToFitQueryOnMount
          esqlVariables={esqlVariables}
          controlsContext={controlsContext}
        />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <ESQLValuesPreview
        previewOptions={previewOptions}
        previewColumns={previewColumns}
        previewError={previewError}
        updateQuery={appendColumnToESQLQuery}
        isQueryRunning={isPreviewQueryRunning}
        header={<ValuesPreviewHeader previewColumns={previewColumns} dataSource={dataSource} />}
      />
    </>
  );
};
