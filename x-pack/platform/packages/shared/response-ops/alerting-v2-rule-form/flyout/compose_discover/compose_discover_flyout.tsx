/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
  euiFullHeight,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
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
import type {
  FormValues,
  RecoveryStrategy,
  RuleNotificationsValue,
  RuleQuery,
} from '../../form/types';
import { getBreachQuery } from '../../form/utils/query_helpers';
import { enterManualSplitQuery, exitManualSplitQuery } from './manual_split_query';
import { parseYamlToFormValues, serializeFormToYaml } from '../../form/utils/yaml_form_utils';
import {
  isNonRepresentableRule,
  isNonRepresentableFormState,
} from '../../form/utils/is_non_representable';
import { DEFAULT_NO_DATA_STRATEGY } from '../../form/fields/no_data_strategy_select';
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
import { SandboxSettingsMenu } from './sandbox_settings_menu';
import { isAlertTabDisabled } from './compose_discover_tabs';
import {
  RULE_BUILDER_REGISTRY,
  BuilderStateProvider,
  parseDiscoverQueryForBuilder,
  type BuilderState,
} from './rule_builder';
import type { ComposeDiscoverAction, ComposeDiscoverMode, QueryTab } from './types';
import { isBuilderConditionStepId } from './types';
import { validateStep, evaluateStepValidation } from './validate_step';
import {
  getSandboxTabs,
  getStepIds,
  getBuilderStepIds,
  getDefaultOpenTab,
  useComposeDiscoverState,
} from './use_compose_discover_state';
import { useEsqlAutocomplete } from './use_esql_providers';
import {
  guessRecoveryBlock,
  discoverQueryToComposed,
  resolveUnifiedAlertApplyQuery,
  splitResultToRuleQuery,
} from './use_heuristic_split';
import { useSandboxEditorMounts } from './use_sandbox_editor_mounts';
import { getTimeFieldResolutionQuery } from './get_time_field_resolution_query';
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

const QUERY_SANDBOX_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.yamlMode.querySandbox',
  {
    defaultMessage: 'Query sandbox',
  }
);

const EDIT_MODE_LEGEND = i18n.translate('xpack.alertingV2.composeDiscover.editMode.legend', {
  defaultMessage: 'Edit mode selection',
});

const CLONE_TITLE = i18n.translate('xpack.alertingV2.composeDiscover.flyout.cloneTitleLabel', {
  defaultMessage: 'Clone rule',
});

const CREATE_ESQL_TITLE = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.createEsqlTitleLabel',
  { defaultMessage: 'Create ES|QL rule' }
);

const CREATE_RULE_FALLBACK_TITLE = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.createTitleLabel',
  { defaultMessage: 'Create rule' }
);

const EDIT_RULE_FALLBACK_TITLE = i18n.translate(
  'xpack.alertingV2.composeDiscover.flyout.editTitleLabel',
  { defaultMessage: 'Edit rule' }
);

const YAML_ONLY_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.editMode.yamlOnlyTooltip',
  {
    defaultMessage:
      'The current YAML configuration contains features that cannot be represented in the GUI.',
  }
);

const SANDBOX_OPEN_MODE_TOGGLE_TOOLTIP = i18n.translate(
  'xpack.alertingV2.composeDiscover.editMode.sandboxOpenTooltip',
  { defaultMessage: 'Close the query editor to switch views' }
);

const BUILDER_VIEW_LABEL = i18n.translate(
  'xpack.alertingV2.composeDiscover.builderMode.builderView',
  { defaultMessage: 'Builder view' }
);

const ESQL_VIEW_LABEL = i18n.translate('xpack.alertingV2.composeDiscover.builderMode.esqlView', {
  defaultMessage: 'ES|QL view',
});

const BUILDER_MODE_LEGEND = i18n.translate('xpack.alertingV2.composeDiscover.builderMode.legend', {
  defaultMessage: 'Edit mode selection',
});

const BUILDER_MODE_OPTIONS = [
  { id: 'builder', label: BUILDER_VIEW_LABEL, iconType: 'table' },
  { id: 'esql', label: ESQL_VIEW_LABEL, iconType: 'kqlFunction' },
];

const EDIT_MODE_OPTIONS = [
  { id: 'form', label: FORM_VIEW_LABEL, iconType: 'table' },
  { id: 'yaml', label: YAML_VIEW_LABEL, iconType: 'code' },
];

