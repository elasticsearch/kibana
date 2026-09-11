/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '../..';
import { DataGrid } from '../data_grid';
import { SavedObjectSaveModal } from '../saved_object_save_modal';
import { KibanaCodeEditorWrapper } from '../../ui_components';
import { QueryBar } from '../query_bar';
import { UnifiedTabs } from '../unified_tabs';

export type DiscoverQueryMode = 'esql' | 'classic';

export interface DiscoverGotoOptions {
  queryMode: DiscoverQueryMode;
  /** Open a Discover session by id (`#/view/{id}`) instead of a blank Discover page. */
  savedSearchId?: string;
}

export interface DataViewOptions {
  /** Data view title; `*` is appended automatically by the editor. */
  name: string;
  /** Create a temporary ("ad hoc") data view via "Explore" instead of saving. */
  adHoc?: boolean;
}

export interface TimeoutOptions {
  timeout?: number;
}

export const DEFAULT_SAVE_MODAL_TIMEOUT = 30_000;
export const DISCOVER_QUERY_MODE_KEY = 'discover.defaultQueryMode';

/**
 * Base class for DiscoverApp that holds shared dependencies and typed properties.
 * Do not instantiate directly — use {@link DiscoverApp} instead.
 */
export class DiscoverAppBase {
  public readonly codeEditor: KibanaCodeEditorWrapper;
  protected readonly dataGrid: DataGrid;
  protected readonly queryBar: QueryBar;
  protected readonly unifiedTabs: UnifiedTabs;
  protected readonly interactiveSaveMenuItem;
  protected readonly saveButtonSecondary;
  /** Save modal locators/actions, shared with other apps (e.g. Maps) via `SavedObjectSaveModal`. */
  public readonly saveModal: SavedObjectSaveModal;

  constructor(protected readonly page: ScoutPage) {
    this.codeEditor = new KibanaCodeEditorWrapper(page);
    this.dataGrid = new DataGrid(page);
    this.queryBar = new QueryBar(page);
    this.unifiedTabs = new UnifiedTabs(page);
    this.interactiveSaveMenuItem = page.testSubj.locator('interactiveSaveMenuItem');
    this.saveButtonSecondary = page.testSubj.locator('discoverSaveButton-secondary-button');
    this.saveModal = new SavedObjectSaveModal(page);
  }
}
