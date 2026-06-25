/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Subject } from 'rxjs';
import { FeedbackPlugin } from './plugin';
import { coreMock } from '@kbn/core/public/mocks';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import type { TelemetryPluginStart } from '@kbn/telemetry-plugin/public';

describe('Feedback Plugin', () => {
  let coreStartMock: ReturnType<typeof coreMock.createStart>;
  let cloudStartMock: ReturnType<typeof cloudMock.createStart>;
  let isOptedIn$: Subject<boolean>;
  let telemetryStartMock: TelemetryPluginStart;
  let plugin: FeedbackPlugin;

  const startPlugin = () =>
    plugin.start(coreStartMock, { cloud: cloudStartMock, telemetry: telemetryStartMock });

  const enableFeedback = () => coreStartMock.notifications.feedback.isEnabled.mockReturnValue(true);

  const enableChromeNext = () => coreStartMock.featureFlags.getBooleanValue.mockReturnValue(true);

  beforeEach(() => {
    coreStartMock = coreMock.createStart();
    cloudStartMock = cloudMock.createStart();
    isOptedIn$ = new Subject<boolean>();
    // The plugin only consumes `isOptedIn$`, so a Subject we can emit on is all we need.
    telemetryStartMock = {
      telemetryService: { isOptedIn$ },
    } as unknown as TelemetryPluginStart;
    plugin = new FeedbackPlugin();
  });

  it('registers the feedback button when feedback is enabled', () => {
    enableFeedback();

    startPlugin();

    expect(coreStartMock.chrome.navControls.registerRight).toHaveBeenCalledWith({
      order: 1001,
      content: expect.anything(),
    });
    const [[{ content }]] = coreStartMock.chrome.navControls.registerRight.mock.calls;
    expect(React.isValidElement(content)).toBe(true);
  });

  it('does not register the feedback button when feedback is disabled', () => {
    coreStartMock.notifications.feedback.isEnabled.mockReturnValue(false);

    startPlugin();

    expect(coreStartMock.chrome.navControls.registerRight).not.toHaveBeenCalled();
  });

  describe('Chrome Next', () => {
    beforeEach(() => {
      enableFeedback();
      enableChromeNext();
    });

    it('registers the feedback handler only once opt-in resolves to true', () => {
      startPlugin();

      expect(coreStartMock.chrome.next.registerFeedbackHandler).not.toHaveBeenCalled();

      isOptedIn$.next(true);

      expect(coreStartMock.chrome.next.registerFeedbackHandler).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('unregisters the feedback handler when opt-in becomes false', () => {
      const unregister = jest.fn();
      coreStartMock.chrome.next.registerFeedbackHandler.mockReturnValue(unregister);

      startPlugin();

      isOptedIn$.next(true);
      expect(coreStartMock.chrome.next.registerFeedbackHandler).toHaveBeenCalledTimes(1);

      isOptedIn$.next(false);
      expect(unregister).toHaveBeenCalled();
    });
  });

  it('does not register the feedback handler when Chrome Next is disabled', () => {
    enableFeedback();
    coreStartMock.featureFlags.getBooleanValue.mockReturnValue(false);

    startPlugin();
    isOptedIn$.next(true);

    expect(coreStartMock.chrome.next.registerFeedbackHandler).not.toHaveBeenCalled();
  });
});
