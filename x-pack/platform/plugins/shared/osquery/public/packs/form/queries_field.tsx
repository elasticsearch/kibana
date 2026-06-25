/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, findIndex, indexOf, pickBy, uniq, map } from 'lodash';
import type { EuiComboBoxProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiButton, EuiSpacer } from '@elastic/eui';
import { produce } from 'immer';
import React, { useCallback, useMemo, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import deepEqual from 'fast-deep-equal';
import { useController, useFormContext, useWatch, useFieldArray } from 'react-hook-form';

import { QUERY_TIMEOUT } from '../../../common/constants';
import { PackQueriesTable } from '../pack_queries_table';
import { QueryFlyout } from '../queries/query_flyout';
import { OsqueryPackUploader } from './pack_uploader';
import { getSupportedPlatforms } from '../queries/platforms';
import type { PackQueryFormData } from '../queries/use_pack_query_form';
import { serializeSchedule } from './schedule_serializer';
import type { ScheduleFormData } from '../../components/schedule_section/types';

interface QueriesFieldProps {
  euiFieldProps: EuiComboBoxProps<{}>;
}

const QueriesFieldComponent: React.FC<QueriesFieldProps> = ({ euiFieldProps }) => {
  const {
    field: { value: fieldValue },
  } = useController<{ queries: PackQueryFormData[] }, 'queries'>({
    name: 'queries',
    defaultValue: [],
    rules: {},
  });

  const { append, remove, update, replace } = useFieldArray({
    name: 'queries',
  });

  const { setValue } = useFormContext();
  const packName = useWatch({ name: 'name' });
  const packScheduleFormData = useWatch({ name: 'schedule' }) as ScheduleFormData | undefined;

  const packSchedule = useMemo(
    () => (packScheduleFormData ? serializeSchedule(packScheduleFormData) : undefined),
    [packScheduleFormData]
  );

  const handleNameChange = useCallback(
    (newName: string) => isEmpty(packName) && setValue('name', newName),
    [packName, setValue]
  );

  const isReadOnly = !!euiFieldProps?.isDisabled;
  const [showAddQueryFlyout, setShowAddQueryFlyout] = useState(false);
  const [showEditQueryFlyout, setShowEditQueryFlyout] = useState<number>(-1);
  const [tableSelectedItems, setTableSelectedItems] = useState<PackQueryFormData[]>([]);

  const handleShowAddFlyout = useCallback(() => setShowAddQueryFlyout(true), []);
  const handleHideAddFlyout = useCallback(() => setShowAddQueryFlyout(false), []);
  const handleHideEditFlyout = useCallback(() => setShowEditQueryFlyout(-1), []);

  const handleDeleteClick = useCallback(
    (query: any) => {
      const streamIndex = findIndex(fieldValue, ['id', query.id]);

      if (streamIndex > -1) {
        remove(streamIndex);
      }
    },
    [fieldValue, remove]
  );

  const handleEditClick = useCallback(
    (query: any) => {
      const streamIndex = findIndex(fieldValue, ['id', query.id]);

      setShowEditQueryFlyout(streamIndex);
    },
    [fieldValue]
  );

  const handleEditQuery = useCallback(
    (updatedQuery: any) =>
      new Promise<void>((resolve) => {
        if (showEditQueryFlyout >= 0) {
          update(
            showEditQueryFlyout,
            produce({}, (draft: PackQueryFormData) => {
              draft.id = updatedQuery.id;
              draft.interval = updatedQuery.interval;
              draft.query = updatedQuery.query;
              draft.timeout = updatedQuery.timeout;

              if (updatedQuery.platform?.length) {
                draft.platform = updatedQuery.platform;
              }

              if (updatedQuery.version?.length) {
                draft.version = updatedQuery.version;
              }

              if (updatedQuery.ecs_mapping) {
                draft.ecs_mapping = updatedQuery.ecs_mapping;
              }

              draft.snapshot = updatedQuery.snapshot;
              draft.removed = updatedQuery.removed;

              if (updatedQuery.schedule_type) {
                draft.schedule_type = updatedQuery.schedule_type;
              } else {
                delete draft.schedule_type;
              }

              if (updatedQuery.rrule_schedule) {
                draft.rrule_schedule = updatedQuery.rrule_schedule;
              } else {
                delete draft.rrule_schedule;
              }

              return draft;
            })
          );
        }

        handleHideEditFlyout();
        resolve();
      }),
    [handleHideEditFlyout, update, showEditQueryFlyout]
  );

  const handleAddQuery = useCallback(
    (newQuery: any) =>
      new Promise<void>((resolve) => {
        append(newQuery);
        handleHideAddFlyout();
        resolve();
      }),
    [handleHideAddFlyout, append]
  );

  const handleDeleteQueries = useCallback(() => {
    const idsToRemove = map(tableSelectedItems, (selectedItem) =>
      indexOf(fieldValue, selectedItem)
    );
    remove(idsToRemove);
    setTableSelectedItems([]);
  }, [fieldValue, remove, tableSelectedItems]);

  const handlePackUpload = useCallback(
    (parsedContent: any, uploadedPackName: any) => {
      replace(
        map(parsedContent.queries, (newQuery, newQueryId) =>
          pickBy(
            {
              id: newQueryId,
              interval: newQuery.interval ?? parsedContent.interval ?? '3600',
              timeout: newQuery.timeout ?? parsedContent.timeout ?? QUERY_TIMEOUT.DEFAULT,
              query: newQuery.query,
              version: newQuery.version ?? parsedContent.version,
              snapshot: newQuery.snapshot ?? parsedContent.snapshot,
              removed: newQuery.removed ?? parsedContent.removed,
              platform: getSupportedPlatforms(newQuery.platform ?? parsedContent.platform),
            },
            (value) => !isEmpty(value) || value === false
          )
        )
      );

      handleNameChange(uploadedPackName);
    },
    [handleNameChange, replace]
  );

  const tableData = useMemo(() => (fieldValue?.length ? fieldValue : []), [fieldValue]);
  const uniqueQueryIds = useMemo<string[]>(() => uniq(map(fieldValue, 'id')), [fieldValue]);

  return (
    <>
      {!isReadOnly && (
        <>
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              {!tableSelectedItems.length ? (
                <EuiButton
                  data-test-subj="add-query-button"
                  fill
                  onClick={handleShowAddFlyout}
                  iconType="plusCircle"
                >
                  <FormattedMessage
                    id="xpack.osquery.pack.queriesForm.addQueryButtonLabel"
                    defaultMessage="Add query"
                  />
                </EuiButton>
              ) : (
                <EuiButton color="danger" onClick={handleDeleteQueries} iconType="trash">
                  <FormattedMessage
                    id="xpack.osquery.pack.table.deleteQueriesButtonLabel"
                    defaultMessage="Delete {queriesCount, plural, one {# query} other {# queries}}"
                    // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
                    values={{
                      queriesCount: tableSelectedItems.length,
                    }}
                  />
                </EuiButton>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
        </>
      )}
      {fieldValue?.length ? (
        <PackQueriesTable
          data={tableData}
          isReadOnly={isReadOnly}
          onEditClick={handleEditClick}
          onDeleteClick={handleDeleteClick}
          selectedItems={tableSelectedItems}
          setSelectedItems={setTableSelectedItems}
          packSchedule={packSchedule}
        />
      ) : null}
      <EuiSpacer />
      {!isReadOnly && <OsqueryPackUploader onChange={handlePackUpload} />}
      {showAddQueryFlyout && (
        <QueryFlyout
          uniqueQueryIds={uniqueQueryIds}
          onSave={handleAddQuery}
          onClose={handleHideAddFlyout}
          packSchedule={packSchedule}
        />
      )}
      {showEditQueryFlyout != null && showEditQueryFlyout >= 0 && (
        <QueryFlyout
          uniqueQueryIds={uniqueQueryIds}
          // @ts-expect-error update types
          defaultValue={fieldValue[showEditQueryFlyout]}
          onSave={handleEditQuery}
          onClose={handleHideEditFlyout}
          packSchedule={packSchedule}
        />
      )}
    </>
  );
};

export const QueriesField = React.memo(QueriesFieldComponent, deepEqual);
