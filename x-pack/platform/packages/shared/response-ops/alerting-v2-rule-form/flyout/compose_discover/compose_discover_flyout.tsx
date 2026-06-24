/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDebounceFn } from '@kbn/react-hooks';
import type { ESQLControlVariable } from '@kbn/esql-types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { inlineEsqlVariables } from '../../utils/esql_rule_utils';
import type { RuleFormServices } from '../../form/contexts/rule_form_context';
import { RuleFormProvider } from '../../form/contexts/rule_form_context';
import { ConfirmRuleClose } from '../confirm_rule_close';
import type { FormValues, RuleNotificationsValue, RuleQuery } from '../../form/types';
import { getBreachQuery } from '../../form/utils/query_helpers';
import { parseYamlToFormValues, serializeFormToYaml } from '../../form/utils/yaml_form_utils';
import { isNonRepresentableRule } from '../../form/utils/is_non_representable';
import { ComposeDiscoverFooter } from './compose_discover_footer';
import { ComposeDiscoverForm, getSteps } from './compose_discover_form';
import {
  composeFormToCreateRequest,
  composeFormToUpdateRequest,
  mapRuleToComposeFormValues,
  mapYamlFormValuesToComposeFormValues,
} from './compose_mappers';
import { HorizontalMinimalStepper, type MinimalStep } from './horizontal_minimal_stepper';
import { QuerySandboxFlyout } from './query_sandbox_flyout';
import { isAlertTabDisabled } from './compose_discover_tabs';
import { RULE_BUILDER_REGISTRY, BuilderStateProvider, type BuilderState } from './rule_builder';
import type { ComposeDiscoverMode, QueryTab, RecoveryType } from './types';
import { getSandboxTabs, useComposeDiscoverState } from './use_compose_discover_state';
import { useEsqlAutocomplete } from './use_esql_providers';
import { guessRecoveryBlock, discoverQueryToComposed, splitQuery } from './use_heuristic_split';
import { useSplitQueryCompletion } from './use_split_query_completion';
import { getTimeFieldResolutionQuery } from './get_time_field_resolution_query';
import { ComposeDiscoverTimeFieldContextProvider } from './compose_discover_time_field_context';
import { useResolveTimeField } from './use_resolve_time_field';

const LazyYamlRuleForm = React.lazy(() =>
  import('../../form/yaml_rule_form').then((m) => ({ default: m.YamlRuleForm }))
);

// ── Translated phrases ────────────────────────────────────────────────────────

const FORM_VIEW_LABEL = i18n.translate('xpack.alertingV2.composeDiscover.editMode.form', {
  defaultMessage: 'Form view',
});

const YAML_VIEW_LABEL = i18n.translate('xpack.alertingV2.composeDiscover.editMode.yaml', {
  defaultMessage: 'YAML view',
});

const YAML_MODE_BADGE_LABEL = i18n.translate('xpack.alertingV2.composeDiscover.yamlMode.badge', {
  defaultMessage: 'YAML MODE',
});

const EDIT_MODE_LEGEND = i18n.translate('xpack.alertingV2.composeDiscover.editMode.legend', {
  defaultMessage: 'Edit mode selection',
});

const CLONE_TITLE = i18n.translate('xpack.alertingV2.composeDiscover.flyout.cloneTitleLabel', {
  defaultMessage: 'Clone alert rule',
});

const CREATE_TITLE = i18n.translate('xpack.alertingV2.composeDiscover.flyout.createTitleLabel', {
  defaultMessage: 'Create alert rule',
});

const EDIT_TITLE = i18n.translate('xpack.alertingV2.composeDiscover.flyout.editTitleLabel', {
  defaultMessage: 'Edit alert rule',
});

const YAML_ONLY_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.editMode.yamlOnlyTooltip',
  {
    defaultMessage:
      'The current YAML configuration contains features that cannot be represented in the GUI.',
  }
);

const EDIT_MODE_OPTIONS = [
  { id: 'form', label: FORM_VIEW_LABEL, iconType: 'tableDensityNormal' },
  { id: 'yaml', label: YAML_VIEW_LABEL, iconType: 'editorCodeBlock' },
];

const getFlyoutTitle = (mode: ComposeDiscoverMode): string => {
  if (mode === 'clone') return CLONE_TITLE;
  if (mode === 'edit') return EDIT_TITLE;
  return CREATE_TITLE;
};