const getQuerySandboxTitle = (isBuilderMode: boolean) =>
  isBuilderMode
    ? i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.builderContextualTitle', {
        defaultMessage: 'Query sandbox: Preview results',
      })
    : i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.editorContextualTitle', {
        defaultMessage: 'Query sandbox: Edit queries',
      });

const getFlyoutTitle = ({
  mode,
  builderType,
  ruleName,
}: {
  mode: ComposeDiscoverMode;
  builderType?: string;
  ruleName?: string;
}): string => {
  if (mode === 'clone') {
    return CLONE_TITLE;
  }
  if (mode === 'edit') {
    const trimmedName = ruleName?.trim();
    if (!trimmedName) {
      return EDIT_RULE_FALLBACK_TITLE;
    }
    return i18n.translate('xpack.alertingV2.composeDiscover.flyout.editNamedTitleLabel', {
      defaultMessage: 'Edit {ruleName}',
      values: { ruleName: trimmedName },
    });
  }
  if (builderType) {
    return RULE_BUILDER_REGISTRY[builderType]?.createFlyoutTitle ?? CREATE_RULE_FALLBACK_TITLE;
  }
  return CREATE_ESQL_TITLE;
};

/*
 * These hooks live in the plugin, not the package — imported via the plugin's hook layer
 * when this flyout is rendered in the rules list page.
 * For now they are passed as props to keep the package boundary clean.
 */
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
  /**
   * Called with id + update payload when the user submits in edit mode. When the user
   * configures simple actions, `notifications` carries the captured action draft list so
   * the caller can create linked action policies; otherwise it is `undefined`.
   */
  onUpdateRule?: (
    id: string,
    payload: ReturnType<typeof composeFormToUpdateRequest>,
    notifications?: RuleNotificationsValue
  ) => void;
  /** True while a create/update mutation is in flight. */
  isSaving?: boolean;
  builderType?: string;
  initialBuilderState?: BuilderState;
  /** Pre-populated ES|QL query (e.g. from Discover). Seeds the base query in create mode. */
  initialQuery?: string;
  /** ES|QL control variables from Discover — inlined into initialQuery when provided. */
  esqlVariables?: ESQLControlVariable[];
  /** Callback to switch from builder mode to ES|QL mode. */
  onSwitchToEsql?: () => void;
}

const FLYOUT_TITLE_ID = 'composeDiscoverFlyoutTitle';
const YAML_PARSE_DEBOUNCE_OPTIONS = { wait: 300 } as const;

const composeDiscoverYamlFlyoutBodyCss = css`
  ${euiFullHeight()}
  .euiFlyoutBody__overflow {
    ${euiFullHeight()}
    min-height: 0;
    overflow: hidden;
  }

  .euiFlyoutBody__overflowContent {
    ${euiFullHeight()}
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
`;

const flyoutTitleCss = css`
  min-width: 0;
`;

