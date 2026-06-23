/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ComponentProps,
  ComponentType,
  FunctionComponent,
  Key,
  ReactElement,
  ReactNode,
} from 'react';
import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import type { CommonProps, EuiTablePaginationProps, Pagination } from '@elastic/eui';
import {
  EuiEmptyPrompt,
  EuiIcon,
  EuiProgress,
  EuiSpacer,
  EuiTablePagination,
  EuiText,
} from '@elastic/eui';
import styled from 'styled-components';
import { FormattedMessage } from '@kbn/i18n-react';
import { v4 as generateUUI } from 'uuid';
import { useTestIdGenerator } from '../../hooks/use_test_id_generator';
import type { MaybeImmutable } from '../../../../common/endpoint/types';
import { MANAGEMENT_DEFAULT_PAGE, MANAGEMENT_DEFAULT_PAGE_SIZE } from '../../common/constants';
import type { ArtifactEntryCardDecoratorProps } from '../artifact_entry_card';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentWithAnyProps = ComponentType<any>;

export interface PaginatedContentProps<T, C extends ComponentWithAnyProps> extends CommonProps {
  items: MaybeImmutable<T[]>;
  onChange: (changes: { pageIndex: number; pageSize: number }) => void;
  /**
   * The React Component that will be used to render the `items`. use `itemComponentProps` below to
   * define the props that will be given to this component
   */
  ItemComponent: C;
  /** A callback that will be used to retrieve the props for the `ItemComponent` */
  itemComponentProps: (item: T) => ComponentProps<C>;
  /** The item attribute that holds its unique value */
  itemId?: keyof T;
  loading?: boolean;
  pagination?: Pagination;
  noItemsMessage?: ReactNode;
  /** Error to be displayed in the component's body area. Used when `items` is empty and `children` is not used */
  error?: ReactNode;
  /** Classname applied to the area that holds the content items */
  contentClassName?: string;
  // Artifact specific decorations to display in the cards
  CardDecorator: React.ComponentType<ArtifactEntryCardDecoratorProps> | undefined;
  dataUpdatedAt?: number;
  /**
   * Children can be used to define custom content if the default creation of items is not sufficient
   * to accommodate a use case.
   *
   * **IMPORTANT** If defined several input props will be ignored, like `items`, `noItemsMessage`
   * and `error` among others
   */
  children?: ReactNode;
}

// Using `memo()` on generic typed Functional component is not supported (generic is lost),
// Work around below was created based on this discussion:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37087#issuecomment-568218789
interface TypedGenericComponentMemo {
  <T, C extends ComponentWithAnyProps>(p: PaginatedContentProps<T, C>): ReactElement<
    PaginatedContentProps<T, C>,
    FunctionComponent<PaginatedContentProps<T, C>>
  >;

  displayName: string;
}

const RootContainer = styled.div`
  position: relative;
  padding-top: ${({ theme }) => theme.eui.euiSizeXS};

  .body {
    min-height: ${({ theme }) => theme.eui.euiSizeXXL};

    &-content {
      position: relative;
    }
  }
`;

const DefaultNoItemsFound = memo<{ 'data-test-subj'?: string }>(
  ({ 'data-test-subj': dataTestSubj }) => {
    return (
      <EuiEmptyPrompt
        data-test-subj={dataTestSubj}
        title={
          <FormattedMessage
            id="xpack.securitySolution.endpoint.paginatedContent.noItemsFoundTitle"
            defaultMessage="No items found"
          />
        }
      />
    );
  }
);

DefaultNoItemsFound.displayName = 'DefaultNoItemsFound';

const ErrorMessage = memo<{ message: string; 'data-test-subj'?: string }>(
  ({ message, 'data-test-subj': dataTestSubj }) => {
    return (
      <EuiText textAlign="center" data-test-subj={dataTestSubj}>
        <EuiSpacer size="m" />
        <EuiIcon type="minusCircle" color="danger" aria-hidden={true} /> {message}
        <EuiSpacer size="m" />
      </EuiText>
    );
  }
);

ErrorMessage.displayName = 'ErrorMessage';

/**
 * A generic component to display paginated content. Provides "Items per Page" as well as pagination
 * controls similar to the BasicTable of EUI. The props supported by this component (for the most part)
 * support those that BasicTable accept.
 */
