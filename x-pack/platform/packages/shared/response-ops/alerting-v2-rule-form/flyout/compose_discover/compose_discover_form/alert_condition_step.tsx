/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { Parser, isColumn } from '@elastic/esql';
import { useQuery } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getEsqlColumns } from '@kbn/esql-utils';
import {
  EuiButton,
  EuiComboBox,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ComposeDiscoverAction, ComposeDiscoverState } from '../types';
import type { FormValues } from '../../../form/types';
import { QuerySummary } from '../query_summary';
import { EsqlQuerySummarySection } from './esql_query_summary_section';
import type { RuleFormServices } from '../../../form/contexts/rule_form_context';
import { useComposeDiscoverTimeField } from '../compose_discover_time_field_context';
import { getTimeFieldResolutionQuery } from '../get_time_field_resolution_query';

interface AlertConditionStepProps {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  services: RuleFormServices;
  isEditing: boolean;
}

export function AlertConditionStep({
  state,
  dispatch,
  services,
  isEditing,
}: AlertConditionStepProps) {
  const { setValue, watch } = useFormContext<FormValues>();
  const isAlert = watch('kind') === 'alert';
  const timeField = watch('timeField') ?? '@timestamp';
  const grouping = watch('grouping');
  const groupFields = grouping?.fields ?? [];
  const query = watch('query');

  const fullQuery = query.format === 'standalone' ? query.breach.query : '';

  // Committed pipeline query for output-column lookup and STATS BY auto-populate.
  const committedQuery = useMemo(
    () => getTimeFieldResolutionQuery(query, isAlert, state.queryCommitted),
    [query, isAlert, state.queryCommitted]
  );

  const { timeFieldOptions } = useComposeDiscoverTimeField();

  /*
   * Output columns of the full pipeline -> options for the group fields selector.
   * Uses | LIMIT 0 so no data is transferred -- only the output schema is returned.
   * Works in edit mode (query seeded on mount) without requiring the sandbox to be opened.
   */
  const { data: outputColumns = [] } = useQuery({
    queryKey: ['composeDiscoverOutputColumns', committedQuery],
    queryFn: async () => {
      const cols = await getEsqlColumns({
        esqlQuery: committedQuery,
        search: services.data.search.search,
      });
      return cols.map((c) => c.name);
    },
    enabled: Boolean(committedQuery),
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  /*
   * Auto-populate group fields from the STATS BY clause whenever the committed
   * query changes. Re-derives on every new Apply so switching indices updates
   * the group fields instead of leaving stale values from the previous query.
   * Skips the first run when editing to preserve API-seeded grouping defaults.
   */
  const autoPopulatedForRef = useRef<string | null>(isEditing ? committedQuery : null);
  useEffect(() => {
    if (!state.queryCommitted || !committedQuery) return;
    if (autoPopulatedForRef.current === committedQuery) return;
    autoPopulatedForRef.current = committedQuery;
    try {
      const { root } = Parser.parse(committedQuery);
      const statsCmd = [...root.commands].reverse().find((c) => c.name === 'stats');
      interface CmdOption {
        type: string;
        name: string;
        args?: unknown[];
      }
      const byOption = (statsCmd?.args as CmdOption[] | undefined)?.find(
        (a) => a.type === 'option' && a.name === 'by'
      );
      const byFields = (byOption?.args ?? []).filter(isColumn).map((a) => a.name);
      setValue('grouping', byFields.length > 0 ? { fields: byFields } : undefined);
    } catch {
      // Non-parseable query -- skip auto-populate
    }
  }, [state.queryCommitted, committedQuery, setValue]);

  return (
    <>
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="xpack.alertingV2.composeDiscover.alertCondition.esqlQueryTitle"
            defaultMessage="ES|QL query"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />

      {isAlert ? (
        <EsqlQuerySummarySection
          query={query}
          queryCommitted={state.queryCommitted}
          isEditorOpen={state.childOpen}
          onOpenEditor={() => dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert })}
        />
      ) : !state.queryCommitted ? (
        <>
          <EuiPanel color="subdued" paddingSize="m">
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.alertCondition.noQueryDescription"
                defaultMessage="No query defined yet"
              />
            </EuiText>
          </EuiPanel>
          <EuiSpacer size="s" />
          <EuiButton
            iconType="editorCodeBlock"
            isDisabled={state.childOpen}
            onClick={() => dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert })}
            data-test-subj="composeDiscoverOpenEditor"
          >
            <FormattedMessage
              id="xpack.alertingV2.composeDiscover.alertCondition.openEditorButtonLabel"
              defaultMessage="Open query editor"
            />
          </EuiButton>
        </>
      ) : (
        <>
          <QuerySummary
            query={fullQuery}
            emptyMessage={i18n.translate(
              'xpack.alertingV2.composeDiscover.alertCondition.noQueryDefined',
              { defaultMessage: 'No query defined' }
            )}
          />
          <EuiSpacer size="s" />
          <EuiButton
            size="s"
            iconType="editorCodeBlock"
            isDisabled={state.childOpen}
            onClick={() => dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert })}
            data-test-subj="composeDiscoverEditQuery"
          >
            <FormattedMessage
              id="xpack.alertingV2.composeDiscover.alertCondition.editQueryButtonLabel"
              defaultMessage="Edit query"
            />
          </EuiButton>
        </>
      )}

      <EuiSpacer size="m" />
      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.composeDiscover.alertCondition.timeFieldLabel', {
          defaultMessage: 'Time field',
        })}
        fullWidth
      >
        <EuiSelect
          compressed
          fullWidth
          options={timeFieldOptions}
          value={timeField}
          onChange={(e) => setValue('timeField', e.target.value, { shouldDirty: true })}
          disabled={state.childOpen}
          data-test-subj="composeDiscoverTimeField"
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.composeDiscover.alertCondition.groupFieldsLabel', {
          defaultMessage: 'Group fields',
        })}
        fullWidth
      >
        <EuiComboBox
          compressed
          fullWidth
          options={outputColumns.map((name) => ({ label: name }))}
          selectedOptions={groupFields.map((f) => ({ label: f }))}
          onChange={(opts) =>
            setValue('grouping', opts.length ? { fields: opts.map((o) => o.label) } : undefined, {
              shouldDirty: true,
            })
          }
          onCreateOption={(val) =>
            setValue('grouping', { fields: [...groupFields, val] }, { shouldDirty: true })
          }
          placeholder={i18n.translate(
            'xpack.alertingV2.composeDiscover.alertCondition.groupFieldsPlaceholder',
            { defaultMessage: 'Add group fields' }
          )}
          data-test-subj="composeDiscoverGroupFields"
        />
      </EuiFormRow>
    </>
  );
}
