/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SIGNAL_INSPECTOR_DEBOUNCE_MS, createSandboxInspectorSession } from './inspector_session';
import type { VegaInspectorRuntimeView } from './inspector_snapshot';

const createView = (): VegaInspectorRuntimeView & {
  addSignalListener: jest.Mock;
  removeSignalListener: jest.Mock;
} => {
  const listeners = new Map<string, Array<(name: string, value: unknown) => void>>();
  return {
    _runtime: {
      data: {
        table: { values: { value: [{ category: 'jpg' }] } },
      },
      signals: {
        width: { value: 200 },
        click: { value: null },
      },
    },
    addSignalListener: jest.fn((name: string, handler: (name: string, value: unknown) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(handler);
      listeners.set(name, existing);
    }),
    removeSignalListener: jest.fn(
      (name: string, handler: (name: string, value: unknown) => void) => {
        const existing = listeners.get(name) ?? [];
        listeners.set(
          name,
          existing.filter((candidate) => candidate !== handler)
        );
      }
    ),
    emit(name: string, value: unknown) {
      for (const handler of listeners.get(name) ?? []) {
        handler(name, value);
      }
    },
  } as VegaInspectorRuntimeView & {
    addSignalListener: jest.Mock;
    removeSignalListener: jest.Mock;
    emit: (name: string, value: unknown) => void;
  };
};

describe('createSandboxInspectorSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('responds to data-set snapshot requests from the live view', () => {
    const view = createView();
    const postToParent = jest.fn();
    const session = createSandboxInspectorSession({
      getView: () => view,
      postToParent,
    });

    session.handleRequestSnapshot({
      type: 'requestInspectorSnapshot',
      requestId: 'insp-1',
      kind: 'dataSets',
    });

    expect(postToParent).toHaveBeenCalledWith({
      type: 'inspectorSnapshot',
      requestId: 'insp-1',
      kind: 'dataSets',
      payload: [
        {
          id: 'table',
          columns: [{ id: 'category', schema: 'json' }],
          data: [{ category: 'jpg' }],
        },
      ],
    });
  });

  it('emits an immediate signals payload then debounced updates while active', () => {
    const view = createView() as ReturnType<typeof createView> & {
      emit: (name: string, value: unknown) => void;
    };
    const postToParent = jest.fn();
    const session = createSandboxInspectorSession({
      getView: () => view,
      postToParent,
    });

    session.handleSetInspectorActive({
      type: 'setInspectorActive',
      kind: 'signals',
      active: true,
    });

    expect(postToParent).toHaveBeenCalledTimes(1);
    expect(postToParent).toHaveBeenCalledWith({
      type: 'inspectorUpdate',
      kind: 'signals',
      payload: {
        data: [
          { name: 'width', value: '200' },
          { name: 'click', value: 'null' },
        ],
      },
    });
    expect(view.addSignalListener).toHaveBeenCalledWith('width', expect.any(Function));
    expect(view.addSignalListener).toHaveBeenCalledWith('click', expect.any(Function));

    view.emit('width', 240);
    expect(postToParent).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(SIGNAL_INSPECTOR_DEBOUNCE_MS);
    expect(postToParent).toHaveBeenCalledTimes(2);

    session.handleSetInspectorActive({
      type: 'setInspectorActive',
      kind: 'signals',
      active: false,
    });

    view.emit('width', 280);
    jest.advanceTimersByTime(SIGNAL_INSPECTOR_DEBOUNCE_MS);
    expect(postToParent).toHaveBeenCalledTimes(2);
    expect(view.removeSignalListener).toHaveBeenCalled();
  });
});