export const PaginatedContent = memo(
  <T extends object, C extends ComponentWithAnyProps>({
    items,
    ItemComponent,
    itemComponentProps,
    itemId,
    onChange,
    pagination,
    loading,
    noItemsMessage,
    error,
    contentClassName,
    'data-test-subj': dataTestSubj,
    'aria-label': ariaLabel,
    className,
    CardDecorator,
    dataUpdatedAt,
    children,
  }: PaginatedContentProps<T, C>) => {
    const [itemKeys] = useState<WeakMap<T, string>>(new WeakMap());

    const getTestId = useTestIdGenerator(dataTestSubj);

    const pageCount = useMemo(
      () => Math.ceil((pagination?.totalItemCount || 1) / (pagination?.pageSize || 1)),
      [pagination?.pageSize, pagination?.totalItemCount]
    );

    // If loading is done,
    // then check to ensure the pagination numbers are correct based by ensuring that the
    // `pageIndex` is not higher than the number of available pages.
    useEffect(() => {
      if (!loading && pageCount > 0 && pageCount < (pagination?.pageIndex || 0) + 1) {
        onChange({ pageIndex: pageCount - 1, pageSize: pagination?.pageSize || 0 });
      }
    }, [pageCount, onChange, pagination, loading]);

    const handleItemsPerPageChange = useCallback<
      NonNullable<EuiTablePaginationProps['onChangeItemsPerPage']>
    >(
      (pageSize) => {
        if (pagination?.pageIndex) {
          const pageIndex = Math.floor(
            ((pagination?.pageIndex ?? MANAGEMENT_DEFAULT_PAGE) *
              (pagination?.pageSize ?? MANAGEMENT_DEFAULT_PAGE_SIZE)) /
              pageSize
          );
          onChange({
            pageSize,
            pageIndex: isNaN(pageIndex) ? MANAGEMENT_DEFAULT_PAGE : pageIndex,
          });
        } else {
          onChange({ pageSize, pageIndex: MANAGEMENT_DEFAULT_PAGE });
        }
      },
      [onChange, pagination]
    );

    const handlePageChange = useCallback<NonNullable<EuiTablePaginationProps['onChangePage']>>(
      (pageIndex) => {
        onChange({ pageIndex, pageSize: pagination?.pageSize || MANAGEMENT_DEFAULT_PAGE_SIZE });
      },
      [onChange, pagination?.pageSize]
    );

    const generatedBodyItemContent = useMemo(() => {
      if (error) {
        if (error instanceof Error) {
          return <ErrorMessage message={error.message} data-test-subj={getTestId('error')} />;
        }
        return 'string' === typeof error ? (
          <ErrorMessage message={error} data-test-subj={getTestId('error')} />
        ) : (
          error
        );
      }

      // This casting here is needed in order to avoid the following a TS error (TS2322)
      // stating that the attributes given to the `ItemComponent` are not assignable to
      // type 'LibraryManagedAttributes<C, any>'
      // @see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/34553
      const Item = ItemComponent as ComponentType<ReturnType<typeof itemComponentProps>>;

      if (items.length) {
        // Cast here is to get around the fact that TS does not seem to be able to narrow the types down when the only
        // difference is that the array might be Readonly. The error output is:
        // `...has signatures, but none of those signatures are compatible with each other.`
        // Can read more about it here: https://github.com/microsoft/TypeScript/issues/33591
        return (items as T[]).map((item) => {
          let key: Key;

          if (itemId) {
            key = item[itemId] as unknown as Key;
          } else {
            if (itemKeys.has(item)) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              key = itemKeys.get(item)!;
            } else {
              key = generateUUI();
              itemKeys.set(item, key);
            }
          }

          const itemKey = dataUpdatedAt ? `${key}-${dataUpdatedAt}` : key;

          return <Item {...itemComponentProps(item)} key={itemKey} Decorator={CardDecorator} />;
        });
      }
      if (!loading)
        return noItemsMessage || <DefaultNoItemsFound data-test-subj={getTestId('noResults')} />;
    }, [
      error,
      ItemComponent,
      items,
      loading,
      noItemsMessage,
      getTestId,
      itemId,
      itemComponentProps,
      CardDecorator,
      itemKeys,
      dataUpdatedAt,
    ]);

    return (
      <RootContainer data-test-subj={dataTestSubj} aria-label={ariaLabel} className={className}>
        {loading && (
          <EuiProgress
            size="xs"
            color="primary"
            position="absolute"
            data-test-subj={getTestId('loader')}
          />
        )}

        <div className="body" data-test-subj={getTestId('body')}>
          <div className={`body-content ${contentClassName}`}>
            {children ? children : generatedBodyItemContent}
          </div>
        </div>

        {pagination && (children || items.length > 0) && (
          <div data-test-subj={getTestId('footer')}>
            <EuiSpacer size="l" />

            <EuiTablePagination
              activePage={pagination.pageIndex}
              itemsPerPage={pagination.pageSize}
              itemsPerPageOptions={pagination.pageSizeOptions}
              pageCount={pageCount}
              showPerPageOptions={pagination.showPerPageOptions}
              onChangeItemsPerPage={handleItemsPerPageChange}
              onChangePage={handlePageChange}
            />
          </div>
        )}
      </RootContainer>
    );
  }
  // See type description above to understand why this casting is needed
) as TypedGenericComponentMemo;

PaginatedContent.displayName = 'PaginatedContent';
