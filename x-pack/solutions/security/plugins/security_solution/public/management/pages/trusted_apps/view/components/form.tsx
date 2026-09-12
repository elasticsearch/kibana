/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeEventHandler } from 'react';
import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { isEqual } from 'lodash';
import type { EuiFieldTextProps, EuiSuperSelectOption } from '@elastic/eui';
import {
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiSuperSelect,
  EuiTextArea,
  EuiText,
  EuiTitle,
  EuiSpacer,
  EuiButtonGroup,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AllConditionEntryFields, EntryTypes } from '@kbn/securitysolution-utils';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import {
  ENDPOINT_ARTIFACT_OPERATORS,
  hasWrongOperatorWithWildcard,
  hasPartialCodeSignatureEntry,
  hasEscaping,
  hasEntryEscaping,
} from '@kbn/securitysolution-list-utils';
import {
  CONTROL_CHARACTER_ERROR,
  hasControlCharacters,
  hasSimpleExecutableName,
  validateHasWildcardWithWrongOperator,
  isPathValid,
  ConditionEntryField,
  OperatingSystem,
} from '@kbn/securitysolution-utils';
import type { OnChangeProps } from '@kbn/lists-plugin/public';
import type { ValueSuggestionsGetFn } from '@kbn/kql/public/autocomplete/providers/value_suggestion_provider';
import {
  PartialCodeSignatureCallout,
  UnnecessaryEscapingCallout,
  WildCardWithWrongOperatorCallout,
} from '@kbn/securitysolution-exception-list-components';
import { getExceptionBuilderComponentLazy } from '@kbn/lists-plugin/public';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '../../../../../common/lib/kibana';
import { useCanAssignArtifactPerPolicy, useGetUpdatedTags } from '../../../../hooks/artifacts';
import { useSuggestions } from '../../../../hooks/use_suggestions';
import { useFetchIndex } from '../../../../../common/containers/source';
import {
  ENDPOINT_FIELDS_SEARCH_STRATEGY,
  eventsIndexPattern,
} from '../../../../../../common/endpoint/constants';
import { FormattedError } from '../../../../components/formatted_error';
import type {
  TrustedAppConditionEntry,
  NewTrustedApp,
} from '../../../../../../common/endpoint/types';
import {
  isValidHash,
  getDuplicateFields,
} from '../../../../../../common/endpoint/service/artifacts/validations';

import { isSignerFieldExcluded } from '../../state/type_guards';

import {
  CONDITIONS_HEADER,
  CONDITIONS_HEADER_DESCRIPTION,
  DETAILS_HEADER,
  DETAILS_HEADER_DESCRIPTION,
  DESCRIPTION_LABEL,
  INPUT_ERRORS,
  NAME_LABEL,
  POLICY_SELECT_DESCRIPTION,
  SELECT_OS_LABEL,
  USING_ADVANCED_MODE,
  USING_ADVANCED_MODE_DESCRIPTION,
  TRUSTED_APPS_PROCESS_DESCENDANTS,
  TRUSTED_APPLICATIONS,
  TRUSTED_APPS_PROCESS_DESCENDANT_DECORATOR_LABELS,
} from '../translations';
import { OS_TITLES } from '../../../../common/translations';
import { CONFIRM_WARNING_MODAL_LABELS } from '../../../../components/artifact_list_page/components/artifact_confirm_modal';
import type { LogicalConditionBuilderProps } from './logical_condition';
import { LogicalConditionBuilder } from './logical_condition';
import { useTestIdGenerator } from '../../../../hooks/use_test_id_generator';
import type { EffectedPolicySelectProps } from '../../../../components/effected_policy_select';
import {
  EffectedPolicySelect,
  StyledButtonGroup,
} from '../../../../components/effected_policy_select';
import { ShowValueListModal } from '../../../../../value_list/components/show_value_list_modal';
import type { ArtifactFormComponentProps } from '../../../../components/artifact_list_page';
import { TrustedAppsArtifactsDocsLink } from './artifacts_docs_link';
import {
  isAdvancedModeEnabled,
  isProcessDescendantsEnabled,
} from '../../../../../../common/endpoint/service/artifacts/utils';
import {
  ADVANCED_MODE_TAG,
  PROCESS_DESCENDANT_EXTRA_ENTRY,
  PROCESS_DESCENDANT_EXTRA_ENTRY_TEXT,
  TRUSTED_PROCESS_DESCENDANTS_TAG,
} from '../../../../../../common/endpoint/service/artifacts/constants';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { TrustedAppsApiClient } from '../../service';
import { TRUSTED_APPS_LIST_TYPE } from '../../constants';
import { Loader } from '../../../../../common/components/loader';
import { computeHasDuplicateFields, getAddedFieldsCounts } from '../../../../common/utils';
import type { ExceptionEntries } from '../../../../../../common/endpoint/types/exception_list_items';
import { ProcessDescendantsIconTip } from '../../../../components/process_descendant_icontip';

