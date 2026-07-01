/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneDeep, isEqual, remove, take } from 'lodash';
import type { Observable } from 'rxjs';
import { BehaviorSubject, defer, finalize, map } from 'rxjs';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';

const defaultIsDuplicate = (oldItem: unknown, newItem: unknown) => {
  return isEqual(oldItem, newItem);
};

interface PersistedLogOptions<T = unknown> {
  maxLength?: number | string;
  filterDuplicates?: boolean;
  isDuplicate?: (oldItem: T, newItem: T) => boolean;
  enableBrowserTabsSync?: boolean;
}

export class PersistedLog<T = unknown> {
  public name: string;
  public maxLength?: number;
  public filterDuplicates?: boolean;
  public isDuplicate: (oldItem: T, newItem: T) => boolean;
  public storage: IStorageWrapper;
  public items: T[];

  private update$ = new BehaviorSubject(undefined);
  private storageEventListener?: (event: StorageEvent) => void;
  private enableBrowserTabsSync: boolean;
  private subscriberCount = 0;

  constructor(name: string, options: PersistedLogOptions<T> = {}, storage: IStorageWrapper) {
    this.name = name;
    this.maxLength =
      typeof options.maxLength === 'string'
        ? (this.maxLength = parseInt(options.maxLength, 10))
        : options.maxLength;
    this.filterDuplicates = options.filterDuplicates || false;
    this.isDuplicate = options.isDuplicate || defaultIsDuplicate;
    this.storage = storage;
    this.items = this.storage.get(this.name) || [];
    this.enableBrowserTabsSync = options?.enableBrowserTabsSync || false;

    if (this.maxLength !== undefined && !isNaN(this.maxLength)) {
      this.items = take(this.items, this.maxLength);
    }
  }

  /** Keeps browser tabs in sync. */
  private addStorageEventListener() {
    if (typeof window !== 'undefined' && !this.storageEventListener) {
      this.storageEventListener = (event: StorageEvent) => {
        // Only handle events for this specific storage key
        if (event.key === this.name && event.newValue !== null) {
          try {
            const newItems = JSON.parse(event.newValue);
            // Only update if the items have actually changed
            if (!isEqual(this.items, newItems)) {
              this.items = newItems;
              this.update$.next(undefined);
            }
          } catch (error) {
            return;
          }
        }
      };
      window.addEventListener('storage', this.storageEventListener);
    }
  }

  private removeStorageEventListener() {
    if (typeof window !== 'undefined' && this.storageEventListener) {
      window.removeEventListener('storage', this.storageEventListener);
      this.storageEventListener = undefined;
    }
  }

  public add(val: T) {
    if (val == null) {
      return this.items;
    }

    // remove any matching items from the stack if option is set
    if (this.filterDuplicates) {
      remove(this.items, (item) => {
        return this.isDuplicate(item, val);
      });
    }

    this.items.unshift(val);

    // if maxLength is set, truncate the stack
    if (this.maxLength && !isNaN(this.maxLength)) {
      this.items = take(this.items, this.maxLength);
    }

    // persist the stack
    this.storage.set(this.name, this.items);
    this.update$.next(undefined);
    return this.items;
  }

  public get() {
    return cloneDeep(this.items);
  }

  public get$(): Observable<T[]> {
    return defer(() => {
      this.subscriberCount++;
      // Add storage event listener when the first subscriber subscribes
      if (this.subscriberCount === 1 && this.enableBrowserTabsSync) {
        this.addStorageEventListener();
      }

      return this.update$.pipe(
        map(() => this.get()),
        finalize(() => {
          this.subscriberCount--;
          // Remove storage event listener when the last subscriber unsubscribes
          if (this.subscriberCount === 0 && this.enableBrowserTabsSync) {
            this.removeStorageEventListener();
          }
        })
      );
    });
  }
}