// These hooks live in the plugin, not the package — imported via the plugin's hook layer
// when this flyout is rendered in the rules list page.
// For now they are passed as props to keep the package boundary clean.
export interface ComposeDiscoverFlyoutProps {
  historyKey: symbol;
  mode?: ComposeDiscoverMode;
  /** The existing rule — provided when mode === 'edit'. Used to seed the RHF form. */
  rule?: Parameters<typeof mapRuleToComposeFormValues>[0];
  /** The ID of the rule being edited. Required when mode === 'edit'. */
  ruleId?: string;
  onClose: () => void;
  services: RuleFormServices;
  /**
   * Called with the create payload when the user submits in create mode. When the user
   * enables the notifications step, `notifications` carries the captured action draft list;
   * otherwise it is `undefined`.
   */
  onCreateRule: (
    payload: ReturnType<typeof composeFormToCreateRequest>,
    notifications?: RuleNotificationsValue
  ) => void;
  /** Called with id + update payload when the user submits in edit mode. */
  onUpdateRule?: (id: string, payload: ReturnType<typeof composeFormToUpdateRequest>) => void;
  /** True while a create/update mutation is in flight. */
  isSaving?: boolean;
  builderType?: string;
  initialBuilderState?: BuilderState;
  /** Pre-populated ES|QL query (e.g. from Discover). Seeds the base query in create mode. */
  initialQuery?: string;
  /** ES|QL control variables from Discover — inlined into initialQuery when provided. */
  esqlVariables?: ESQLControlVariable[];
}

const FLYOUT_TITLE_ID = 'composeDiscoverFlyoutTitle';
const YAML_PARSE_DEBOUNCE_OPTIONS = { wait: 300 } as const;

const getStepStatus = (currentStep: number, stepIndex: number): MinimalStep['status'] => {
  if (stepIndex < currentStep) return 'complete';
  if (stepIndex === currentStep) return 'current';
  return 'incomplete';
};

const EMPTY_FORM_VALUES: FormValues = {
  kind: 'alert',
  metadata: { name: '', enabled: true, description: '', tags: [] },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'composed', base: '', breach: { segment: '' } },
  grouping: undefined,
  stateTransition: undefined,
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
  artifacts: [],
  runbookArtifacts: [],
  dashboardArtifacts: [],
};

