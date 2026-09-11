/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('./render', () => ({
  renderVegaDescriptor: jest.fn(),
}));

// Side-effect import must precede bootstrap so isolationOk sees origin === 'null'.
import './bootstrap_test_null_origin';
import { renderVegaDescriptor } from './render';
import { VegaSandboxErrorCode } from './common';
import { VEGA_SANDBOX_PROTOCOL_VERSION, type VegaSandboxOutboundMessage } from './protocol';
import type { VegaSandboxRenderController } from './types';
import './bootstrap';

const renderVegaDescriptorMock = renderVegaDescriptor as jest.MockedFunction<
  typeof renderVegaDescriptor
>;

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const descriptor = {
  spec: { $schema: 'https://vega.github.io/schema/vega/v5.json' },
  renderer: 'canvas' as const,
  useHover: false,
  useResize: false,
  tooltips: false,
  restoreSignalValuesOnRefresh: true,
};

const createController = (
  viewOverrides: Partial<VegaSandboxRenderController['view']> = {}
): VegaSandboxRenderController => ({
  destroy: jest.fn(),
  resize: jest.fn().mockResolvedValue(undefined),
  view: {
    getState: jest.fn(),
    setState: jest.fn(),
    addSignalListener: jest.fn(),
    removeSignalListener: jest.fn(),
    _runtime: { data: {}, signals: {} },
    ...viewOverrides,
  } as VegaSandboxRenderController['view'],
});

const initSandbox = (): void => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'init', protocolVersion: VEGA_SANDBOX_PROTOCOL_VERSION },
      origin: 'https://kibana.example',
      source: window.parent,
    })
  );
};

const postRender = (renderId: string): void => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'render', renderId, descriptor },
      origin: 'https://kibana.example',
      source: window.parent,
    })
  );
};

describe('sandbox bootstrap rerender restore', () => {
  const posted: VegaSandboxOutboundMessage[] = [];

  beforeEach(() => {
    posted.length = 0;
    document.body.innerHTML = '<div id="vega-sandbox-root"></div>';
    jest.spyOn(window.parent, 'postMessage').mockImplementation((message) => {
      posted.push(message);
    });
    renderVegaDescriptorMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restores captured signals onto the replacement view in the same rerender', async () => {
    const firstView = createController({
      getState: jest.fn().mockReturnValue({
        signals: { clicked: 3, width: 400, height: 200, padding: 5 },
      }),
    });
    const secondView = createController();
    renderVegaDescriptorMock.mockResolvedValueOnce(firstView).mockResolvedValueOnce(secondView);

    initSandbox();
    postRender('r1');
    await flushAsync();

    expect(renderVegaDescriptorMock).toHaveBeenCalledTimes(1);
    expect(secondView.view.setState).not.toHaveBeenCalled();
    await renderVegaDescriptorMock.mock.results[0].value;
    await Promise.resolve();

    postRender('r2');
    await flushAsync();
    await renderVegaDescriptorMock.mock.results[1].value;
    await Promise.resolve();

    expect(firstView.view.getState).toHaveBeenCalled();
    expect(posted).toEqual(
      expect.arrayContaining([
        {
          type: 'saveState',
          state: { signals: { clicked: 3, width: 400, height: 200, padding: 5 } },
        },
        { type: 'rendered', renderId: 'r2' },
      ])
    );
    expect(secondView.view.setState).toHaveBeenCalledWith({
      signals: { clicked: 3 },
    });
  });

  it('does not emit rendered when rendering fails', async () => {
    renderVegaDescriptorMock.mockRejectedValueOnce(new Error('run failed'));

    initSandbox();
    postRender('r1');
    await flushAsync();

    expect(posted).toEqual(
      expect.arrayContaining([
        {
          type: 'error',
          renderId: 'r1',
          error: {
            code: VegaSandboxErrorCode.RenderFailed,
            values: { message: 'run failed' },
          },
        },
      ])
    );
    expect(posted.some((message) => message.type === 'rendered')).toBe(false);
  });

  it('destroys a stale in-flight render and only completes the latest', async () => {
    const firstView = createController();
    const secondView = createController();
    let resolveFirst!: (value: VegaSandboxRenderController) => void;
    const firstRender = new Promise<VegaSandboxRenderController>((resolve) => {
      resolveFirst = resolve;
    });
    renderVegaDescriptorMock.mockReturnValueOnce(firstRender).mockResolvedValueOnce(secondView);

    initSandbox();
    postRender('r1');
    await flushAsync();
    postRender('r2');
    await flushAsync();
    await renderVegaDescriptorMock.mock.results[1].value;
    await Promise.resolve();

    expect(posted.filter((message) => message.type === 'rendered')).toEqual([
      { type: 'rendered', renderId: 'r2' },
    ]);

    resolveFirst(firstView);
    await firstRender;
    await flushAsync();

    expect(firstView.destroy).toHaveBeenCalled();
    expect(posted.filter((message) => message.type === 'rendered')).toEqual([
      { type: 'rendered', renderId: 'r2' },
    ]);
  });
});
