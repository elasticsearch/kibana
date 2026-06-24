/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElementType } from 'react';
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import styled from '@emotion/styled';
import type { HttpStart } from '@kbn/core/public';
import { addIdToItem } from '@kbn/securitysolution-utils';
import type {
  ExceptionListItemSchema,
  ExceptionListType,
  NamespaceType,
  OsTypeArray,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  ListOperatorEnum as OperatorEnum,
  ListOperatorTypeEnum as OperatorTypeEnum,
  entriesNested,
  exceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import type {
  CreateExceptionListItemBuilderSchema,
  DataViewField,
  ExceptionsBuilderExceptionItem,
  ExceptionsBuilderReturnExceptionItem,
  OperatorOption,
} from '@kbn/securitysolution-list-utils';
import {
  containsValueListEntry,
  filterExceptionItems,
  getDefaultEmptyEntry,
  getDefaultNestedEmptyEntry,
  getNewExceptionItem,
} from '@kbn/securitysolution-list-utils';
import type { DataViewBase } from '@kbn/es-query';
import type { AutocompleteStart } from '@kbn/kql/public';
import deepEqual from 'fast-deep-equal';

import { AndOrBadge } from '../and_or_badge';

import { BuilderExceptionListItemComponent } from './exception_item_renderer';
import { BuilderLogicButtons } from './logic_buttons';
import { getTotalErrorExist } from './selectors';
import type { EntryFieldError, State } from './reducer';
import { exceptionsBuilderReducer } from './reducer';

const MyInvisibleAndBadge = styled(EuiFlexItem)`
  visibility: hidden;
`;

const MyAndBadge = styled(AndOrBadge)`
  & > .euiFlexItem {
    margin: 0;
  }
`;

const MyButtonsContainer = styled(EuiFlexItem)`
  margin: 8px 0;
`;

const initialState: State = {
  addNested: false,
  andLogicIncluded: false,
  disableAnd: false,
  disableNested: false,
  disableOr: false,
  errors: {},
  exceptions: [],
  exceptionsToDelete: [],
  warningExists: 0,
};

export interface OnChangeProps {
  errorExists: boolean;
  exceptionItems: ExceptionsBuilderReturnExceptionItem[];
  exceptionsToDelete: ExceptionListItemSchema[];
  warningExists: boolean;
}

export interface ExceptionBuilderProps {
  allowLargeValueLists: boolean;
  autocompleteService: AutocompleteStart;
  exceptionListItems: ExceptionsBuilderExceptionItem[];
  httpService: HttpStart;
  osTypes?: OsTypeArray;
  indexPatterns: DataViewBase;
  isAndDisabled: boolean;
  isNestedDisabled: boolean;
  isOrDisabled: boolean;
  isOrHidden?: boolean;
  listId: string | undefined;
  listNamespaceType: NamespaceType | undefined;
  listType: ExceptionListType;
  onChange: (arg: OnChangeProps) => void;
  ruleName?: string;
  isDisabled?: boolean;
  operatorsList?: OperatorOption[];
  exceptionItemName?: string;
  allowCustomFieldOptions?: boolean;
  getExtendedFields?: (fields: string[]) => Promise<DataViewField[]>;
  showValueListModal: ElementType;
}

export const ExceptionBuilderComponent = ({
  allowLargeValueLists,
  autocompleteService,
  exceptionListItems,
  httpService,
  indexPatterns,
  isAndDisabled,
  isNestedDisabled,
  isOrDisabled,
  isOrHidden = false,
  listId,
  listNamespaceType,
  listType,
  onChange,
  ruleName,
  exceptionItemName,
  isDisabled = false,
  osTypes,
  operatorsList,
  allowCustomFieldOptions = false,
  getExtendedFields,
  showValueListModal,
}: ExceptionBuilderProps): JSX.Element => {
  const [state, dispatch] = useReducer(exceptionsBuilderReducer(), {
    ...initialState,
    disableAnd: isAndDisabled,
    disableNested: isNestedDisabled,
    disableOr: isOrDisabled,
  });
  const [areAllEntriesDeleted, setAreAllEntriesDeleted] = useState<boolean>(false);

  const {
    addNested,
    andLogicIncluded,
    disableAnd,
    disableNested,
    disableOr,
    warningExists,
    exceptions,
    exceptionsToDelete,
  } = state;

  const errorExists = getTotalErrorExist(state);

  const setErrorsExist = useCallback(
    (error: EntryFieldError): void => {
      dispatch({
        error,
        type: 'setErrorsExist',
      });
    },
    [dispatch]
  );

  const setWarningsExist = useCallback(
    (hasWarnings: boolean): void => {
      dispatch({
        type: 'setWarningsExist',
        warningExists: hasWarnings,
      });
    },
    [dispatch]
  );

  const setUpdateExceptions = useCallback(
    (items: ExceptionsBuilderExceptionItem[]): void => {
      dispatch({
        exceptions: items,
        type: 'setExceptions',
      });
    },
    [dispatch]
  );

  const setDefaultExceptions = useCallback(
    (item: ExceptionsBuilderExceptionItem): void => {
      dispatch({
        initialState,
        lastException: item,
        type: 'setDefault',
      });
    },
    [dispatch]
  );

  const setUpdateExceptionsToDelete = useCallback(
    (items: ExceptionListItemSchema[]): void => {
      dispatch({
        exceptions: items,
        type: 'setExceptionsToDelete',
      });
    },
    [dispatch]
  );

  const setUpdateAndDisabled = useCallback(
    (shouldDisable: boolean): void => {
      dispatch({
        shouldDisable,
        type: 'setDisableAnd',
      });
    },
    [dispatch]
  );

  const setUpdateOrDisabled = useCallback(
    (shouldDisable: boolean): void => {
      dispatch({
        shouldDisable,
        type: 'setDisableOr',
      });
    },
    [dispatch]
  );

  const setUpdateAddNested = useCallback(
    (shouldAddNested: boolean): void => {
      dispatch({
        addNested: shouldAddNested,
        type: 'setAddNested',
      });
    },
    [dispatch]
  );

  const handleExceptionItemChange = useCallback(
    (item: ExceptionsBuilderExceptionItem, index: number): void => {
      const updatedExceptions = [
        ...exceptions.slice(0, index),
        {
          ...item,
        },
        ...exceptions.slice(index + 1),
      ];
      setUpdateExceptions(updatedExceptions);
    },
    [setUpdateExceptions, exceptions]
  );

  const handleDeleteExceptionItem = useCallback(
    (item: ExceptionsBuilderExceptionItem, itemIndex: number): void => {
      if (item.entries.length === 0) {
        const updatedExceptions = [
          ...exceptions.slice(0, itemIndex),
          ...exceptions.slice(itemIndex + 1),
        ];

        // if it's the only exception item left, don't delete it
        // just add a default entry to it
        if (updatedExceptions.length === 0) {
          setDefaultExceptions(item);
          setAreAllEntriesDeleted(true);
        } else if (updatedExceptions.length > 0 && exceptionListItemSchema.is(item)) {
          setUpdateExceptionsToDelete([...exceptionsToDelete, item]);
        } else {
          setUpdateExceptions([
            ...exceptions.slice(0, itemIndex),
            ...exceptions.slice(itemIndex + 1),
          ]);
        }
      } else {
        handleExceptionItemChange(item, itemIndex);
      }
    },
    [
      handleExceptionItemChange,
      setUpdateExceptions,
      setUpdateExceptionsToDelete,
      exceptions,
      exceptionsToDelete,
      setDefaultExceptions,
    ]
  );

  const handleAddNewExceptionItemEntry = useCallback(
    (isNested = false): void => {
      const lastException = exceptions[exceptions.length - 1];
      const { entries } = lastException;

      const updatedException: ExceptionsBuilderExceptionItem = {
        ...lastException,
        entries: [...entries, isNested ? getDefaultNestedEmptyEntry() : getDefaultEmptyEntry()],
      };
      setUpdateExceptions([...exceptions.slice(0, exceptions.length - 1), { ...updatedException }]);
    },
    [setUpdateExceptions, exceptions]
  );

  const handleAddNewExceptionItem = useCallback((): void => {
    // There is a case where there are numerous exception list items, all with
    // empty `entries` array. Thought about appending an entry item to one, but that
    // would then be arbitrary, decided to just create a new exception list item
    const newException = getNewExceptionItem({
      listId,
      name: exceptionItemName ?? `${ruleName ?? 'Rule'} - Exception item`,
      namespaceType: listNamespaceType,
    });

    setUpdateExceptions([...exceptions, { ...newException }]);
  }, [setUpdateExceptions, exceptions, listId, listNamespaceType, ruleName, exceptionItemName]);

  // The builder can have existing exception items, or new exception items that have yet
  // to be created (and thus lack an id), this was creating some React bugs with relying
  // on the index, as a result, created a temporary id when new exception items are first
  // instantiated that is stored in `meta` that gets stripped on it's way out
  const getExceptionListItemId = (item: ExceptionsBuilderExceptionItem, index: number): string => {
    if ((item as ExceptionListItemSchema).id != null) {
      return (item as ExceptionListItemSchema).id;
    } else if ((item as CreateExceptionListItemBuilderSchema).meta.temporaryUuid != null) {
      return (item as CreateExceptionListItemBuilderSchema).meta.temporaryUuid;
    } else {
      return `${index}`;
    }
  };

  const handleAddNestedExceptionItemEntry = useCallback((): void => {
    const lastException = exceptions[exceptions.length - 1];
    const { entries } = lastException;
    const lastEntry = entries[entries.length - 1];

    if (entriesNested.is(lastEntry)) {
      const updatedException: ExceptionsBuilderExceptionItem = {
        ...lastException,
        entries: [
          ...entries.slice(0, entries.length - 1),
          {
            ...lastEntry,
            entries: [
              ...lastEntry.entries,
              addIdToItem({
                field: '',
                operator: OperatorEnum.INCLUDED,
                type: OperatorTypeEnum.MATCH,
                value: '',
              }),
            ],
          },
        ],
      };
      setUpdateExceptions([...exceptions.slice(0, exceptions.length - 1), { ...updatedException }]);
    } else {
      setUpdateExceptions(exceptions);
    }
  }, [setUpdateExceptions, exceptions]);

  const handleAddNestedClick = useCallback((): void => {
    setUpdateAddNested(true);
    setUpdateOrDisabled(true);
    setUpdateAndDisabled(true);
    handleAddNewExceptionItemEntry(true);
  }, [
    handleAddNewExceptionItemEntry,
    setUpdateAndDisabled,
    setUpdateOrDisabled,
    setUpdateAddNested,
  ]);

  const handleAddClick = useCallback((): void => {
    setUpdateAddNested(false);
    setUpdateOrDisabled(false);
    handleAddNewExceptionItemEntry();
  }, [handleAddNewExceptionItemEntry, setUpdateOrDisabled, setUpdateAddNested]);

  const memoExceptionItems = useMemo(() => {
    return filterExceptionItems(exceptions);
  }, [exceptions]);

  // useEffect(() => {
  //   setUpdateExceptions([]);
  // }, [osTypes, setUpdateExceptions]);

  // Bubble up changes to parent
  useEffect(() => {
    onChange({
      errorExists: errorExists > 0,
      exceptionItems: memoExceptionItems,
      exceptionsToDelete,
      warningExists: warningExists > 0,
    });
  }, [onChange, exceptionsToDelete, memoExceptionItems, errorExists, warningExists]);

  // Defaults builder to never be sans entry, instead
  // always falls back to an empty entry if user deletes all
  useEffect(() => {
    if (
      exceptions.length === 0 ||
      (exceptions.length === 1 &&
        exceptions[0].entries != null &&
        exceptions[0].entries.length === 0)
    ) {
      handleAddNewExceptionItem();
    }
  }, [exceptions, handleAddNewExceptionItem]);

  /**
   * This component relies on the "exceptionListItems" to pre-fill its entries,
   *  but any subsequent updates to the entries are not reflected back to
   * the "exceptionListItems". To ensure correct behavior, we need to only
   * fill the entries from the "exceptionListItems" during initialization.
   *
   * In the initialization phase, if there are "exceptionListItems" with
   * pre-filled entries, the exceptions array will be empty. However,
   * there are cases where the "exceptionListItems" may not be sent
   * correctly during initialization, leading to the exceptions
   * array being filled with empty entries. Therefore, we need to
   *  check if the exception is correctly populated with a valid
   * "field" when the "exceptionListItems" has entries. that's why
   * "exceptionsEntriesPopulated" is used
   *
   * It's important to differentiate this case from when the user
   * deletes all the entries and the "exceptionListItems" has pre-filled values.
   * that's why "allEntriesDeleted" is used
   *
   *  deepEqual(exceptionListItems, exceptions) to handle the exceptionListItems in
   * the EventFiltersFlyout
   */
  useEffect(() => {
    if (!exceptionListItems.length || deepEqual(exceptionListItems, exceptions)) return;
    const exceptionsEntriesPopulated = exceptions.some((exception) =>
      exception.entries.some((entry) => entry.field)
    );
    if (!exceptionsEntriesPopulated && !areAllEntriesDeleted)
      setUpdateExceptions(exceptionListItems);
  }, [areAllEntriesDeleted, exceptionListItems, exceptions, setUpdateExceptions]);

  return (
    <EuiFlexGroup gutterSize="s" direction="column" data-test-subj="exceptionsBuilderWrapper">
      {exceptions.map((exceptionListItem, index) => (
        <EuiFlexItem grow={1} key={getExceptionListItemId(exceptionListItem, index)}>
          <EuiFlexGroup gutterSize="s" direction="column">
            {index !== 0 &&
              (andLogicIncluded ? (
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="none" direction="row">
                    <MyInvisibleAndBadge grow={false}>
                      <MyAndBadge includeAntennas type="and" />
                    </MyInvisibleAndBadge>
                    <EuiFlexItem grow={false}>
                      <MyAndBadge type="or" />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              ) : (
                <EuiFlexItem grow={false}>
                  <MyAndBadge type="or" />
                </EuiFlexItem>
              ))}
            <EuiFlexItem grow={false}>
              <BuilderExceptionListItemComponent
                allowLargeValueLists={allowLargeValueLists}
                andLogicIncluded={andLogicIncluded}
                autocompleteService={autocompleteService}
                exceptionItem={exceptionListItem}
                exceptionItemIndex={index}
                httpService={httpService}
                indexPattern={indexPatterns}
                isOnlyItem={exceptions.length === 1}
                key={getExceptionListItemId(exceptionListItem, index)}
                listType={listType}
                onChangeExceptionItem={handleExceptionItemChange}
                onDeleteExceptionItem={handleDeleteExceptionItem}
                onlyShowListOperators={containsValueListEntry(exceptions)}
                setErrorsExist={setErrorsExist}
                setWarningsExist={setWarningsExist}
                osTypes={osTypes}
                isDisabled={isDisabled}
                operatorsList={operatorsList}
                allowCustomOptions={allowCustomFieldOptions}
                getExtendedFields={getExtendedFields}
                showValueListModal={showValueListModal}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      ))}

      <MyButtonsContainer data-test-subj={`andOrOperatorButtons`}>
        <EuiFlexGroup gutterSize="s">
          {andLogicIncluded && (
            <MyInvisibleAndBadge grow={false}>
              <AndOrBadge includeAntennas type="and" />
            </MyInvisibleAndBadge>
          )}
          <EuiFlexItem grow={1}>
            <BuilderLogicButtons
              isOrDisabled={isOrDisabled ? isOrDisabled : disableOr}
              isOrHidden={isOrHidden}
              isAndDisabled={isAndDisabled ? isAndDisabled : disableAnd}
              isNestedDisabled={isNestedDisabled ? isNestedDisabled : disableNested}
              isNested={addNested}
              showNestedButton
              onOrClicked={handleAddNewExceptionItem}
              onAndClicked={handleAddClick}
              onNestedClicked={handleAddNestedClick}
              onAddClickWhenNested={handleAddNestedExceptionItemEntry}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </MyButtonsContainer>
    </EuiFlexGroup>
  );
};

ExceptionBuilderComponent.displayName = 'ExceptionBuilder';

// eslint-disable-next-line import/no-default-export
export default ExceptionBuilderComponent;
