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
  EuiCallOut,
  EuiComboBox,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ComposeDiscoverAction, ComposeDiscoverState } from '../types';
import type { ComposeFormValues } from '../compose_form_types';
import { QuerySummary } from '../query_summary';
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
  const { setValue, watch } = useFormContext<ComposeFormValues>();
  const isAlert = watch('kind') === 'alert';
  const timeField = watch('timeField') ?? '@timestamp';
  const grouping = watch('grouping');
  const groupFields = grouping?.fields ?? [];
  const query = watch('query');

  const baseQuery = query.format === 'composed' ? query.base : '';
  const alertBlock = query.format === 'composed' ? query.breach.segment : '';
  const fullQuery = query.format === 'standalone' ? query.breach.query : '';

  // Committed pipeline query for output-column lookup and STATS BY auto-populate.
  const committedQuery = useMemo(
    () => getTimeFieldResolutionQuery(query, isAlert, state.queryCommitted),
    [query, isAlert, state.queryCommitted]
  );

  const { timeFieldOptions } = useComposeDiscoverTimeField();

  // Output columns of the full pipeline -> options for the group fields selector.
  // Uses | LIMIT 0 so no data is transferred -- only the output schema is returned.
  // Works in edit mode (query seeded on mount) without requiring the sandbox to be opened.
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

  // Auto-populate group fields from the STATS BY clause whenever the committed
  // query changes. Re-derives on every new Apply so switching indices updates
  // the group fields instead of leaving stale values from the previous query.
  // Skips the first run when editing to preserve API-seeded grouping defaults.
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

  // Callout when the heuristic split couldn't find a clear split point.
  // Only relevant after Apply (when the committed query is in composed format).
  const splitFailed =
    isAlert && state.queryCommitted && query.format === 'composed' && !query.base.trim();

  // Show a warning callout when the breach segment is empty after Apply.
  // Skipped when splitFailed is already showing (which covers the empty-base case).
  const missingBreachQuery =
    !splitFailed &&
    isAlert &&
    state.queryCommitted &&
    query.format === 'composed' &&
    !query.breach.segment.trim();

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

      {!state.queryCommitted ? (
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
      ) : !isAlert ? (
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
      ) : (
        <>
          {splitFailed && (
            <>
              <EuiCallOut
                announceOnMount={false}
                size="s"
                color="primary"
                iconType="info"
                title={i18n.translate(
                  'xpack.alertingV2.composeDiscover.alertCondition.splitFailedTitle',
                  {
                    defaultMessage:
                      "Couldn't automatically separate base query from alert condition. Adjust the split in the query editor.",
                  }
                )}
              />
              <EuiSpacer size="s" />
            </>
          )}
          {missingBreachQuery && (
            <>
              <EuiCallOut
                announceOnMount={false}
                size="s"
                color="warning"
                iconType="warning"
                title={i18n.translate(
                  'xpack.alertingV2.composeDiscover.alertCondition.alertQueryRequiredTitle',
                  {
                    defaultMessage: 'Alert condition required',
                  }
                )}
                data-test-subj="composeDiscoverAlertQueryMissing"
              >
                <FormattedMessage
                  id="xpack.alertingV2.composeDiscover.alertCondition.alertQueryRequiredDescription"
                  defaultMessage="Define an alert condition in the query editor before continuing to the next step."
                />
              </EuiCallOut>
              <EuiSpacer size="s" />
            </>
          )}
          <EuiText size="xs" color="subdued">
            <strong>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.alertCondition.baseQueryLabel"
                defaultMessage="Base query"
              />
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <QuerySummary
            query={baseQuery}
            emptyMessage={i18n.translate(
              'xpack.alertingV2.composeDiscover.alertCondition.noBaseQueryDefined',
              { defaultMessage: 'No base query defined' }
            )}
          />
          <EuiSpacer size="m" />
          <EuiText size="xs" color="subdued">
            <strong>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.alertCondition.alertConditionLabel"
                defaultMessage="Alert condition"
              />
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <QuerySummary
            query={alertBlock}
            emptyMessage={i18n.translate(
              'xpack.alertingV2.composeDiscover.alertCondition.noAlertConditionDefined',
              { defaultMessage: 'No alert condition defined' }
            )}
          />
          <EuiSpacer size="s" />
          <EuiButton
            size="s"
            iconType="editorCodeBlock"
            isDisabled={state.childOpen}
            onClick={() => dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert })}
            data-test-subj="composeDiscoverEditQueries"
          >
            <FormattedMessage
              id="xpack.alertingV2.composeDiscover.alertCondition.editQueriesButtonLabel"
              defaultMessage="Edit queries"
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
