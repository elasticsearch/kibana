/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Rx from 'rxjs';
import { omitBy, isUndefined } from 'lodash';

import { apm } from '@elastic/apm-rum';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type {
  ErrorToastOptions,
  IToasts,
  Toast,
  ToastInput,
  ToastInputFields,
  ToastOptions,
} from '@kbn/core-notifications-browser';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { getErrorToastActionProps } from './error_toast';

const normalizeToast = (toastOrTitle: ToastInput): ToastInputFields => {
  if (typeof toastOrTitle === 'string') {
    return {
      title: toastOrTitle,
    };
  }
  return omitBy(toastOrTitle, isUndefined);
};

const getMountPointText = (mountPoint: MountPoint, prefix: string): string => {
  const div = document.createElement('div');
  const unmount = mountPoint(div);
  try {
    return `${prefix}: ${div.textContent || div.innerText || 'Fallback ' + prefix}`;
  } finally {
    unmount?.();
  }
};

const getToastTitleOrText = (toastOrTitle: ToastInput): string => {
  const toastInfo = [];

  if (typeof toastOrTitle === 'string') {
    toastInfo.push(toastOrTitle);
  } else {
    // Handle toastOrTitle.title?: string | MountPoint
    if (typeof toastOrTitle.title === 'string') {
      toastInfo.push(`Title: ${toastOrTitle.title}`);
    } else if (toastOrTitle.title instanceof Function) {
      toastInfo.push(getMountPointText(toastOrTitle.title, 'Title'));
    }

    // Handle toastOrTitle.text?: string | MountPoint
    if (typeof toastOrTitle.text === 'string') {
      toastInfo.push(`Text: ${toastOrTitle.text}`);
    } else if (toastOrTitle.text instanceof Function) {
      toastInfo.push(getMountPointText(toastOrTitle.text, 'Text'));
    }
  }

  return !!toastInfo.length ? toastInfo.join(', ') : 'No title or text is provided.';
};

const getApmLabels = (errorType: 'ToastError' | 'ToastDanger') => {
  return {
    error_type: errorType,
  };
};

interface StartDeps {
  overlays: OverlayStart;
  rendering: RenderingService;
}

/**
 * Methods for adding and removing global toast messages.
 * @public
 */
export class ToastsApi implements IToasts {
  private toasts$ = new Rx.BehaviorSubject<Toast[]>([]);
  private idCounter = 0;
  private uiSettings: IUiSettingsClient;

  private startDeps?: StartDeps;

  constructor(deps: { uiSettings: IUiSettingsClient }) {
    this.uiSettings = deps.uiSettings;
  }

  /** @internal */
  public start(startDeps: StartDeps) {
    this.startDeps = startDeps;
  }

  /** Observable of the toast messages queued to be shown to the user. */
  public get$() {
    return this.toasts$.asObservable();
  }

  /**
   * Adds a new toast to current array of toast.
   *
   * @param toastOrTitle - a {@link ToastInput}
   * @returns a {@link Toast}
   */
  public add(toastOrTitle: ToastInput) {
    const toast: Toast = {
      id: String(this.idCounter++),
      toastLifeTimeMs: this.uiSettings.get('notifications:lifetime:info'),
      ...normalizeToast(toastOrTitle),
    };

    this.toasts$.next([...this.toasts$.getValue(), toast]);

    return toast;
  }

  /**
   * Removes a toast from the current array of toasts if present.
   * @param toastOrId - a {@link Toast} returned by {@link ToastsApi.add} or its id
   */
  public remove(toastOrId: Toast | string) {
    const toRemove = typeof toastOrId === 'string' ? toastOrId : toastOrId.id;
    const list = this.toasts$.getValue();
    const listWithoutToast = list.filter((t) => t.id !== toRemove);
    if (listWithoutToast.length !== list.length) {
      this.toasts$.next(listWithoutToast);
    }
  }

  /**
   * Adds a new toast pre-configured with the info color and info icon.
   *
   * @param toastOrTitle - a {@link ToastInput}
   * @param options - a {@link ToastOptions}
   * @returns a {@link Toast}
   */
  public addInfo(toastOrTitle: ToastInput, options?: ToastOptions) {
    return this.add({
      color: 'primary',
      ...normalizeToast(toastOrTitle),
      ...options,
    });
  }

  /**
   * Adds a new toast pre-configured with the success color and check icon.
   *
   * @param toastOrTitle - a {@link ToastInput}
   * @param options - a {@link ToastOptions}
   * @returns a {@link Toast}
   */
  public addSuccess(toastOrTitle: ToastInput, options?: ToastOptions) {
    return this.add({
      color: 'success',
      ...normalizeToast(toastOrTitle),
      ...options,
    });
  }

  /**
   * Adds a new toast pre-configured with the warning color and help icon.
   *
   * @param toastOrTitle - a {@link ToastInput}
   * @param options - a {@link ToastOptions}
   * @returns a {@link Toast}
   */
  public addWarning(toastOrTitle: ToastInput, options?: ToastOptions) {
    return this.add({
      color: 'warning',
      toastLifeTimeMs: this.uiSettings.get('notifications:lifetime:warning'),
      ...normalizeToast(toastOrTitle),
      ...options,
    });
  }

  /**
   * Adds a new toast pre-configured with the danger color and alert icon.
   *
   * @param toastOrTitle - a {@link ToastInput}
   * @param options - a {@link ToastOptions}
   * @returns a {@link Toast}
   */
  public addDanger(toastOrTitle: ToastInput, options?: ToastOptions) {
    const toastTitle = getToastTitleOrText(toastOrTitle);
    apm.captureError(toastTitle, {
      labels: getApmLabels('ToastDanger'),
    });
    return this.add({
      color: 'danger',
      toastLifeTimeMs: this.uiSettings.get('notifications:lifetime:warning'),
      ...normalizeToast(toastOrTitle),
      ...options,
    });
  }

  /**
   * Adds a new toast that displays an exception message with a button to open the full stacktrace in a modal.
   *
   * @param error - an `Error` instance.
   * @param options - {@link ErrorToastOptions}
   * @returns a {@link Toast}
   */
  public addError(error: Error, options: ErrorToastOptions) {
    const optionsLabels = {
      title: options.title,
      ...(options.toastMessage && { toast_message: options.toastMessage }),
    };
    apm.captureError(error, {
      labels: {
        ...getApmLabels('ToastError'),
        ...optionsLabels,
      },
    });
    const message = options.toastMessage || error.message;
    return this.add({
      color: 'danger',
      toastLifeTimeMs: this.uiSettings.get('notifications:lifetime:error'),
      text: message,
      actionProps: getErrorToastActionProps({
        title: options.title,
        error,
        openModal: this.openModal.bind(this),
        rendering: this.startDeps!.rendering,
      }),
      ...options,
    });
  }

  private openModal(
    ...args: Parameters<OverlayStart['openModal']>
  ): ReturnType<OverlayStart['openModal']> {
    const { overlays } = this.startDeps ?? {};
    if (!overlays) {
      // This case should never happen because no rendering should be occurring
      // before the ToastService is started.
      throw new Error(`Modal opened before ToastService was started.`);
    }

    return overlays.openModal(...args);
  }
}