interface FieldValidationState {
  /** If this fields state is invalid. Drives display of errors on the UI */
  isInvalid: boolean;
  errors: React.ReactNode[];
  warnings: React.ReactNode[];
}
interface ValidationResult {
  /** Overall indicator if form is valid */
  isValid: boolean;

  /** Individual form field validations */
  result: Partial<{
    [key in keyof NewTrustedApp]: FieldValidationState;
  }>;

  entryResults: Array<{
    errors: React.ReactNode[];
    warnings: React.ReactNode[];
    requiredError?: React.ReactNode;
  }>;

  /**  Additional Warning callout after submit */
  showWildcardWithWrongOperatorCalloutAndConfirmModal?: boolean;
  showUnnecessaryEscapingCalloutAndConfirmModal?: boolean;
}

const addResultToValidation = (
  validation: ValidationResult,
  field: keyof NewTrustedApp,
  type: 'warnings' | 'errors',
  resultValue: React.ReactNode,
  addToFront?: boolean
) => {
  if (!validation.result[field]) {
    validation.result[field] = {
      isInvalid: false,
      errors: [],
      warnings: [],
    };
  }
  const errorMarkup: React.ReactNode = type === 'warnings' ? <div>{resultValue}</div> : resultValue;

  if (addToFront) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    validation.result[field]![type].unshift(errorMarkup);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    validation.result[field]![type].push(errorMarkup);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  validation.result[field]!.isInvalid = true;
};

const addEntryResultToValidation = (
  validation: ValidationResult,
  index: number,
  type: 'warnings' | 'errors',
  resultValue: React.ReactNode
) => {
  validation.entryResults[index][type].push(resultValue);
};

export const validateValues = (values: ArtifactFormComponentProps['item']): ValidationResult => {
  let isValid: ValidationResult['isValid'] = true;
  const validation: ValidationResult = {
    isValid,
    result: {},
    entryResults: values.entries.map(() => ({ errors: [], warnings: [] })),
  };

  // Name field
  if (!values.name.trim()) {
    isValid = false;
    addResultToValidation(validation, 'name', 'errors', INPUT_ERRORS.name);
  }

  if (!values.os_types) {
    isValid = false;
    addResultToValidation(validation, 'os', 'errors', INPUT_ERRORS.os);
  }

  const os = ((values.os_types ?? [])[0] as OperatingSystem) ?? OperatingSystem.WINDOWS;

  if (
    isAdvancedModeEnabled(values) &&
    (values.entries as ExceptionEntries).some(
      (e) => e.type !== 'nested' && (e.value === '' || !e.value.length)
    )
  ) {
    isValid = false;
  }

  if (!values.entries.length) {
    isValid = false;
    addResultToValidation(validation, 'entries', 'errors', INPUT_ERRORS.field);
  } else if (!isAdvancedModeEnabled(values)) {
    const duplicated = getDuplicateFields(values.entries as TrustedAppConditionEntry[]);
    if (duplicated.length) {
      isValid = false;
      duplicated.forEach((field: ConditionEntryField) => {
        values.entries.forEach((entry, index) => {
          if (entry.field === field) {
            addEntryResultToValidation(
              validation,
              index,
              'errors',
              INPUT_ERRORS.noDuplicateField(field)
            );
          }
        });
      });
    }
    values.entries.forEach((entry, index) => {
      const entryValue = (entry as TrustedAppConditionEntry).value;

      if (!entry.field || !entryValue.trim()) {
        isValid = false;
        validation.entryResults[index].requiredError = INPUT_ERRORS.mustHaveValue(index);
        return;
      }

      if (hasControlCharacters(entryValue)) {
        isValid = false;
        addEntryResultToValidation(validation, index, 'errors', CONTROL_CHARACTER_ERROR);
        return;
      }

      const trimmedValue = entryValue.trim();
      const isValidPathEntry = isPathValid({
        os,
        field: entry.field as AllConditionEntryFields,
        type: entry.type as EntryTypes,
        value: trimmedValue,
      });

      if (
        validateHasWildcardWithWrongOperator({
          operator: entry.type as EntryTypes,
          value: trimmedValue,
        })
      ) {
        if (entry.field === ConditionEntryField.PATH) {
          validation.showWildcardWithWrongOperatorCalloutAndConfirmModal = true;
          addEntryResultToValidation(
            validation,
            index,
            'warnings',
            INPUT_ERRORS.wildcardWithWrongOperatorWarning(index)
          );
        } else {
          addEntryResultToValidation(
            validation,
            index,
            'warnings',
            INPUT_ERRORS.wildcardWithWrongField(index)
          );
        }
      }

      if (entry.field === ConditionEntryField.PATH && hasEntryEscaping(entry, [os])) {
        validation.showUnnecessaryEscapingCalloutAndConfirmModal = true;
      }

      if (entry.field === ConditionEntryField.HASH && !isValidHash(trimmedValue)) {
        isValid = false;
        addEntryResultToValidation(validation, index, 'errors', INPUT_ERRORS.invalidHash(index));
      } else if (!isValidPathEntry) {
        addEntryResultToValidation(validation, index, 'warnings', INPUT_ERRORS.pathWarning(index));
      } else if (
        isValidPathEntry &&
        !hasSimpleExecutableName({
          os,
          value: trimmedValue,
          type: entry.type as EntryTypes,
        })
      ) {
        if (entry.type === 'wildcard') {
          addEntryResultToValidation(
            validation,
            index,
            'warnings',
            INPUT_ERRORS.wildcardPathWarning(index)
          );
        } else {
          addEntryResultToValidation(
            validation,
            index,
            'warnings',
            INPUT_ERRORS.pathWarning(index)
          );
        }
      }
    });
  }

  if (validation.showWildcardWithWrongOperatorCalloutAndConfirmModal) {
    addResultToValidation(
      validation,
      'entries',
      'errors',
      <>
        <EuiSpacer size="s" />
        <WildCardWithWrongOperatorCallout />
      </>,
      true
    );
  }
  if (validation.showUnnecessaryEscapingCalloutAndConfirmModal) {
    addResultToValidation(
      validation,
      'entries',
      'errors',
      <>
        <EuiSpacer size="s" />
        <UnnecessaryEscapingCallout />
      </>,
      true
    );
  }
  validation.isValid = isValid;
  return validation;
};