const flyoutTitleTextCss = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

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
  recoveryStrategy: 'no_breach',
  grouping: undefined,
  noDataStrategy: DEFAULT_NO_DATA_STRATEGY,
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
  onSwitchToEsql,
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

  const initialMapped = rule ? mapRuleToComposeFormValues(rule) : undefined;
  const initialKind = initialMapped?.kind ?? 'alert';

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

  const isDiscoverQueryPopulated = Boolean(
    discoverComposedQuery && getBreachQuery(discoverComposedQuery).trim()
  );
  const isRuleQueryPopulated = Boolean(
    initialMapped?.query && getBreachQuery(initialMapped.query).trim()
  );

  const [uiState, rawDispatch] = useComposeDiscoverState({
    mode,
    initialKind,
    isQueryPrePopulated: isDiscoverQueryPopulated || (mode === 'create' && isRuleQueryPopulated),
    forceYamlMode,
  });

  const lastFocusedRef = useRef<HTMLElement | null>(null);
  /* Wraps rawDispatch to snapshot the focused trigger before the sandbox opens so focus can be restored when it closes. */
  const dispatch = useCallback(
    (action: ComposeDiscoverAction) => {
      if (!uiState.childOpen) {
        lastFocusedRef.current = document.activeElement as HTMLElement;
      }
      rawDispatch(action);
    },
    [rawDispatch, uiState.childOpen]
  );

  const wasChildOpenRef = useRef(uiState.childOpen);
  useEffect(() => {
    if (wasChildOpenRef.current && !uiState.childOpen) {
      const raf = requestAnimationFrame(() => lastFocusedRef.current?.focus());
      wasChildOpenRef.current = uiState.childOpen;
      return () => cancelAnimationFrame(raf);
    }
    wasChildOpenRef.current = uiState.childOpen;
  }, [uiState.childOpen]);

  // Registered once here so providers persist across Sandbox open/close cycles.
  useEsqlAutocomplete(baseServices);

  const [initialParsedState] = useState<BuilderState | null>(() => {
    if (!builderType || initialBuilderState !== undefined || !inlineResult.query) return null;
    return parseDiscoverQueryForBuilder(inlineResult.query);
  });

  const builderParsedFromDiscover = initialParsedState !== null;

  const [builderState, setBuilderState] = useState<BuilderState>(() => {
    if (!builderType) return undefined;
    if (initialBuilderState !== undefined) return initialBuilderState;
    if (initialParsedState) return initialParsedState;
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
    const shouldSeedFromDiscover =
      initialQuery !== undefined && (!builderType || builderParsedFromDiscover);
    if (shouldSeedFromDiscover) {
      return {
        ...EMPTY_FORM_VALUES,
        query: discoverComposedQuery ?? discoverQueryToComposed(''),
      };
    }
    return EMPTY_FORM_VALUES;
  }, [rule, mode, initialQuery, discoverComposedQuery, builderType, builderParsedFromDiscover]);

  const methods = useForm<FormValues>({ mode: 'onBlur', defaultValues });
  const [isConfirmCloseVisible, setIsConfirmCloseVisible] = useState(false);
  /*
   * EuiFlyout with session="start" uses EUI's managed flyout system, which
   * calls closeAllFlyouts() synchronously (via flushSync) *before* invoking
   * our onClose callback for EUI-managed close paths (X, ESC, outside click).
   * By the time handleRequestClose runs, the flyout is already unregistered
   * from the manager. Incrementing the key forces React to re-mount the
   * EuiFlyout, re-registering it with the manager. The Cancel button doesn't
   * go through closeAllFlyouts(), so no remount is needed for that path.
   * Form state is preserved because FormProvider sits above the flyout.
   */
  const [flyoutKey, setFlyoutKey] = useState(0);
  const isDirtyRef = useRef(false);
  isDirtyRef.current = methods.formState.isDirty;

  /*
   * methods.reset() (used by YAML sync and mode-toggle) clears isDirty because
   * it establishes new default values. Two extra refs compensate:
   * - yamlBaselineRef/yamlTextRef: detect edits while in YAML mode.
   * - hasBeenEditedRef: survives reset() calls so exiting YAML mode after
   *   editing still shows the confirmation dialog. Intentionally sticky for the
   *   flyout's lifetime — resets only on unmount (close/discard).
   */
  const yamlBaselineRef = useRef<string | null>(null);
  const yamlTextRef = useRef('');
  const hasBeenEditedRef = useRef(false);

  /*
   * Tracks whether the close was triggered by the Cancel button ('button')
   * or by EUI's managed paths — X, ESC, outside click ('eui'). Only the
   * EUI path calls closeAllFlyouts() which unregisters the flyout and
   * requires a flyoutKey remount.
   */
  const closeSourceRef = useRef<'button' | 'eui'>('eui');

  /*
   * After "Continue editing" on the EUI-managed path, the flyoutKey remount
   * cascade-closes the sandbox. This ref tells the subsequent effect whether
   * to re-dispatch OPEN_CHILD to restore it.
   */
  const reopenChildRef = useRef(false);

  /*
   * True after ENABLE_MANUAL_SPLIT until the user Applies, merges back to unified,
   * or closes the sandbox — used to revert manual split mode when a draft split
   * is discarded on close without Apply.
   */
  const manualSplitUncommittedRef = useRef(false);

  const prevExternalQueryRef = useRef<
    { query: string | undefined; esqlVariables: ESQLControlVariable[] | undefined } | undefined
  >();

  const handleRequestClose = useCallback(() => {
    const yamlDirty =
      yamlBaselineRef.current !== null && yamlTextRef.current !== yamlBaselineRef.current;
    if (isDirtyRef.current || yamlDirty || hasBeenEditedRef.current) {
      setIsConfirmCloseVisible(true);
    } else {
      onClose();
    }
  }, [onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setIsConfirmCloseVisible(false);
    closeSourceRef.current = 'eui';
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setIsConfirmCloseVisible(false);
    if (closeSourceRef.current === 'eui') {
      /*
       * EUI-managed close already called closeAllFlyouts() — remount to
       * re-register the flyout with the manager, and reopen the sandbox
       * if it was cascade-closed.
       */
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
  const watchedRuleName = useWatch({ control: methods.control, name: 'metadata.name' });
  /*
   * One-way RHF -> sandbox draft push. `sandboxTimeField` must stay out of the deps:
   * with it, the effect re-fires on its own output and reverts the user's in-progress
   * sandbox selection back to the committed form value (#281806).
   */
  useEffect(() => {
    if (watchedTimeField) {
      setSandboxTimeField(watchedTimeField);
    }
  }, [watchedTimeField]);

  const isAlert = useWatch({ control: methods.control, name: 'kind' }) === 'alert';
  const watchedQuery = useWatch({ control: methods.control, name: 'query' });
  const watchedRecoveryStrategy = useWatch({ control: methods.control, name: 'recoveryStrategy' });
  const hasCustomRecovery = watchedRecoveryStrategy === 'query';
  const watchedNoDataStrategy = useWatch({ control: methods.control, name: 'noDataStrategy' });

  const isFormStateNonRepresentable = isNonRepresentableFormState({
    kind: isAlert ? 'alert' : 'signal',
    query: watchedQuery,
    recoveryStrategy: watchedRecoveryStrategy,
    noDataStrategy: watchedNoDataStrategy,
  });

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
    search: baseServices.data.search.search,
  });

  /*
   * Gate sandbox autoRun on the time field the sandbox actually executes with — not
   * only the form value, which can lead autoRun by one render.
   */
  const sandboxIsTimeFieldResolved = useMemo(
    () =>
      isTimeFieldResolved && timeFieldOptions.some((option) => option.value === sandboxTimeField),
    [isTimeFieldResolved, timeFieldOptions, sandboxTimeField]
  );

  useEffect(() => {
    if (rule || initialQuery === undefined) {
      return;
    }

    if (builderType && !builderParsedFromDiscover) {
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
      type: getBreachQuery(composedQuery).trim() ? 'COMMIT_QUERY' : 'INVALIDATE_QUERY',
    });
  }, [
    initialQuery,
    esqlVariables,
    inlineResult.query,
    rule,
    methods,
    dispatch,
    builderType,
    builderParsedFromDiscover,
  ]);

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
  const { onAlertEditorMount, onRecoveryEditorMount, onBaseEditorMount, onSingleEditorMount } =
    useSandboxEditorMounts({ baseQuery: sandboxBase, services: baseServices });

  const isAlertRef = useRef(isAlert);
  isAlertRef.current = isAlert;

  /*
   * After "Continue editing" bumps flyoutKey and the EuiFlyout remounts,
   * the sandbox (cascade-closed by closeAllFlyouts()) needs reopening on the
   * tab it would default to for the current step/recovery/manual-split state.
   * isAlert is read via ref so this effect doesn't fire on kind toggles; the
   * body is gated by reopenChildRef, so extra runs from other deps are no-ops.
   */
  useEffect(() => {
    if (reopenChildRef.current) {
      reopenChildRef.current = false;
      dispatch({
        type: 'OPEN_CHILD',
        isAlert: isAlertRef.current,
        focusedTab: getDefaultOpenTab(
          isAlertRef.current,
          uiState.step,
          hasCustomRecovery,
          uiState.manualSplitEnabled
        ),
      });
    }
  }, [flyoutKey, dispatch, hasCustomRecovery, uiState.step, uiState.manualSplitEnabled]);

  const handleKindChange = useCallback(
    (kind: 'signal' | 'alert') => {
      if (kind === 'alert') {
        const full = getBreachQuery(methods.getValues('query'));
        /*
         * A query with no alert condition stays composed with an empty breach
         * segment (rejected at save); a real split yields base + segment.
         */
        const alertQuery = splitResultToRuleQuery(full).query;
        setSandboxQuery(alertQuery);
        methods.setValue('query', alertQuery, { shouldDirty: true });
        methods.setValue('noDataStrategy', DEFAULT_NO_DATA_STRATEGY, { shouldDirty: true });
        methods.setValue('recoveryStrategy', 'no_breach', { shouldDirty: true });
      } else {
        // Assemble from committed query — discards any unapplied sandbox edits cleanly.
        const assembled = getBreachQuery(methods.getValues('query'));
        const standalone: RuleQuery = {
          format: 'standalone',
          breach: { query: assembled },
        };
        setSandboxQuery(standalone);
        methods.setValue('query', standalone, { shouldDirty: true });
        methods.setValue('noDataStrategy', undefined, { shouldDirty: true });
        methods.setValue('recoveryStrategy', undefined, { shouldDirty: true });
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
    (strategy: RecoveryStrategy) => {
      methods.setValue('recoveryStrategy', strategy, { shouldDirty: true });
      if (strategy === 'query') {
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
        if (!isBuilderMode) {
          dispatch({ type: 'OPEN_CHILD', isAlert, focusedTab: 'recovery' });
        }
      } else {
        /*
         * (a) Clear recovery from sandbox regardless of mode — prevents stale recovery
         * query from surviving a type change even when the sandbox is still open.
         */
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
        /*
         * (b) Close sandbox in non-YAML mode — prevents a pending Apply from
         * overwriting the recovery type change by writing the stale sandboxQuery back.
         * Skip syncSandbox here: (a) already set the clean state directly, and
         * calling syncSandbox when !queryCommitted could re-introduce a stale recovery.
         */
        if (uiState.childOpen && !uiState.yamlMode) {
          dispatch({ type: 'CLOSE_CHILD' });
        }
      }
    },
    [
      dispatch,
      methods,
      isAlert,
      isBuilderMode,
      builderState,
      uiState.queryCommitted,
      uiState.childOpen,
      uiState.yamlMode,
    ]
  );

  const isCreate = mode === 'create' || mode === 'clone';
  const isEditing = mode === 'edit';
  /** Create, edit, and clone share the unified ↔ split-tab sandbox toggle. */
  const supportsUnifiedEditorToggle = isCreate || isEditing;
  const title = getFlyoutTitle({ mode, builderType, ruleName: watchedRuleName });

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

  /*
   * Debounced (~300 ms) lenient parse that pushes every YAML keystroke into RHF
   * and mirrors the composed query into the sandbox editing buffer.
   */
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
        manualSplitUncommittedRef.current = false;
        if (isDirtyRef.current) {
          hasBeenEditedRef.current = true;
        }
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

        const currentValues = methods.getValues();
        if (isNonRepresentableFormState(currentValues)) {
          /* Stay in YAML mode — the Form view has no editor for this shape. */
          return;
        }

        /* Make sure step is realigned when switching back to the rule form from the yaml form */
        const currentKindIsAlert = currentValues.kind === 'alert';
        const stepCount = (
          builderType ? getBuilderStepIds(currentKindIsAlert) : getStepIds(currentKindIsAlert)
        ).length;
        if (uiState.step > stepCount - 1) {
          dispatch({ type: 'SET_STEP', step: stepCount - 1 });
        }
      }
      dispatch({ type: 'SET_YAML_MODE', enabled });
    },
    [
      cancelYamlParse,
      methods,
      yamlText,
      applyYamlValuesToFormAndSandbox,
      dispatch,
      forceYamlMode,
      builderType,
      uiState.step,
    ]
  );

  const handleSandboxApply = useCallback(() => {
    /*
     * Create/edit/clone default to a single unified editor on the Alert Condition
     * step — no base/alert tabs. On Apply, derive the base query and alert condition
     * from that unified text via the heuristic split.
     * When the user has opted in to manual split, Apply commits the already-separated
     * base/alert verbatim without running the heuristic.
     */
    const shouldRunHeuristicSplit =
      currentStep?.id === 'alertCondition' &&
      !uiState.yamlMode &&
      isAlert &&
      !uiState.manualSplitEnabled;

    let queryToCommit: RuleQuery = sandboxQuery;
    if (shouldRunHeuristicSplit) {
      const split = splitResultToRuleQuery(getBreachQuery(sandboxQuery)).query;
      queryToCommit = resolveUnifiedAlertApplyQuery(sandboxQuery, split);
    }
    /*
     * Manual split with an empty alert condition stays composed + empty segment —
     * the request mapper omits the breach block at save; do not coerce to standalone.
     */
    setSandboxQuery(queryToCommit);

    methods.setValue('query', queryToCommit, { shouldDirty: true });
    methods.setValue('timeField', sandboxTimeField, { shouldDirty: true });
    if (uiState.yamlMode) {
      cancelYamlParse();
      const current = { ...methods.getValues(), query: queryToCommit, timeField: sandboxTimeField };
      const serialized = serializeFormToYaml(current);
      setYamlText(serialized);
      yamlBaselineRef.current = serialized;
    }
    dispatch({ type: 'COMMIT_QUERY' });
    manualSplitUncommittedRef.current = false;
    if (!uiState.yamlMode) {
      dispatch({ type: 'CLOSE_CHILD' });
    }
  }, [
    sandboxQuery,
    sandboxTimeField,
    currentStep?.id,
    uiState.yamlMode,
    uiState.manualSplitEnabled,
    isAlert,
    methods,
    dispatch,
    cancelYamlParse,
  ]);

  const handleSubmit = methods.handleSubmit((values) => {
    if (hasValidationErrors) {
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
      onUpdateRule(ruleId, composeFormToUpdateRequest(values, builderType), values.notifications);
    }
  });

  /*
   * YAML "Save" — flush any pending debounce into RHF, then run the shared
   * handleSubmit path so validation + submission use a single pipeline.
   */
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
    if (currentStep) {
      const valid = await validateStep(currentStep, methods, uiState, baseServices, builderState);
      if (!valid) return;
    }
    dispatch({ type: 'GO_NEXT', isAlert, isBuilderMode });
  }, [
    hasValidationErrors,
    currentStep,
    methods,
    uiState,
    isAlert,
    isBuilderMode,
    dispatch,
    baseServices,
    builderState,
  ]);

  const handleFinalSubmit = useCallback(async () => {
    if (hasValidationErrors) {
      return;
    }
    if (currentStep) {
      const valid = await validateStep(currentStep, methods, uiState, baseServices, builderState);
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

  const isBuilderStepValid = useMemo(() => {
    if (!currentStep || !isBuilderConditionStepId(currentStep.id)) {
      return true;
    }
    const result = evaluateStepValidation(
      currentStep,
      methods,
      uiState,
      baseServices,
      builderState
    );
    return typeof result === 'boolean' ? result : true;
  }, [currentStep, methods, uiState, baseServices, builderState]);

  const validationCallout = hasValidationErrors ? (
    <>
      <EuiCallOut
        announceOnMount
        color="danger"
        iconType="warning"
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

  const sandboxTabs = useMemo<QueryTab[] | undefined>(() => {
    if (!uiState.yamlMode) {
      return getSandboxTabs(isAlert, {
        step: uiState.step,
        hasCustomRecovery,
        manualSplitEnabled: uiState.manualSplitEnabled,
      });
    }
    /*
     * In YAML mode the sandbox stays open (and is forced open for non-representable
     * rules). A standalone query can't be represented as base/alert tabs, so it uses
     * the single unified editor; composed queries keep the split tabs.
     */
    if (sandboxQuery.format === 'standalone') return undefined;
    return hasCustomRecovery ? ['base', 'alert', 'recovery'] : ['base', 'alert'];
  }, [
    uiState.yamlMode,
    hasCustomRecovery,
    uiState.step,
    uiState.manualSplitEnabled,
    sandboxQuery.format,
    isAlert,
  ]);

  const isAlertConditionStep = currentStep?.id === 'alertCondition';

  /*
   * Help text shown above the editor in the create/edit alert flow.
   * - Unified (default): describes the automatic split on Apply.
   * - Manual split: explains that automatic splitting is disabled and tabs are separate.
   * Alert Condition step only — not shown on recovery or later steps.
   */
  const sandboxHelpText =
    isAlert &&
    !isBuilderMode &&
    !uiState.yamlMode &&
    supportsUnifiedEditorToggle &&
    isAlertConditionStep ? (
      uiState.manualSplitEnabled ? (
        <EuiText size="s" color="subdued" data-test-subj="querySandboxManualSplitHelper">
          <FormattedMessage
            id="xpack.alertingV2.composeDiscover.querySandbox.manualSplitHelperText"
            defaultMessage="Define the base query and alert condition separately. Automatic query splitting is disabled in this mode."
          />
        </EuiText>
      ) : (
        <EuiText size="s" color="subdued" data-test-subj="querySandboxUnifiedHelper">
          <FormattedMessage
            id="xpack.alertingV2.composeDiscover.querySandbox.unifiedHelperText"
            defaultMessage="We'll automatically identify the base query and alert condition when you apply changes."
          />
        </EuiText>
      )
    ) : undefined;

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

  /*
   * Opt in to manual split from the sandbox header button.
   * Pre-populates base/alert when the heuristic can split; otherwise puts the
   * entire unified query into the base tab with an empty alert segment (e.g.
   * leading-WHERE-only pipelines where the heuristic cannot isolate a base).
   */
  const handleEnableManualSplit = useCallback(() => {
    setSandboxQuery(enterManualSplitQuery(sandboxQuery));
    manualSplitUncommittedRef.current = true;
    dispatch({ type: 'ENABLE_MANUAL_SPLIT' });
  }, [sandboxQuery, dispatch]);

  /*
   * Opt back in to unified editor from the sandbox header button.
   * Recombines base+alert into one pipeline and re-enables auto-split on Apply.
   */
  const handleDisableManualSplit = useCallback(() => {
    setSandboxQuery(exitManualSplitQuery(sandboxQuery));
    manualSplitUncommittedRef.current = false;
    dispatch({ type: 'DISABLE_MANUAL_SPLIT' });
  }, [sandboxQuery, dispatch]);

  const handleSandboxClose = useCallback(() => {
    if (manualSplitUncommittedRef.current) {
      // Clear manual split before syncing so the next render sees manualSplitEnabled: false.
      dispatch({ type: 'DISABLE_MANUAL_SPLIT' });
      manualSplitUncommittedRef.current = false;
    }
    syncSandbox();
    dispatch({ type: 'CLOSE_CHILD' });
  }, [syncSandbox, dispatch]);

  /*
   * Settings (gear) menu rendered in the sandbox flyout header.
   * Alert Condition step only — not on recovery editing.
   */
  const sandboxHeaderActions = useMemo(() => {
    if (
      isBuilderMode ||
      uiState.yamlMode ||
      !supportsUnifiedEditorToggle ||
      !isAlert ||
      currentStep?.id !== 'alertCondition'
    ) {
      return undefined;
    }
    return (
      <SandboxSettingsMenu
        manualSplitEnabled={uiState.manualSplitEnabled}
        onEnableManualSplit={handleEnableManualSplit}
        onDisableManualSplit={handleDisableManualSplit}
      />
    );
  }, [
    isBuilderMode,
    uiState.yamlMode,
    supportsUnifiedEditorToggle,
    uiState.manualSplitEnabled,
    isAlert,
    currentStep?.id,
    handleEnableManualSplit,
    handleDisableManualSplit,
  ]);

  // Freeze the view toggle while the sandbox is open in FORM mode. In YAML mode the
  // sandbox stays open by design, so the toggle remains enabled (#623 gating table).
  const modeToggleSandboxLocked = uiState.childOpen && !uiState.yamlMode;
  /*
   * Only traps the toggle while already in YAML mode — a non-representable
   * form state reached from Form mode must still be able to open YAML to fix it.
   */
  const yamlLockedByFormState = uiState.yamlMode && isFormStateNonRepresentable;
  const modeToggleDisabled = forceYamlMode || modeToggleSandboxLocked || yamlLockedByFormState;

  const getModeToggleTooltip = (): string | undefined => {
    if (forceYamlMode || yamlLockedByFormState) return YAML_ONLY_TOOLTIP;
    if (modeToggleSandboxLocked) return SANDBOX_OPEN_MODE_TOGGLE_TOOLTIP;
    return undefined;
  };

  return (
    <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
      <FormProvider {...methods}>
        <>
          <EuiFlyout
            key={flyoutKey}
            type="overlay"
            session="start"
            historyKey={historyKey}
            onClose={handleRequestClose}
            aria-labelledby={FLYOUT_TITLE_ID}
            size={540}
            minWidth={480}
            resizable
          >
            <EuiFlyoutHeader hasBorder>
              <EuiTitle size="s" id={FLYOUT_TITLE_ID} css={flyoutTitleCss}>
                <h2 title={title} css={flyoutTitleTextCss}>
                  {title}
                </h2>
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
                {isBuilderMode && isEditing && onSwitchToEsql && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend={BUILDER_MODE_LEGEND}
                      options={BUILDER_MODE_OPTIONS}
                      idSelected="builder"
                      onChange={(id) => {
                        if (id === 'esql') onSwitchToEsql();
                      }}
                      isIconOnly
                      buttonSize="compressed"
                      data-test-subj="composeDiscoverSwitchToEsql"
                    />
                  </EuiFlexItem>
                )}
                {!isBuilderMode && (
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                      {uiState.yamlMode && (
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            size="s"
                            color="text"
                            iconType="chevronLimitLeft"
                            isDisabled={uiState.childOpen}
                            onClick={() =>
                              dispatch({
                                type: 'OPEN_CHILD',
                                isAlert,
                                focusedTab: getDefaultOpenTab(
                                  isAlert,
                                  uiState.step,
                                  hasCustomRecovery,
                                  uiState.manualSplitEnabled
                                ),
                              })
                            }
                            data-test-subj="composeDiscoverYamlQuerySandbox"
                          >
                            {QUERY_SANDBOX_LABEL}
                          </EuiButton>
                        </EuiFlexItem>
                      )}
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={getModeToggleTooltip()}>
                          <EuiButtonGroup
                            legend={EDIT_MODE_LEGEND}
                            options={EDIT_MODE_OPTIONS}
                            idSelected={uiState.yamlMode ? 'yaml' : 'form'}
                            onChange={(id) => handleToggleYamlMode(id === 'yaml')}
                            isIconOnly
                            isDisabled={modeToggleDisabled}
                            buttonSize="compressed"
                            data-test-subj="composeDiscoverEditModeToggle"
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlyoutHeader>

            <EuiFlyoutBody css={uiState.yamlMode ? composeDiscoverYamlFlyoutBodyCss : undefined}>
              {uiState.yamlMode ? (
                <>
                  {validationCallout}
                  <React.Suspense fallback={null}>
                    <LazyYamlRuleForm
                      services={baseServices}
                      yamlText={yamlText}
                      setYamlText={handleSetYamlText}
                      onBlurSync={handleBlurSync}
                      onValidate={setYamlHasErrors}
                      isSubmitting={isSaving}
                      fullHeight
                    />
                  </React.Suspense>
                </>
              ) : (
                <>
                  {validationCallout}
                  <BuilderStateProvider
                    builderState={builderState}
                    setBuilderState={setBuilderState}
                  >
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
                </>
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
              isBuilderMode={isBuilderMode}
              isBuilderStepValid={isBuilderStepValid}
              isSaving={isSaving}
              onNext={handleNext}
              onFinalSubmit={handleFinalSubmit}
              onYamlSave={handleYamlSave}
            />

            {uiState.childOpen && (
              <QuerySandboxFlyout
                query={sandboxQuery}
                onQueryChange={isBuilderMode ? undefined : setSandboxQuery}
                tabs={sandboxTabs}
                timeField={sandboxTimeField}
                onTimeFieldChange={isBuilderMode ? undefined : setSandboxTimeField}
                timeFieldOptions={timeFieldOptions}
                isTimeFieldResolved={sandboxIsTimeFieldResolved}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                activeTab={uiState.activeTab}
                onTabChange={handleSandboxTabChange}
                onAlertEditorMount={onAlertEditorMount}
                onRecoveryEditorMount={onRecoveryEditorMount}
                onBaseEditorMount={onBaseEditorMount}
                onSingleEditorMount={onSingleEditorMount}
                onClose={handleSandboxClose}
                helpText={sandboxHelpText}
                headerActions={sandboxHeaderActions}
                onApply={isBuilderMode ? undefined : handleSandboxApply}
                title={getQuerySandboxTitle(isBuilderMode)}
              />
            )}
          </EuiFlyout>
          {isConfirmCloseVisible && (
            <ConfirmRuleClose onCancel={handleCancelDiscard} onConfirm={handleConfirmDiscard} />
          )}
        </>
      </FormProvider>
    </RuleFormProvider>
  );
}
