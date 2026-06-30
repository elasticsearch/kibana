/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { RuleResponse, RuleParams, ExceptionListReference } from '@kbn/alerting-v2-schemas';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';

type ThreatEntry = NonNullable<RuleParams['threat']>[number];
type RelatedIntegration = NonNullable<RuleParams['related_integrations']>[number];
import type { FormValues, RuleFormServices } from '@kbn/alerting-v2-rule-form';
import {
  RuleFormProvider,
  RulePreviewPanel,
  useFormDefaults,
  getBreachQuery,
  mapFormValuesToCreateRequest,
  mapFormValuesToUpdateRequest,
} from '@kbn/alerting-v2-rule-form';
import { DEFAULT_INDEX_PATTERN } from '../../../common/constants';
import type { SecurityRuleType } from '../constants';
import { buildThresholdEsqlQuery, parseThresholdEsqlQuery } from '../utils/threshold_to_esql';
import { SecurityGuiRuleForm } from './security_gui_rule_form';
import { RuleExceptionPreview } from './rule_exception_preview';

const DEFAULT_THRESHOLD_VALUE = 200;

const SECURITY_OVERRIDES: Pick<
  FormValues,
  | 'kind'
  | 'recoveryStrategy'
  | 'stateTransition'
  | 'stateTransitionAlertDelayMode'
  | 'stateTransitionRecoveryDelayMode'
> = {
  kind: 'alert',
  recoveryStrategy: 'no_breach',
  stateTransition: { pendingCount: 0, recoveringCount: 0 },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
};

interface SecurityRuleFormProps {
  services: RuleFormServices;
  ruleId?: string;
  initialValues?: Partial<FormValues>;
  initialQuery?: string;
  initialParams?: RuleParams;
  initialExceptions?: ExceptionListReference[];
  initialRuleType?: SecurityRuleType;
  onSuccess?: (savedRuleId: string) => void;
  onCancel?: () => void;
}

/**
 * Security-specific rule form that owns its own react-hook-form, react-query,
 * and RuleFormProvider contexts. Composes platform field groups via
 * SecurityGuiRuleForm instead of wrapping StandaloneRuleForm.
 */
