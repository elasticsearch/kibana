/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BehaviorSubject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import type { BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import type { HttpStart, NotificationsStart } from '@kbn/core/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataTableRecord } from '@kbn/discover-utils';
import { ROW_PLACEHOLDER_PREFIX } from '../constants';
import { IndexUpdateService } from './index_update_service';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import {
  analyticsServiceMock,
  httpServiceMock,
  notificationServiceMock,
} from '@kbn/core/public/mocks';
import { IndexEditorTelemetryService } from '../telemetry/telemetry_service';
import type { AnalyticsServiceStart } from '@kbn/core/server';
import { getESQLAdHocDataview } from '@kbn/esql-utils';
import { LOOKUP_INDEX_RECREATE_ROUTE } from '@kbn/esql-types';

jest.mock('@kbn/esql-utils', () => {
  const actual = jest.requireActual('@kbn/esql-utils');
  return {
    ...actual,
    getESQLAdHocDataview: jest.fn(),
  };
});

describe('IndexUpdateService', () => {
  let http: HttpStart;
  let data: DataPublicPluginStart;
  let service: IndexUpdateService;
  let notifications: NotificationsStart;
  let analytics: AnalyticsServiceStart;
  let indexEditorTelemetryService: IndexEditorTelemetryService;

  beforeEach(() => {
    http = httpServiceMock.createStartContract();
    data = dataPluginMock.createStartContract();
    notifications = notificationServiceMock.createStartContract();
    analytics = analyticsServiceMock.createAnalyticsServiceStart();
    indexEditorTelemetryService = new IndexEditorTelemetryService(
      analytics,
      true,
      true,
      'esql_hover'
    );

    (getESQLAdHocDataview as jest.Mock).mockResolvedValue({
      fields: {
        getByName: () => {},
        create: () => ({}),
        concat: () => [],
      },
    });

    service = new IndexUpdateService(http, data, notifications, indexEditorTelemetryService, true);
  });

  afterEach(() => {
    service.destroy();
    jest.clearAllMocks();
  });

  describe('ESQL query', () => {
    it('emits ESQL query with metadata once the index is created', async () => {
      service.setIndexName('my-index');
      service.setIndexCreated(true);
      service.setFilterQuery({ query: '200', language: 'kuery' });
      service.setSort([['@timestamp' as any, 'desc']]);

      const query = await firstValueFrom(service.esqlQuery$);

      expect(query.toLowerCase()).toBe(
        'from "my-index" metadata _id, _source | where kql("200") | limit 1000 | sort @timestamp desc'
      );
    });

    it('emits Discover ESQL query without metadata', async () => {
      service.setIndexName('logs-*');
      service.setFilterQuery({ query: 'host.name: "test"', language: 'kuery' });

      const query = await firstValueFrom(service.esqlDiscoverQuery$);

      expect(query).toBe('FROM "logs-*" | WHERE KQL("host.name: \\"test\\"") | LIMIT 1000');
    });
  });

  describe('Unsaved changes', () => {
    it('unsaved changes should be false after adding a new empty row', async () => {
      const initial = await firstValueFrom(service.hasUnsavedChanges$);
      expect(initial).toBe(false);

      service.addEmptyRow(1);

      const afterAdd = await firstValueFrom(service.hasUnsavedChanges$);
      expect(afterAdd).toBe(false);
    });

    it('marks unsaved changes after updating a doc', async () => {
      const initial = await firstValueFrom(service.hasUnsavedChanges$);
      expect(initial).toBe(false);

      service.updateDoc('1', { a: 'b' });

      const afterAdd = await firstValueFrom(service.hasUnsavedChanges$);
      expect(afterAdd).toBe(true);
    });

    it('does not mark unsaved changes if the only change is adding a new column', async () => {
      const initial = await firstValueFrom(service.hasUnsavedChanges$);
      expect(initial).toBe(false);

      service.addNewColumn('column1', 'keyword');

      const afterAdd = await firstValueFrom(service.hasUnsavedChanges$);
      expect(afterAdd).toBe(false);
    });

    it('clears unsaved changes when an edited value is reverted to its original', async () => {
      // Seed a fetched document so edits can be compared against the stored value
      const docsSubject = (service as unknown as { _docs$: BehaviorSubject<DataTableRecord[]> })
        ._docs$;
      docsSubject.next([
        { id: '1', raw: { name: 'Boris' }, flattened: { name: 'Boris' } } as DataTableRecord,
      ]);

      // Editing the value to something new marks the doc as dirty
      service.updateDoc('1', { name: 'DBoris' });
      expect(await firstValueFrom(service.hasUnsavedChanges$)).toBe(true);
      expect(service.isDirtyRow('1')).toBe(true);

      // Reverting the value back to the original clears the dirty state
      service.updateDoc('1', { name: 'Boris' });
      expect(await firstValueFrom(service.hasUnsavedChanges$)).toBe(false);
      expect(service.isDirtyRow('1')).toBe(false);
    });

    it('does not mark unsaved changes if the only change is deleting a placeholder row', async () => {
      const initial = await firstValueFrom(service.hasUnsavedChanges$);
      expect(initial).toBe(false);

      service.addEmptyRow(1);
      const placeholderRow = (await firstValueFrom(service.rows$))[0];

      service.deleteDoc([placeholderRow.id]);

      const afterAdd = await firstValueFrom(service.hasUnsavedChanges$);
      expect(afterAdd).toBe(false);
    });
  });

  it('Handles rows successive modifications in a correct manner', async () => {
    const rows = await firstValueFrom(service.rows$);
    expect(rows.length).toBe(1);
    expect(rows[0].raw).toEqual({});

    service.updateDoc(rows[0].id, { foo: 'bar' });
    service.updateDoc(rows[0].id, { foo2: 'bar2' });

    const rowsAfterEdition = await firstValueFrom(service.rows$);
    expect(rowsAfterEdition.length).toBe(1);
    expect(rowsAfterEdition[0].raw).toEqual({ foo: 'bar', foo2: 'bar2' });

    service.deleteDoc([rowsAfterEdition[0].id]);
    const rowsAfterDeletion = await firstValueFrom(service.rows$);
    expect(rowsAfterDeletion.length).toBe(1); // An empty placeholder row should always be visible
    expect(rowsAfterDeletion[0].id).toEqual(expect.stringContaining(ROW_PLACEHOLDER_PREFIX));
  });

  describe('flush operations', () => {
    it('should call telemetry on successful flush', async () => {
      (http.post as jest.Mock).mockResolvedValue({
        errors: false,
        items: [],
        took: 0,
      } satisfies BulkResponse);
      const telemetrySpy = jest.spyOn(indexEditorTelemetryService, 'trackSaveSubmitted');

      service.setIndexName('my-index');
      service.setIndexCreated(true);
      await firstValueFrom(service.dataView$);

      // Modifying the placeholder row counts as 1 row added and 0 cells edited
      const placeholderRow = (await firstValueFrom(service.rows$))[0];
      service.updateDoc(placeholderRow.id, { field: 'value' });

      // Adding a column and editing its name counts as 1 col added
      service.addNewColumn('column1', 'keyword');
      const newColumn = (await firstValueFrom(service.pendingColumnsToBeSaved$))[0];
      service.editColumn('newColumn', newColumn.name, 'keyword');

      // Counts as 2 cell edited
      service.updateDoc('123', { field: 'value' });
      service.updateDoc('123', { newColumn: 'value' });

      // Wait for the changes to be registered
      await firstValueFrom(service.hasUnsavedChanges$);

      // Save the changes
      service.flush();

      // wait for async operations to complete
      await new Promise((resolve) => process.nextTick(resolve));

      expect(telemetrySpy).toHaveBeenCalledWith({
        pendingRowsAdded: 1,
        pendingColsAdded: 1,
        pendingCellsEdited: 2,
        action: 'save',
        outcome: 'success',
        latency: expect.any(Number),
      });
    });
  });

  describe('resetIndexMapping', () => {
    it('should recreate index, refresh dataview, discard changes and refetch when index is created', async () => {
      service.setIndexName('my-index');
      service.setIndexCreated(true);

      await service.resetIndexMapping();

      // Verify the recreate endpoint was called
      expect(http.post).toHaveBeenCalledWith(`${LOOKUP_INDEX_RECREATE_ROUTE}/my-index`);

      // Verify unsaved changes were discarded
      const hasChangesAfterReset = await firstValueFrom(service.hasUnsavedChanges$);
      expect(hasChangesAfterReset).toBe(false);
    });

    it('should not call recreate endpoint if index is not created', async () => {
      service.setIndexName('my-index');

      await service.resetIndexMapping();

      // Verify the recreate endpoint was not called
      expect(http.post).not.toHaveBeenCalled();

      // Verify unsaved changes were discarded
      const hasChangesAfterReset = await firstValueFrom(service.hasUnsavedChanges$);
      expect(hasChangesAfterReset).toBe(false);
    });
  });
});