const defaultConditionEntry = (): TrustedAppConditionEntry<ConditionEntryField.HASH> => ({
  field: ConditionEntryField.HASH,
  operator: 'included',
  type: 'match',
  value: '',
});

export const TrustedAppsForm = memo<ArtifactFormComponentProps>(
  ({ item, onChange, mode, error: submitError }) => {
    const isTAAdvancedModeFeatureFlagEnabled =
      useIsExperimentalFeatureEnabled('trustedAppsAdvancedMode');
    const isProcessDescendantsFeatureForTrustedAppsEnabled = useIsExperimentalFeatureEnabled(
      'filterProcessDescendantsForTrustedAppsEnabled'
    );
    const getTestId = useTestIdGenerator('trustedApps-form');
    const [visited, setVisited] = useState<
      Partial<{
        [key in keyof NewTrustedApp]: boolean;
      }>
    >({});
    const [hasFormChanged, setHasFormChanged] = useState(false);
    const showAssignmentSection = useCanAssignArtifactPerPolicy(item, mode, hasFormChanged);
    const isFormAdvancedMode: boolean = useMemo(() => isAdvancedModeEnabled(item), [item]);
    const { getTagsUpdatedBy, getMultipleTagsUpdatedBy } = useGetUpdatedTags(item);
    const [lastBasicFormConditions, setLastBasicFormConditions] = useState<
      ArtifactFormComponentProps['item']['entries']
    >(!isFormAdvancedMode ? item.entries : []);
    const [lastAdvancedFormConditions, setLastAdvancedFormConditions] = useState<
      ArtifactFormComponentProps['item']['entries']
    >(isFormAdvancedMode ? item.entries : []);
    const isProcessDescendantsSelected = useMemo(
      () => isProcessDescendantsEnabled(item, TRUSTED_PROCESS_DESCENDANTS_TAG),
      [item]
    );
    const [wasProcessDescendantsSelected, setWasProcessDescendantsSelected] = useState(
      isProcessDescendantsSelected
    );

    // Combine related state into a single object to reduce re-renders
    const [conditionsState, setConditionsState] = useState({
      areValid: !!item.entries.length,
      hasDuplicateFields: false,
      hasWildcardWithWrongOperator: hasWrongOperatorWithWildcard([item]),
      hasUnnecessaryEscaping: hasEscaping([item], item.os_types),
      hasPartialCodeSignatureWarning: hasPartialCodeSignatureEntry([item]),
    });

    const [validationResult, setValidationResult] = useState<ValidationResult>(() =>
      validateValues(item)
    );

    const {
      http,
      docLinks: { links },
    } = useKibana().services;
    const getSuggestionsFn = useCallback<ValueSuggestionsGetFn>(
      ({ field, query }) => {
        const trustedAppsAPIClient = new TrustedAppsApiClient(http);
        return trustedAppsAPIClient.getSuggestions({ field: field.name, query });
      },
      [http]
    );

    const autocompleteSuggestions = useSuggestions(getSuggestionsFn);

    // This value has to be memoized to avoid infinite useEffect loop on useFetchIndex
    const indexNames = useMemo(() => [eventsIndexPattern], []);
    const [isIndexPatternLoading, { indexPatterns }] = useFetchIndex(
      indexNames,
      undefined,
      ENDPOINT_FIELDS_SEARCH_STRATEGY
    );

    const selectedFormType = useMemo(() => {
      return isFormAdvancedMode ? 'advancedMode' : 'basicMode';
    }, [isFormAdvancedMode]);

    const advancedModeToggle = useMemo(
      () => [
        {
          id: 'basicMode',
          label: i18n.translate('xpack.securitySolution.trustedApps.flyoutForm.basicMode', {
            defaultMessage: 'Basic',
          }),
          iconType: selectedFormType === 'basicMode' ? 'checkCircleFill' : 'empty',
          'data-test-subj': 'basicModeButton',
        },
        {
          id: 'advancedMode',
          label: i18n.translate('xpack.securitySolution.trustedApps.flyoutForm.advancedMode', {
            defaultMessage: 'Advanced',
          }),
          iconType: selectedFormType === 'advancedMode' ? 'checkCircleFill' : 'empty',
          'data-test-subj': 'advancedModeButton',
        },
      ],
      [selectedFormType]
    );

    const processChanged = useCallback(
      (updatedFormValues?: ArtifactFormComponentProps['item']) => {
        const updatedItem = updatedFormValues
          ? {
              ...item,
              ...updatedFormValues,
            }
          : item;

        const updatedValidationResult: ValidationResult = validateValues(updatedItem);
        setValidationResult(updatedValidationResult);

        const shouldShowWildcardConfirmModal = isAdvancedModeEnabled(updatedItem)
          ? conditionsState.hasWildcardWithWrongOperator
          : updatedValidationResult.showWildcardWithWrongOperatorCalloutAndConfirmModal;

        const shouldShowUnnecessaryEscapingConfirmModal = isAdvancedModeEnabled(updatedItem)
          ? conditionsState.hasUnnecessaryEscaping
          : updatedValidationResult.showUnnecessaryEscapingCalloutAndConfirmModal;

        onChange({
          item: updatedItem,
          isValid: updatedValidationResult.isValid && conditionsState.areValid && hasFormChanged,
          confirmModalLabels:
            shouldShowWildcardConfirmModal || shouldShowUnnecessaryEscapingConfirmModal
              ? CONFIRM_WARNING_MODAL_LABELS(
                  i18n.translate(
                    'xpack.securitySolution.trustedApps.flyoutForm.confirmModal.name',
                    {
                      defaultMessage: 'trusted application',
                    }
                  ),
                  {
                    hasWildcardWithWrongOperator: shouldShowWildcardConfirmModal,
                    hasUnnecessaryEscaping: shouldShowUnnecessaryEscapingConfirmModal,
                  },
                  links
                )
              : undefined,
        });
      },
      [
        conditionsState.areValid,
        conditionsState.hasUnnecessaryEscaping,
        conditionsState.hasWildcardWithWrongOperator,
        hasFormChanged,
        item,
        links,
        onChange,
      ]
    );

    const handleEffectedPolicyOnChange: EffectedPolicySelectProps['onChange'] = useCallback(
      (updatedItem) => {
        processChanged(updatedItem);
        setHasFormChanged(true);
      },
      [processChanged]
    );

    const handleOnNameOrDescriptionChange = useCallback<
      ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
    >(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextItem = {
          ...item,
          [event.target.name]: event.target.value,
        };

        processChanged(nextItem);
        setHasFormChanged(true);
      },
      [item, processChanged]
    );

    const handleOnNameBlur = useCallback<NonNullable<EuiFieldTextProps['onBlur']>>(
      ({ target: { name } }) => {
        processChanged(item);
        setVisited((prevVisited) => ({ ...prevVisited, [name]: true }));
      },
      [item, processChanged]
    );

    const osOptions: Array<EuiSuperSelectOption<OperatingSystem>> = useMemo(
      () =>
        [OperatingSystem.LINUX, OperatingSystem.MAC, OperatingSystem.WINDOWS].map((os) => ({
          value: os,
          inputDisplay: OS_TITLES[os],
        })),
      []
    );

    const handleAdvancedModeChange = useCallback(
      (selectedId: string) => {
        // save current form to relevant state before switching
        if (selectedId === 'advancedMode') {
          setLastBasicFormConditions(item.entries);
          // set is process descendants state true if wasSelected before
        } else {
          setLastAdvancedFormConditions(item.entries);
          setWasProcessDescendantsSelected(isProcessDescendantsSelected);
        }

        const nextItem: ArtifactFormComponentProps['item'] = {
          ...item,
          entries:
            selectedId === 'advancedMode' ? lastAdvancedFormConditions : lastBasicFormConditions,
          tags: getMultipleTagsUpdatedBy([
            {
              tagType: 'advancedMode',
              newTags: selectedId === 'advancedMode' ? [ADVANCED_MODE_TAG] : [],
            },
            {
              tagType: 'trustedProcessDescendants',
              newTags:
                selectedId === 'advancedMode' && wasProcessDescendantsSelected
                  ? [TRUSTED_PROCESS_DESCENDANTS_TAG]
                  : [],
            },
          ]),
        };

        processChanged(nextItem);
        setHasFormChanged(true);
      },
      [
        lastAdvancedFormConditions,
        lastBasicFormConditions,
        getMultipleTagsUpdatedBy,
        isProcessDescendantsSelected,
        item,
        processChanged,
        wasProcessDescendantsSelected,
      ]
    );

    const handleOnOsChange = useCallback(
      (os: OperatingSystem) => {
        setVisited((prevVisited) => {
          return {
            ...prevVisited,
            os: true,
          };
        });

        const nextItem: ArtifactFormComponentProps['item'] = {
          ...item,
          os_types: [os],
          entries: [] as ArtifactFormComponentProps['item']['entries'],
        };

        switch (os) {
          case OperatingSystem.LINUX:
            nextItem.entries = item.entries.filter((entry) =>
              isSignerFieldExcluded(entry as TrustedAppConditionEntry)
            );
            if (item.entries.length === 0) {
              nextItem.entries.push(defaultConditionEntry());
            }
            break;
          case OperatingSystem.MAC:
            nextItem.entries = item.entries.map((entry) =>
              entry.field === ConditionEntryField.SIGNER
                ? { ...entry, field: ConditionEntryField.SIGNER_MAC }
                : entry
            );
            if (item.entries.length === 0) {
              nextItem.entries.push(defaultConditionEntry());
            }
            break;
          case OperatingSystem.WINDOWS:
            nextItem.entries = item.entries.map((entry) =>
              entry.field === ConditionEntryField.SIGNER_MAC
                ? { ...entry, field: ConditionEntryField.SIGNER }
                : entry
            );
            if (item.entries.length === 0) {
              nextItem.entries.push(defaultConditionEntry());
            }
            break;
          default:
            nextItem.entries.push(...item.entries);
            break;
        }

        processChanged(nextItem);
        setConditionsState((prev) => ({
          ...prev,
          hasUnnecessaryEscaping: hasEscaping([nextItem], nextItem.os_types),
        }));
        setHasFormChanged(true);
      },
      [item, processChanged]
    );

    const handleConditionBuilderOnVisited: LogicalConditionBuilderProps['onVisited'] =
      useCallback(() => {
        setVisited((prevState) => {
          return {
            ...prevState,
            entries: true,
          };
        });
      }, []);

    const handleEntryChange = useCallback<LogicalConditionBuilderProps['onEntryChange']>(
      (newEntry, oldEntry) => {
        const nextItem: ArtifactFormComponentProps['item'] = {
          ...item,
          entries: item.entries.map((e) => {
            if (e === oldEntry) {
              return newEntry;
            }
            return e;
          }),
        };

        processChanged(nextItem);
        setHasFormChanged(true);
      },
      [item, processChanged]
    );

    const handleEntryRemove = useCallback(
      (entry: NewTrustedApp['entries'][0]) => {
        const nextItem: ArtifactFormComponentProps['item'] = {
          ...item,
          entries: item.entries.filter((e) => e !== entry),
        };

        processChanged(nextItem);
        setHasFormChanged(true);
      },
      [item, processChanged]
    );

    const handleAndClick = useCallback(() => {
      const nextItem: ArtifactFormComponentProps['item'] = {
        ...item,
        entries: [],
      };
      const os = ((item.os_types ?? [])[0] as OperatingSystem) ?? OperatingSystem.WINDOWS;
      if (os === OperatingSystem.LINUX) {
        nextItem.entries = [
          ...item.entries.filter((entry) =>
            isSignerFieldExcluded(entry as TrustedAppConditionEntry)
          ),
          defaultConditionEntry(),
        ];
      } else {
        nextItem.entries = [...item.entries, defaultConditionEntry()];
      }
      processChanged(nextItem);
      setHasFormChanged(true);
    }, [item, processChanged]);

    const selectedOs = useMemo((): OperatingSystem => {
      if (!item?.os_types?.length) {
        return OperatingSystem.WINDOWS;
      }
      return item.os_types[0] as OperatingSystem;
    }, [item?.os_types]);

    const trustedApp = useMemo<ArtifactFormComponentProps['item']>(() => {
      const ta = item;

      ta.entries = item.entries.length
        ? (item.entries as TrustedAppConditionEntry[])
        : [defaultConditionEntry()];

      setConditionsState((prev) => ({ ...prev, areValid: !!ta.entries.length }));
      return ta;
    }, [item]);

    // Stabilized advanced mode conditions handler with proper change detection
    const handleOnBuilderChange = useCallback(
      (arg: OnChangeProps) => {
        // Early return for unnecessary calls to prevent infinite loops
        const isCalledWithoutChanges =
          (!hasFormChanged && arg.exceptionItems[0] === undefined) ||
          isEqual(arg.exceptionItems[0]?.entries, item?.entries);

        if (isCalledWithoutChanges) {
          const addedFields = arg.exceptionItems[0]?.entries.map((e) => e.field) || [''];

          if (isProcessDescendantsSelected) {
            addedFields.push(PROCESS_DESCENDANT_EXTRA_ENTRY.field);
          }

          setConditionsState((prev) => ({
            ...prev,
            hasDuplicateFields: computeHasDuplicateFields(getAddedFieldsCounts(addedFields)),
          }));
          return;
        } else {
          setConditionsState((prev) => ({
            ...prev,
            hasDuplicateFields: false,
          }));
        }

        // handle wildcard with wrong operator and partial code signature warnings
        setConditionsState((prev) => ({
          ...prev,
          hasWildcardWithWrongOperator: hasWrongOperatorWithWildcard(arg.exceptionItems),
          hasUnnecessaryEscaping: hasEscaping(arg.exceptionItems, item.os_types),
          hasPartialCodeSignatureWarning: hasPartialCodeSignatureEntry(arg.exceptionItems),
        }));

        const updatedItem: ArtifactFormComponentProps['item'] =
          arg.exceptionItems[0] !== undefined
            ? ({
                ...arg.exceptionItems[0],
                name: item?.name ?? '',
                description: item?.description ?? '',
                comments: item?.comments ?? [],
                os_types: item?.os_types ?? [OperatingSystem.WINDOWS],
                tags: item?.tags ?? [],
                meta: item.meta,
              } as ArtifactFormComponentProps['item'])
            : {
                ...item,
                entries: [{ field: '', operator: 'included', type: 'match', value: '' }],
              };
        const hasValidConditions =
          arg.exceptionItems[0] !== undefined
            ? !(arg.errorExists && !arg.exceptionItems[0]?.entries?.length)
            : false;

        setConditionsState((prev) => ({
          ...prev,
          areValid: hasValidConditions,
        }));
        processChanged(updatedItem);
        if (!hasFormChanged) {
          setHasFormChanged(true);
        }
      },
      [item, hasFormChanged, isProcessDescendantsSelected, processChanged]
    );

    // Stabilized memoization with minimal dependencies
    const exceptionBuilderComponentMemo = useMemo(
      () =>
        getExceptionBuilderComponentLazy({
          allowLargeValueLists: false,
          httpService: http,
          autocompleteService: autocompleteSuggestions,
          exceptionListItems: [trustedApp as ExceptionListItemSchema],
          listType: TRUSTED_APPS_LIST_TYPE,
          listId: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
          listNamespaceType: 'agnostic',
          indexPatterns,
          isOrDisabled: true,
          isOrHidden: true,
          isAndDisabled: false,
          isNestedDisabled: false,
          dataTestSubj: getTestId('exceptionBuilder') as string,
          idAria: 'alert-exception-builder',
          onChange: handleOnBuilderChange,
          operatorsList: ENDPOINT_ARTIFACT_OPERATORS,
          osTypes: trustedApp.os_types,
          showValueListModal: ShowValueListModal,
        }),
      [autocompleteSuggestions, getTestId, http, indexPatterns, trustedApp, handleOnBuilderChange]
    );

    const handleFilterTypeOnChange = useCallback(
      (id: string) => {
        const newTagsForDescendants = id === 'descendants' ? [TRUSTED_PROCESS_DESCENDANTS_TAG] : [];
        const tags = getTagsUpdatedBy('trustedProcessDescendants', newTagsForDescendants);
        processChanged({ ...item, tags });
        if (!hasFormChanged) setHasFormChanged(true);
      },
      [getTagsUpdatedBy, hasFormChanged, processChanged, item]
    );

    const filterTypeOptions = useMemo(
      () => [
        {
          id: 'trustedApps',
          label: <EuiText size="s">{TRUSTED_APPLICATIONS}</EuiText>,
          iconType: isProcessDescendantsSelected ? 'empty' : 'checkCircleFill',
          'data-test-subj': 'trustedApps-filterEventsButton',
        },
        {
          id: 'descendants',
          label: (
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiText size="s">{TRUSTED_APPS_PROCESS_DESCENDANTS}</EuiText>
              <ProcessDescendantsIconTip
                tooltipText={TRUSTED_APPS_PROCESS_DESCENDANT_DECORATOR_LABELS.tooltipText}
                versionInfo={TRUSTED_APPS_PROCESS_DESCENDANT_DECORATOR_LABELS.versionInfo}
                data-test-subj="trustedAppsProcessDescendantsTooltip"
              />
            </EuiFlexGroup>
          ),
          iconType: isProcessDescendantsSelected ? 'checkCircleFill' : 'empty',
          'data-test-subj': 'trustedApps-filterProcessDescendantsButton',
        },
      ],
      [isProcessDescendantsSelected]
    );

    const filterTypeSubsection = useMemo(() => {
      if (!isProcessDescendantsFeatureForTrustedAppsEnabled) return null;
      return (
        <>
          <EuiButtonGroup
            legend="Events or Process descendants selector"
            onChange={handleFilterTypeOnChange}
            options={filterTypeOptions}
            idSelected={isProcessDescendantsSelected ? 'descendants' : 'trustedApps'}
            data-test-subj="trustedApps-processDescendantsSelector"
          />
          <EuiSpacer size="m" />
          {isProcessDescendantsSelected && (
            <>
              <EuiText size="s">
                <FormattedMessage
                  id="xpack.securitySolution.trustedApps.filterProcessDescendants.additionalConditionDescription"
                  defaultMessage="Additional condition added:"
                />
              </EuiText>
              <code>{PROCESS_DESCENDANT_EXTRA_ENTRY_TEXT}</code>
              <EuiSpacer size="m" />
            </>
          )}
        </>
      );
    }, [
      isProcessDescendantsFeatureForTrustedAppsEnabled,
      handleFilterTypeOnChange,
      filterTypeOptions,
      isProcessDescendantsSelected,
    ]);

    useEffect(() => {
      processChanged();
    }, [processChanged]);

    if (isIndexPatternLoading || !trustedApp) {
      return <Loader size="xl" />;
    }

    return (
      <EuiForm
        component="div"
        data-test-subj={getTestId('')}
        error={
          submitError ? (
            <FormattedError error={submitError} data-test-subj={getTestId('submitError')} />
          ) : undefined
        }
        isInvalid={!!submitError}
      >
        <EuiTitle size="xs">
          <h3>{DETAILS_HEADER}</h3>
        </EuiTitle>
        <EuiSpacer size="xs" />
        {mode === 'create' && (
          <EuiText size="s" data-test-subj={getTestId('about')}>
            <p>
              {DETAILS_HEADER_DESCRIPTION}
              {
                <>
                  <EuiSpacer size="m" />
                  <TrustedAppsArtifactsDocsLink />
                </>
              }
            </p>
          </EuiText>
        )}
        <EuiSpacer size="m" />
        <EuiFormRow
          label={NAME_LABEL}
          fullWidth
          data-test-subj={getTestId('nameRow')}
          isInvalid={visited.name && validationResult.result.name?.isInvalid}
          error={validationResult.result.name?.errors}
        >
          <EuiFieldText
            isInvalid={visited.name && validationResult.result.name?.isInvalid}
            name="name"
            value={item.name}
            onChange={handleOnNameOrDescriptionChange}
            onBlur={handleOnNameBlur}
            fullWidth
            required={visited.name}
            maxLength={256}
            data-test-subj={getTestId('nameTextField')}
          />
        </EuiFormRow>
        <EuiFormRow
          label={DESCRIPTION_LABEL}
          fullWidth
          data-test-subj={getTestId('descriptionRow')}
        >
          <EuiTextArea
            name="description"
            value={item.description}
            onChange={handleOnNameOrDescriptionChange}
            fullWidth
            compressed
            maxLength={256}
            data-test-subj={getTestId('descriptionField')}
          />
        </EuiFormRow>
        <EuiHorizontalRule />
        <EuiText size="xs">
          <h3>{CONDITIONS_HEADER}</h3>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup>
          <EuiFlexItem grow={2}>
            <EuiText size="s">{CONDITIONS_HEADER_DESCRIPTION}</EuiText>
          </EuiFlexItem>
          {isTAAdvancedModeFeatureFlagEnabled && (
            <EuiFlexItem grow={1}>
              <EuiFormRow fullWidth>
                <StyledButtonGroup
                  legend="Advanced Mode Toggle"
                  data-test-subj={getTestId('advancedModeToggle')}
                  options={advancedModeToggle}
                  idSelected={selectedFormType}
                  onChange={handleAdvancedModeChange}
                />
              </EuiFormRow>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        {isTAAdvancedModeFeatureFlagEnabled && isFormAdvancedMode && (
          <>
            <EuiSpacer size="s" />
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiIcon type="warningFill" size="s" color="warning" aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText
                  size="s"
                  color="warning"
                  data-test-subj={getTestId('advancedModeUsageWarningHeader')}
                >
                  {USING_ADVANCED_MODE}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText
              size="s"
              color="warning"
              data-test-subj={getTestId('advancedModeUsageWarningBody')}
            >
              {USING_ADVANCED_MODE_DESCRIPTION}
            </EuiText>
          </>
        )}
        <EuiSpacer size="m" />
        <EuiFormRow
          label={SELECT_OS_LABEL}
          fullWidth
          data-test-subj={getTestId('OsRow')}
          isInvalid={visited?.os && validationResult.result.os?.isInvalid}
          error={validationResult.result.os?.errors}
        >
          <EuiSuperSelect
            name="os"
            options={osOptions}
            valueOfSelected={selectedOs}
            onChange={handleOnOsChange}
            fullWidth
            data-test-subj={getTestId('osSelectField')}
          />
        </EuiFormRow>

        <EuiSpacer size="m" />
        {isTAAdvancedModeFeatureFlagEnabled &&
          isFormAdvancedMode &&
          isProcessDescendantsFeatureForTrustedAppsEnabled &&
          filterTypeSubsection}

        <EuiFormRow
          fullWidth
          data-test-subj={getTestId('conditionsRow')}
          isInvalid={visited.entries && validationResult.result.entries?.isInvalid}
          error={validationResult.result.entries?.errors}
          helpText={validationResult.result.entries?.warnings}
        >
          {isTAAdvancedModeFeatureFlagEnabled && isFormAdvancedMode ? (
            <>
              {exceptionBuilderComponentMemo}

              <EuiFlexGroup direction="column" gutterSize="s">
                {conditionsState.hasWildcardWithWrongOperator && (
                  <WildCardWithWrongOperatorCallout />
                )}
                {conditionsState.hasUnnecessaryEscaping && <UnnecessaryEscapingCallout />}
                {conditionsState.hasPartialCodeSignatureWarning && <PartialCodeSignatureCallout />}
              </EuiFlexGroup>

              {conditionsState.hasDuplicateFields && (
                <>
                  <EuiSpacer size="xs" />
                  <EuiText
                    color="subdued"
                    size="xs"
                    data-test-subj="duplicate-fields-warning-message"
                  >
                    <FormattedMessage
                      id="xpack.securitySolution.eventFilters.warningMessage.duplicateFields"
                      defaultMessage="Using multiples of the same field values can degrade Endpoint performance and/or create ineffective rules"
                    />
                  </EuiText>
                </>
              )}
            </>
          ) : (
            <>
              <LogicalConditionBuilder
                entries={trustedApp.entries as NewTrustedApp['entries']}
                os={selectedOs}
                onAndClicked={handleAndClick}
                onEntryRemove={handleEntryRemove}
                onEntryChange={handleEntryChange}
                onVisited={handleConditionBuilderOnVisited}
                entryValidations={validationResult.entryResults}
                showRequiredErrors={visited.entries}
                data-test-subj={getTestId('conditionsBuilder')}
              />
            </>
          )}
        </EuiFormRow>
        {showAssignmentSection ? (
          <>
            <EuiHorizontalRule />
            <EuiFormRow fullWidth data-test-subj={getTestId('policySelection')}>
              <EffectedPolicySelect
                item={item}
                description={POLICY_SELECT_DESCRIPTION}
                data-test-subj={getTestId('effectedPolicies')}
                onChange={handleEffectedPolicyOnChange}
              />
            </EuiFormRow>
          </>
        ) : null}
      </EuiForm>
    );
  }
);

TrustedAppsForm.displayName = 'TrustedAppsForm';