export const SecurityRuleForm = ({
  services,
  ruleId,
  initialValues,
  initialQuery,
  initialParams,
  initialExceptions = [],
  initialRuleType,
  onSuccess,
  onCancel,
}: SecurityRuleFormProps) => {
  const inferredType: SecurityRuleType = initialValues?.metadata?.tags?.includes('threshold')
    ? 'threshold'
    : 'esql';
  const [ruleType, setRuleType] = useState<SecurityRuleType>(
    initialRuleType ?? (ruleId ? inferredType : 'esql')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const parsedThreshold = useMemo(
    () =>
      ruleId && inferredType === 'threshold' && initialQuery
        ? parseThresholdEsqlQuery(initialQuery)
        : null,
    [ruleId, inferredType, initialQuery]
  );

  const [indexPatterns, setIndexPatterns] = useState<string[]>(
    parsedThreshold?.indexPatterns ?? DEFAULT_INDEX_PATTERN
  );
  const [groupByFields, setGroupByFields] = useState<string[]>(
    parsedThreshold?.thresholdFields ?? []
  );
  const [thresholdValue, setThresholdValue] = useState(
    parsedThreshold?.thresholdValue ?? DEFAULT_THRESHOLD_VALUE
  );
  const [cardinalityField, setCardinalityField] = useState(parsedThreshold?.cardinalityField ?? '');
  const [cardinalityValue, setCardinalityValue] = useState(parsedThreshold?.cardinalityValue ?? 0);
  const [filterQuery, setFilterQuery] = useState(parsedThreshold?.filterQuery ?? '');

  const [threat, setThreat] = useState<ThreatEntry[]>(initialParams?.threat ?? []);
  const [note, setNote] = useState(initialParams?.note ?? '');
  const [setup, setSetup] = useState(initialParams?.setup ?? '');
  const [relatedIntegrations, setRelatedIntegrations] = useState<RelatedIntegration[]>(
    initialParams?.related_integrations ?? []
  );
  const [investigationFieldNames, setInvestigationFieldNames] = useState<string[]>(
    initialParams?.investigation_fields?.field_names ?? []
  );
  const [references, setReferences] = useState<string[]>(initialParams?.references ?? []);

  const generatedQuery = useMemo(() => {
    if (ruleType !== 'threshold' || indexPatterns.length === 0) {
      return '';
    }
    return buildThresholdEsqlQuery({
      indexPatterns,
      thresholdFields: groupByFields,
      thresholdValue,
      cardinalityField: cardinalityField || undefined,
      cardinalityValue: cardinalityField ? cardinalityValue : undefined,
      filterQuery: filterQuery || undefined,
    });
  }, [
    ruleType,
    indexPatterns,
    groupByFields,
    thresholdValue,
    cardinalityField,
    cardinalityValue,
    filterQuery,
  ]);

  const defaultFromClause = `FROM ${DEFAULT_INDEX_PATTERN.join(', ')}`;

  const effectiveQuery = useMemo(() => {
    if (ruleType === 'threshold') {
      return generatedQuery || defaultFromClause;
    }
    const initialBreach = getBreachQuery(initialValues?.query);
    return initialQuery ?? (initialBreach !== '' ? initialBreach : defaultFromClause);
  }, [ruleType, generatedQuery, initialQuery, initialValues, defaultFromClause]);

  const queryDefaults = useFormDefaults({ query: effectiveQuery });

  const defaultValues = useMemo<FormValues>(() => {
    const securityDefaults: Partial<FormValues> = {
      ...SECURITY_OVERRIDES,
      ...initialValues,
    };

    if (ruleType === 'threshold' && generatedQuery) {
      securityDefaults.query = { format: 'standalone', breach: { query: generatedQuery } };
    }

    return {
      ...queryDefaults,
      ...securityDefaults,
      metadata: {
        ...queryDefaults.metadata,
        ...securityDefaults.metadata,
      },
      schedule: {
        ...queryDefaults.schedule,
        ...securityDefaults.schedule,
      },
      query: securityDefaults.query ?? queryDefaults.query,
      ...(securityDefaults.grouping !== undefined ? { grouping: securityDefaults.grouping } : {}),
      ...(securityDefaults.recoveryStrategy !== undefined
        ? { recoveryStrategy: securityDefaults.recoveryStrategy }
        : {}),
      ...(securityDefaults.stateTransition !== undefined
        ? { stateTransition: securityDefaults.stateTransition }
        : {}),
      stateTransitionAlertDelayMode:
        securityDefaults.stateTransitionAlertDelayMode ??
        queryDefaults.stateTransitionAlertDelayMode,
      stateTransitionRecoveryDelayMode:
        securityDefaults.stateTransitionRecoveryDelayMode ??
        queryDefaults.stateTransitionRecoveryDelayMode,
    };
  }, [queryDefaults, initialValues, ruleType, generatedQuery]);

  const methods = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues,
  });

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
    []
  );

  const [exceptionPreviewFilter, setExceptionPreviewFilter] = useState<unknown>(null);

  const meta = useMemo(
    () => ({
      layout: 'page' as const,
      ...(exceptionPreviewFilter != null
        ? { additionalPreviewFilter: exceptionPreviewFilter }
        : {}),
    }),
    [exceptionPreviewFilter]
  );

  useEffect(() => {
    if (ruleType === 'threshold' && generatedQuery) {
      methods.setValue('query', { format: 'standalone', breach: { query: generatedQuery } });
    }
  }, [ruleType, generatedQuery, methods]);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const enriched: FormValues = {
        ...values,
        ...SECURITY_OVERRIDES,
      };

      const securityTag = ruleType === 'threshold' ? 'threshold' : 'esql';
      const existingTags = enriched.metadata.tags ?? [];
      enriched.metadata = {
        ...enriched.metadata,
        owner: 'siem',
        tags: [
          ...existingTags.filter((t) => t !== 'security' && t !== 'threshold' && t !== 'esql'),
          'security',
          securityTag,
        ],
      };

      if (ruleType === 'threshold' && generatedQuery) {
        enriched.query = { format: 'standalone', breach: { query: generatedQuery } };
      }

      const filteredRefs = references.filter((r) => r.trim().length > 0);
      const filteredIntegrations = relatedIntegrations.filter((ri) => ri.package.trim().length > 0);

      const securityParams: RuleParams = {
        ...(threat.length > 0 ? { threat } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(setup.trim() ? { setup: setup.trim() } : {}),
        ...(filteredIntegrations.length > 0 ? { related_integrations: filteredIntegrations } : {}),
        ...(investigationFieldNames.length > 0
          ? { investigation_fields: { field_names: investigationFieldNames } }
          : {}),
        ...(filteredRefs.length > 0 ? { references: filteredRefs } : {}),
      };

      setIsSubmitting(true);
      try {
        let savedRuleId: string;
        if (ruleId) {
          const updateBody = { ...mapFormValuesToUpdateRequest(enriched), params: securityParams };
          await services.http.patch<RuleResponse>(`${ALERTING_V2_RULE_API_PATH}/${ruleId}`, {
            body: JSON.stringify(updateBody),
          });
          services.notifications.toasts.addSuccess(`Rule '${enriched.metadata.name}' updated`);
          savedRuleId = ruleId;
        } else {
          const createBody = { ...mapFormValuesToCreateRequest(enriched), params: securityParams };
          const created = await services.http.post<RuleResponse>(ALERTING_V2_RULE_API_PATH, {
            body: JSON.stringify(createBody),
          });
          services.notifications.toasts.addSuccess(`Rule '${enriched.metadata.name}' created`);
          savedRuleId = created.id;
        }
        onSuccessRef.current?.(savedRuleId);
      } catch (error) {
        services.notifications.toasts.addDanger(
          `Error ${ruleId ? 'updating' : 'creating'} rule: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      ruleType,
      generatedQuery,
      ruleId,
      services,
      threat,
      note,
      setup,
      relatedIntegrations,
      investigationFieldNames,
      references,
    ]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RuleFormProvider services={services} meta={meta}>
        <FormProvider {...methods}>
          <EuiFlexGroup gutterSize="l" alignItems="flexStart">
            <EuiFlexItem grow={1} style={{ minWidth: 0 }}>
              <SecurityGuiRuleForm
                onSubmit={handleSubmit}
                ruleType={ruleType}
                onRuleTypeChange={setRuleType}
                isUpdateView={Boolean(ruleId)}
                isSubmitting={isSubmitting}
                onCancel={onCancel}
                ruleId={ruleId}
                indexPatterns={indexPatterns}
                onIndexPatternsChange={setIndexPatterns}
                groupByFields={groupByFields}
                onGroupByFieldsChange={setGroupByFields}
                thresholdValue={thresholdValue}
                onThresholdValueChange={setThresholdValue}
                cardinalityField={cardinalityField}
                onCardinalityFieldChange={setCardinalityField}
                cardinalityValue={cardinalityValue}
                onCardinalityValueChange={setCardinalityValue}
                filterQuery={filterQuery}
                onFilterQueryChange={setFilterQuery}
                generatedQuery={generatedQuery}
                search={services.data.search.search}
                threat={threat}
                onThreatChange={setThreat}
                note={note}
                onNoteChange={setNote}
                setup={setup}
                onSetupChange={setSetup}
                relatedIntegrations={relatedIntegrations}
                onRelatedIntegrationsChange={setRelatedIntegrations}
                investigationFieldNames={investigationFieldNames}
                onInvestigationFieldNamesChange={setInvestigationFieldNames}
                references={references}
                onReferencesChange={setReferences}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={1} style={{ minWidth: 0 }}>
              <RulePreviewPanel />
              {initialExceptions.length > 0 && (
                <>
                  <EuiSpacer size="m" />
                  <RuleExceptionPreview
                    exceptions={initialExceptions}
                    onExceptionFilterChange={setExceptionPreviewFilter}
                  />
                </>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </FormProvider>
      </RuleFormProvider>
    </QueryClientProvider>
  );
};