export function ComposeDiscoverFlyout({
  historyKey,
  mode = 'create',
  rule,
  ruleId,
  onClose,
  services,
  onCreateRule,
  onUpdateRule,
  isSaving = false,
  builderType,
  initialBuilderState,
  initialQuery,
  esqlVariables,
}: ComposeDiscoverFlyoutProps): React.ReactElement | null {
  const isBuilderMode = Boolean(builderType);
  /*
   * ── UI state (step navigation, sandbox open/close, tab selection, etc.) ──
   * In edit mode, seed the sandbox draft with the rule's existing query so the
   * Alert Condition step shows the current query summary instead of "No query defined".
   * When the persisted rule has a custom recovery query, the initial state
   * infers that tracking was active and reconstructs the split.
   */
  const baseServices = services;

  const initialMapped =
    (mode === 'edit' || mode === 'clone') && rule ? mapRuleToComposeFormValues(rule) : undefined;
  const initialKind = initialMapped?.kind ?? 'alert';
  const hasInitialCustomRecovery =
    initialMapped?.query?.format === 'composed' && !!initialMapped.query.recovery?.segment?.trim();

  const forceYamlMode = Boolean(rule && isNonRepresentableRule(rule));

  const inlineResult = useMemo(
    () =>
      initialQuery !== undefined
        ? inlineEsqlVariables(initialQuery, esqlVariables)
        : { query: '', unresolved: [] as string[] },
    [initialQuery, esqlVariables]
  );

  const discoverComposedQuery = useMemo(
    () => (initialQuery !== undefined ? discoverQueryToComposed(inlineResult.query) : undefined),
    [initialQuery, inlineResult.query]
  );

  const isDiscoverQueryComplete = Boolean(discoverComposedQuery?.breach.segment.trim());

  const [uiState, dispatch] = useComposeDiscoverState({
    mode: mode === 'clone' ? 'edit' : mode,
    initialKind,
    initialRecoveryType: hasInitialCustomRecovery ? 'custom' : 'default',
    isBuilderMode,
    isQueryPrePopulated: isDiscoverQueryComplete,
    forceYamlMode,
  });

  // Registered once here so providers persist across Sandbox open/close cycles.
  useEsqlAutocomplete(baseServices);

  const [builderState, setBuilderState] = useState<BuilderState>(() => {
    if (!builderType) return undefined;
    if (initialBuilderState !== undefined) return initialBuilderState;
    const definition = RULE_BUILDER_REGISTRY[builderType];
    return definition ? definition.createDefaultState() : undefined;
  });

  const validationErrors = inlineResult.unresolved;
  const hasValidationErrors = validationErrors.length > 0;

  // ── Form values (submitted to the API) ──
  const defaultValues = useMemo<FormValues>(() => {
    if (rule) {
      const mapped = mapRuleToComposeFormValues(rule);
      if (mode === 'clone') {
        return {
          ...mapped,
          metadata: {
            ...mapped.metadata,
            name: `${mapped.metadata.name} (clone)`,
          },
        };
      }
      return mapped;
    }
    if (initialQuery !== undefined) {
      return {
        ...EMPTY_FORM_VALUES,
        query: discoverComposedQuery ?? discoverQueryToComposed(''),
      };
    }
    return EMPTY_FORM_VALUES;
  }, [rule, mode, initialQuery, discoverComposedQuery]);

  const methods = useForm<FormValues>({ mode: 'onBlur', defaultValues });
  const [isConfirmCloseVisible, setIsConfirmCloseVisible] = useState(false);
  // EuiFlyout with session="start" uses EUI's managed flyout system, which
  // calls closeAllFlyouts() synchronously (via flushSync) *before* invoking
  // our onClose callback for EUI-managed close paths (X, ESC, outside click).
  // By the time handleRequestClose runs, the flyout is already unregistered
  // from the manager. Incrementing the key forces React to re-mount the
  // EuiFlyout, re-registering it with the manager. The Cancel button doesn't
  // go through closeAllFlyouts(), so no remount is needed for that path.
  // Form state is preserved because FormProvider sits above the flyout.
  const [flyoutKey, setFlyoutKey] = useState(0);
  const isDirtyRef = useRef(false);
  isDirtyRef.current = methods.formState.isDirty;

  // methods.reset() (used by YAML sync and mode-toggle) clears isDirty because
  // it establishes new default values. Two extra refs compensate:
  // - yamlBaselineRef/yamlTextRef: detect edits while in YAML mode.
  // - hasBeenEditedRef: survives reset() calls so exiting YAML mode after
  //   editing still shows the confirmation dialog. Intentionally sticky for the
  //   flyout's lifetime — resets only on unmount (close/discard).
  const yamlBaselineRef = useRef<string | null>(null);
  const yamlTextRef = useRef('');
  const hasBeenEditedRef = useRef(false);

  // recoveryType lives in uiState (not RHF), so toggling it doesn't mark
  // the form dirty. Track the initial value to detect user changes.
  const initialRecoveryTypeRef = useRef(hasInitialCustomRecovery ? 'custom' : 'default');

  // Tracks whether the close was triggered by the Cancel button ('button')
  // or by EUI's managed paths — X, ESC, outside click ('eui'). Only the
  // EUI path calls closeAllFlyouts() which unregisters the flyout and
  // requires a flyoutKey remount.
  const closeSourceRef = useRef<'button' | 'eui'>('eui');

  // After "Continue editing" on the EUI-managed path, the flyoutKey remount
  // cascade-closes the sandbox. This ref tells the subsequent effect whether
  // to re-dispatch OPEN_CHILD to restore it.
  const reopenChildRef = useRef(false);

  const prevExternalQueryRef = useRef<
    { query: string | undefined; esqlVariables: ESQLControlVariable[] | undefined } | undefined
  >();

  const handleRequestClose = useCallback(() => {
    const yamlDirty =
      yamlBaselineRef.current !== null && yamlTextRef.current !== yamlBaselineRef.current;
    const recoveryTypeDirty = uiState.recoveryType !== initialRecoveryTypeRef.current;
    if (isDirtyRef.current || yamlDirty || hasBeenEditedRef.current || recoveryTypeDirty) {
      setIsConfirmCloseVisible(true);
    } else {
      onClose();
    }
  }, [onClose, uiState.recoveryType]);

  const handleConfirmDiscard = useCallback(() => {
    setIsConfirmCloseVisible(false);
    closeSourceRef.current = 'eui';
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setIsConfirmCloseVisible(false);
    if (closeSourceRef.current === 'eui') {
      // EUI-managed close already called closeAllFlyouts() — remount to
      // re-register the flyout with the manager, and reopen the sandbox
      // if it was cascade-closed.
      reopenChildRef.current = uiState.yamlMode || uiState.childOpen;
      setFlyoutKey((k) => k + 1);
    }
    closeSourceRef.current = 'eui';
  }, [uiState.yamlMode, uiState.childOpen]);

  const [sandboxQuery, setSandboxQuery] = useState<RuleQuery>(() => methods.getValues('query'));
  const [sandboxTimeField, setSandboxTimeField] = useState<string>(() =>
    methods.getValues('timeField')
  );
  const [dateRange, setDateRange] = useState({ dateStart: 'now-15m', dateEnd: 'now' });

  const watchedTimeField = useWatch({ control: methods.control, name: 'timeField' });
  useEffect(() => {
    if (watchedTimeField && watchedTimeField !== sandboxTimeField) {
      setSandboxTimeField(watchedTimeField);
    }
  }, [watchedTimeField, sandboxTimeField]);

  const isAlert = useWatch({ control: methods.control, name: 'kind' }) === 'alert';
  const watchedQuery = useWatch({ control: methods.control, name: 'query' });

  const timeFieldResolutionQuery = useMemo(
    () =>
      getTimeFieldResolutionQuery(
        uiState.childOpen ? sandboxQuery : watchedQuery,
        isAlert,
        uiState.queryCommitted || uiState.childOpen
      ),
    [uiState.childOpen, uiState.queryCommitted, sandboxQuery, watchedQuery, isAlert]
  );

  const handleResolvedTimeFieldChange = useCallback(
    (field: string) => {
      methods.setValue('timeField', field, { shouldDirty: false });
      setSandboxTimeField(field);
    },
    [methods]
  );

  const { timeFieldOptions, isTimeFieldResolved } = useResolveTimeField({
    query: timeFieldResolutionQuery,
    timeField: (uiState.childOpen ? sandboxTimeField : watchedTimeField) ?? '@timestamp',
    onTimeFieldChange: handleResolvedTimeFieldChange,
    http: baseServices.http,
    dataViews: baseServices.dataViews,
  });

  // Gate sandbox autoRun on the time field the sandbox actually executes with — not
  // only the form value, which can lead autoRun by one render.
  const sandboxIsTimeFieldResolved = useMemo(
    () =>
      isTimeFieldResolved && timeFieldOptions.some((option) => option.value === sandboxTimeField),
    [isTimeFieldResolved, timeFieldOptions, sandboxTimeField]
  );

  useEffect(() => {
    if (rule || initialQuery === undefined) {
      return;
    }

    const prev = prevExternalQueryRef.current;
    if (prev?.query === initialQuery && prev?.esqlVariables === esqlVariables) {
      return;
    }

    const isFirstRun = prev === undefined;
    prevExternalQueryRef.current = { query: initialQuery, esqlVariables };

    if (isFirstRun || isDirtyRef.current || hasBeenEditedRef.current) {
      return;
    }

    const composedQuery = discoverQueryToComposed(inlineResult.query);
    methods.reset({ ...methods.getValues(), query: composedQuery });
    setSandboxQuery(composedQuery);
    dispatch({
      type: composedQuery.breach.segment.trim() ? 'COMMIT_QUERY' : 'INVALIDATE_QUERY',
    });
  }, [initialQuery, esqlVariables, inlineResult.query, rule, methods, dispatch]);

  const syncSandbox = useCallback(() => {
    setSandboxQuery(methods.getValues('query'));
    setSandboxTimeField(methods.getValues('timeField'));
  }, [methods]);

  const applyYamlValuesToFormAndSandbox = useCallback(
    (parsed: FormValues): FormValues => {
      const composed = {
        ...mapYamlFormValuesToComposeFormValues(parsed),
        notifications: methods.getValues('notifications'),
      };
      methods.reset(composed);
      setSandboxQuery(composed.query);
      setSandboxTimeField(composed.timeField);
      return composed;
    },
    [methods]
  );

  /*
   * Split-query completion for alert and recovery block editors. Registered at
   * the flyout level so providers survive Sandbox (child) open/close cycles and
   * are immune to React Strict Mode double-mount disposal.
   */
  const sandboxBase = sandboxQuery.format === 'composed' ? sandboxQuery.base : '';
  const { onEditorMount: onAlertEditorMount } = useSplitQueryCompletion({
    baseQuery: sandboxBase,
    search: services.data.search.search,
  });
  const { onEditorMount: onRecoveryEditorMount } = useSplitQueryCompletion({
    baseQuery: sandboxBase,
    search: services.data.search.search,
  });

  const isAlertRef = useRef(isAlert);
  isAlertRef.current = isAlert;

  // After "Continue editing" bumps flyoutKey and the EuiFlyout remounts,
  // the sandbox (cascade-closed by closeAllFlyouts()) needs reopening.
  // Read isAlert via ref so this effect only fires on flyoutKey changes,
  // not on kind toggles (where reopenChildRef is always false anyway).
  useEffect(() => {
    if (reopenChildRef.current) {
      reopenChildRef.current = false;
      dispatch({ type: 'OPEN_CHILD', isAlert: isAlertRef.current });
    }
  }, [flyoutKey, dispatch]);

  const handleKindChange = useCallback(
    (kind: 'signal' | 'alert') => {
      if (kind === 'alert') {
        const full = getBreachQuery(methods.getValues('query'));
        const { base, alertBlock } = splitQuery(full);
        const composed: RuleQuery = {
          format: 'composed',
          base,
          breach: { segment: alertBlock },
        };
        setSandboxQuery(composed);
        methods.setValue('query', composed, { shouldDirty: true });
      } else {
        // Assemble from committed query — discards any unapplied sandbox edits cleanly.
        const assembled = getBreachQuery(methods.getValues('query'));
        const standalone: RuleQuery = {
          format: 'standalone',
          breach: { query: assembled },
        };
        setSandboxQuery(standalone);
        methods.setValue('query', standalone, { shouldDirty: true });
      }
      methods.setValue('kind', kind, { shouldDirty: true });
      dispatch({ type: 'KIND_CHANGE', kind });
    },
    [methods, dispatch]
  );

  useEffect(() => {
    if (!isBuilderMode) return;
    const sub = methods.watch((values) => {
      if (values.query) setSandboxQuery(values.query as RuleQuery);
      if (values.timeField) setSandboxTimeField(values.timeField);
    });
    return () => sub.unsubscribe();
  }, [isBuilderMode, methods]);

  const handleRecoveryTypeChange = useCallback(
    (type: RecoveryType) => {
      if (type === 'custom') {
        setSandboxQuery((q) => {
          if (q.format !== 'composed') return q;
          const current = q.recovery?.segment ?? '';
          if (current.trim()) return q;
          if (isBuilderMode) {
            const formQuery = methods.getValues('query');
            const builderRecover =
              formQuery.format === 'composed' ? formQuery.recovery?.segment ?? '' : '';
            if (builderRecover.trim()) {
              return { ...q, recovery: { segment: builderRecover } };
            }
          }
          return {
            ...q,
            recovery: {
              segment: guessRecoveryBlock(q.breach.segment),
            },
          };
        });
      } else {
        // (a) Clear recovery from sandbox regardless of mode — prevents stale recovery
        // query from surviving a type change even when the sandbox is still open.
        setSandboxQuery((q) => {
          if (q.format === 'composed') {
            const { recovery: _recovery, ...rest } = q;
            return rest;
          }
          const { recovery: _recovery, ...rest } = q;
          return rest;
        });
        // Clear recovery from committed RHF state too.
        if (uiState.queryCommitted) {
          const current = methods.getValues('query');
          if (current.format === 'composed' && current.recovery) {
            const { recovery: _recovery, ...rest } = current;
            methods.setValue('query', rest, { shouldDirty: true });
          } else if (current.format === 'standalone' && current.recovery) {
            const { recovery: _recovery, ...rest } = current;
            methods.setValue('query', rest, { shouldDirty: true });
          }
        }
        if (isBuilderMode && builderState) {
          const { recovery: _, ...rest } = builderState as Record<string, unknown>;
          setBuilderState(rest);
        }
        // (b) Close sandbox in non-YAML mode — prevents a pending Apply from
        // overwriting the recovery type change by writing the stale sandboxQuery back.
        // Skip syncSandbox here: (a) already set the clean state directly, and
        // calling syncSandbox when !queryCommitted could re-introduce a stale recovery.
        if (uiState.childOpen && !uiState.yamlMode) {
          dispatch({ type: 'CLOSE_CHILD' });
        }
      }
      dispatch({ type: 'SET_RECOVERY_TYPE', recoveryType: type, isBuilderMode });
    },
    [
      dispatch,
      methods,
      isBuilderMode,
      builderState,
      uiState.queryCommitted,
      uiState.childOpen,
      uiState.yamlMode,
    ]
  );

  const isCreate = mode === 'create' || mode === 'clone';
  const isEditing = mode === 'edit';
  const title = getFlyoutTitle(mode);

  const { steps } = getSteps(isAlert, builderType);
  const currentStep = steps[uiState.step];
  const isLastStep = uiState.step === steps.length - 1;

  // ── YAML mode state ──────────────────────────────────────────────────────
  const [yamlText, setYamlText] = useState(() => {
    if (forceYamlMode) {
      const serialized = serializeFormToYaml(defaultValues);
      yamlBaselineRef.current = serialized;
      return serialized;
    }
    return '';
  });
  yamlTextRef.current = yamlText;
  // Reflects Monaco markers set by the YAML editor's schema validator. Used to
  // disable the Save button while the buffer is invalid.
  const [yamlHasErrors, setYamlHasErrors] = useState(false);

  // Debounced (~300 ms) lenient parse that pushes every YAML keystroke into RHF
  // and mirrors the composed query into the sandbox editing buffer.
  const { run: runYamlParse, cancel: cancelYamlParse } = useDebounceFn((yaml: string) => {
    const result = parseYamlToFormValues(yaml);
    if (result.values) {
      applyYamlValuesToFormAndSandbox(result.values);
    }
  }, YAML_PARSE_DEBOUNCE_OPTIONS);

  const handleSetYamlText = useCallback(
    (yaml: string) => {
      setYamlText(yaml);
      runYamlParse(yaml);
    },
    [runYamlParse]
  );

  const handleBlurSync = useCallback(
    (values: FormValues) => {
      cancelYamlParse();
      applyYamlValuesToFormAndSandbox(values);
    },
    [cancelYamlParse, applyYamlValuesToFormAndSandbox]
  );

  const handleToggleYamlMode = useCallback(
    (enabled: boolean) => {
      if (forceYamlMode) return;

      if (enabled) {
        const serialized = serializeFormToYaml(methods.getValues());
        setYamlText(serialized);
        yamlBaselineRef.current = serialized;
        cancelYamlParse();
        const result = parseYamlToFormValues(serialized);
        if (result.values) {
          applyYamlValuesToFormAndSandbox(result.values);
        }
      } else {
        const yamlWasDirty =
          yamlBaselineRef.current !== null && yamlTextRef.current !== yamlBaselineRef.current;
        yamlBaselineRef.current = null;
        cancelYamlParse();
        const result = parseYamlToFormValues(yamlText);
        if (result.values) {
          const composed = applyYamlValuesToFormAndSandbox(result.values);
          if (getBreachQuery(composed.query).trim()) {
            dispatch({ type: 'COMMIT_QUERY' });
          }
          if (yamlWasDirty) {
            hasBeenEditedRef.current = true;
          }
        }
        // No apply on parse-failure path: the debounced parse always calls
        // applyYamlValuesToFormAndSandbox together, so RHF and sandbox state are already in
        // sync at the last valid parse state. The current yamlText simply can't be applied.
      }
      dispatch({ type: 'SET_YAML_MODE', enabled });
    },
    [cancelYamlParse, methods, yamlText, applyYamlValuesToFormAndSandbox, dispatch, forceYamlMode]
  );

  const handleSandboxApply = useCallback(() => {
    methods.setValue('query', sandboxQuery, { shouldDirty: true });
    methods.setValue('timeField', sandboxTimeField, { shouldDirty: true });
    if (uiState.yamlMode) {
      cancelYamlParse();
      const current = { ...methods.getValues(), query: sandboxQuery, timeField: sandboxTimeField };
      const serialized = serializeFormToYaml(current);
      setYamlText(serialized);
      yamlBaselineRef.current = serialized;
    }
    dispatch({ type: 'COMMIT_QUERY' });
    if (!uiState.yamlMode) {
      dispatch({ type: 'CLOSE_CHILD' });
    }
  }, [sandboxQuery, sandboxTimeField, uiState.yamlMode, methods, dispatch, cancelYamlParse]);

  const handleSubmit = methods.handleSubmit((values) => {
    if (hasValidationErrors) {
      return;
    }
    const query = values.query;
    if (values.kind === 'alert' && query.format === 'composed' && !query.breach.segment.trim()) {
      return;
    }
    if (builderType) {
      const definition = RULE_BUILDER_REGISTRY[builderType];
      if (definition?.validate && !definition.validate(uiState, builderState)) {
        return;
      }
    }
    if (isCreate) {
      onCreateRule(composeFormToCreateRequest(values, builderType), values.notifications);
    } else if (ruleId && onUpdateRule) {
      onUpdateRule(ruleId, composeFormToUpdateRequest(values, builderType));
    }
  });

  // YAML "Save" — flush any pending debounce into RHF, then run the shared
  // handleSubmit path so validation + submission use a single pipeline.
  const handleYamlSave = useCallback(() => {
    if (hasValidationErrors || yamlHasErrors) {
      return;
    }
    cancelYamlParse();
    const result = parseYamlToFormValues(yamlText);
    if (result.error !== null) {
      // YAML syntax or shape errors are surfaced inline by the editor's Monaco
      // markers; abort submission so we don't post stale RHF state to the API.
      return;
    }
    applyYamlValuesToFormAndSandbox(result.values);
    // No syncSandbox() here: draft is temporarily stale after methods.reset(), but
    // we're about to submit. On success the flyout closes; on failure the user is still
    // in YAML mode and handleToggleYamlMode(false) will resync when they switch back.
    handleSubmit();
  }, [
    cancelYamlParse,
    yamlText,
    applyYamlValuesToFormAndSandbox,
    handleSubmit,
    hasValidationErrors,
    yamlHasErrors,
  ]);

  const handleNext = useCallback(async () => {
    if (hasValidationErrors) {
      return;
    }
    if (currentStep?.validate) {
      const valid = await currentStep.validate(methods, uiState, baseServices, builderState);
      if (!valid) return;
    }
    dispatch({ type: 'GO_NEXT', isAlert });
  }, [
    hasValidationErrors,
    currentStep,
    methods,
    uiState,
    isAlert,
    dispatch,
    baseServices,
    builderState,
  ]);

  const handleFinalSubmit = useCallback(async () => {
    if (hasValidationErrors) {
      return;
    }
    if (currentStep?.validate) {
      const valid = await currentStep.validate(methods, uiState, baseServices, builderState);
      if (!valid) return;
    }
    handleSubmit();
  }, [
    currentStep,
    methods,
    uiState,
    baseServices,
    builderState,
    handleSubmit,
    hasValidationErrors,
  ]);

  const validationCallout = hasValidationErrors ? (
    <>
      <EuiCallOut
        announceOnMount
        color="danger"
        iconType="alert"
        data-test-subj="ruleV2FlyoutValidationErrors"
        title={i18n.translate('xpack.alertingV2.ruleForm.validationErrors.title', {
          defaultMessage: 'Resolve issues before saving',
        })}
      >
        <p>
          <FormattedMessage
            id="xpack.alertingV2.ruleForm.validationErrors.description"
            defaultMessage="The following items must be resolved before this rule can be saved: {names}"
            values={{ names: validationErrors.join(', ') }}
          />
        </p>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  ) : null;

  // TODO: recoveryType drives whether the recovery tab appears in YAML mode.
  // Follow schema decisions in #268984 — if recoveryType is superseded by a
  // field on RuleQuery itself, gate this on query shape instead.
  const sandboxTabs = useMemo<QueryTab[] | undefined>(() => {
    if (!uiState.yamlMode) {
      return getSandboxTabs(isAlert, {
        step: uiState.step,
        recoveryType: uiState.recoveryType,
      });
    }
    if (sandboxQuery.format === 'standalone') return undefined;
    return uiState.recoveryType === 'custom' ? ['base', 'alert', 'recovery'] : ['base', 'alert'];
  }, [uiState.yamlMode, uiState.recoveryType, uiState.step, sandboxQuery.format, isAlert]);

  const handleSandboxTabChange = useCallback(
    (tab: QueryTab) => {
      const tabs = sandboxTabs ?? [];

      if (tab === 'alert' && isAlertTabDisabled(tabs, sandboxQuery)) {
        return;
      }

      dispatch({ type: 'SET_TAB', tab });
    },
    [dispatch, sandboxQuery, sandboxTabs]
  );

  return (
    <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
      <FormProvider {...methods}>
        <ComposeDiscoverTimeFieldContextProvider value={{ timeFieldOptions, isTimeFieldResolved }}>
          <EuiFlyout
            key={flyoutKey}
            type="overlay"
            session="start"
            historyKey={historyKey}
            onClose={handleRequestClose}
            aria-labelledby={FLYOUT_TITLE_ID}
            size={480}
          >
            <EuiFlyoutHeader hasBorder>
              <EuiTitle size="s" id={FLYOUT_TITLE_ID}>
                <h2>{title}</h2>
              </EuiTitle>

              <EuiFlexGroup
                justifyContent="spaceBetween"
                alignItems="center"
                responsive={false}
                style={{ marginTop: 8 }}
              >
                {uiState.yamlMode ? (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow" data-test-subj="composeDiscoverYamlBadge">
                      {YAML_MODE_BADGE_LABEL}
                    </EuiBadge>
                  </EuiFlexItem>
                ) : (
                  <EuiFlexItem grow>
                    <HorizontalMinimalStepper
                      steps={steps.map(
                        (s, i): MinimalStep => ({
                          title: s.title,
                          status: getStepStatus(uiState.step, i),
                        })
                      )}
                    />
                  </EuiFlexItem>
                )}
                {!isBuilderMode && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content={forceYamlMode ? YAML_ONLY_TOOLTIP : undefined}>
                      <EuiButtonGroup
                        legend={EDIT_MODE_LEGEND}
                        options={EDIT_MODE_OPTIONS}
                        idSelected={uiState.yamlMode ? 'yaml' : 'form'}
                        onChange={(id) => handleToggleYamlMode(id === 'yaml')}
                        isIconOnly
                        isDisabled={forceYamlMode}
                        buttonSize="compressed"
                        data-test-subj="composeDiscoverEditModeToggle"
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlyoutHeader>

            <EuiFlyoutBody>
              {validationCallout}
              {uiState.yamlMode ? (
                <React.Suspense fallback={null}>
                  <LazyYamlRuleForm
                    services={baseServices}
                    yamlText={yamlText}
                    setYamlText={handleSetYamlText}
                    onBlurSync={handleBlurSync}
                    onValidate={setYamlHasErrors}
                    isSubmitting={isSaving}
                  />
                </React.Suspense>
              ) : (
                <BuilderStateProvider builderState={builderState} setBuilderState={setBuilderState}>
                  <ComposeDiscoverForm
                    state={uiState}
                    dispatch={dispatch}
                    services={baseServices}
                    onRecoveryTypeChange={handleRecoveryTypeChange}
                    onKindChange={handleKindChange}
                    isEditing={isEditing}
                    ruleId={ruleId}
                    builderType={builderType}
                  />
                </BuilderStateProvider>
              )}
            </EuiFlyoutBody>

            <ComposeDiscoverFooter
              uiState={uiState}
              dispatch={dispatch}
              currentStep={currentStep}
              isLastStep={isLastStep}
              isCreate={isCreate}
              hasValidationErrors={hasValidationErrors}
              yamlHasErrors={yamlHasErrors}
              isSaving={isSaving}
              onNext={handleNext}
              onFinalSubmit={handleFinalSubmit}
              onYamlSave={handleYamlSave}
              onRequestClose={handleRequestClose}
              closeSourceRef={closeSourceRef}
            />

            {uiState.childOpen && (
              <QuerySandboxFlyout
                query={sandboxQuery}
                onQueryChange={isBuilderMode ? undefined : setSandboxQuery}
                tabs={sandboxTabs}
                timeField={sandboxTimeField || '@timestamp'}
                onTimeFieldChange={isBuilderMode ? undefined : setSandboxTimeField}
                timeFieldOptions={timeFieldOptions}
                isTimeFieldResolved={sandboxIsTimeFieldResolved}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                activeTab={uiState.activeTab}
                onTabChange={handleSandboxTabChange}
                onAlertEditorMount={onAlertEditorMount}
                onRecoveryEditorMount={onRecoveryEditorMount}
                onClose={() => {
                  syncSandbox();
                  dispatch({ type: 'CLOSE_CHILD' });
                }}
                onApply={isBuilderMode ? undefined : handleSandboxApply}
              />
            )}
          </EuiFlyout>
          {isConfirmCloseVisible && (
            <ConfirmRuleClose onCancel={handleCancelDiscard} onConfirm={handleConfirmDiscard} />
          )}
        </ComposeDiscoverTimeFieldContextProvider>
      </FormProvider>
    </RuleFormProvider>
  );
}
