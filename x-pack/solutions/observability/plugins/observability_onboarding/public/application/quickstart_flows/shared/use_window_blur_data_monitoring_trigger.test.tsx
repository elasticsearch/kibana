/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { OBSERVABILITY_ONBOARDING_FLOW_PROGRESS_TELEMETRY_EVENT } from '../../../../common/telemetry_events';
import { buildHostPageServices } from '../../pages/host/__tests__/test_helpers';
import { useWindowBlurDataMonitoringTrigger } from './use_window_blur_data_monitoring_trigger';

type WindowBlurDataMonitoringTriggerProps = Parameters<
  typeof useWindowBlurDataMonitoringTrigger
>[0];

describe('useWindowBlurDataMonitoringTrigger', () => {
  it('keeps monitoring active when the window blurs before onboarding setup finishes', () => {
    const services = buildHostPageServices();
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <KibanaContextProvider services={services}>{children}</KibanaContextProvider>
    );

    const { result, rerender } = renderHook<boolean, WindowBlurDataMonitoringTriggerProps>(
      (props) => useWindowBlurDataMonitoringTrigger(props),
      {
        wrapper,
        initialProps: {
          isActive: false,
          onboardingFlowType: 'kubernetes_otel',
          onboardingId: undefined,
        },
      }
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current).toBe(false);

    rerender({
      isActive: true,
      onboardingFlowType: 'kubernetes_otel',
      onboardingId: 'test-onboarding-id',
    });

    expect(result.current).toBe(true);
  });

  it('resets monitoring when a resolved onboarding id changes', () => {
    const services = buildHostPageServices();
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <KibanaContextProvider services={services}>{children}</KibanaContextProvider>
    );

    const { result, rerender } = renderHook<boolean, WindowBlurDataMonitoringTriggerProps>(
      (props) => useWindowBlurDataMonitoringTrigger(props),
      {
        wrapper,
        initialProps: {
          isActive: true,
          onboardingFlowType: 'kubernetes_otel',
          onboardingId: 'first-onboarding-id',
        },
      }
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current).toBe(true);

    rerender({
      isActive: true,
      onboardingFlowType: 'kubernetes_otel',
      onboardingId: 'second-onboarding-id',
    });

    expect(result.current).toBe(false);
  });

  it('reports awaiting data only once when telemetry context changes after blur', () => {
    const services = buildHostPageServices();
    const reportEvent = jest.fn();
    services.analytics.reportEvent = reportEvent;
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <KibanaContextProvider services={services}>{children}</KibanaContextProvider>
    );

    const { rerender } = renderHook<boolean, WindowBlurDataMonitoringTriggerProps>(
      (props) => useWindowBlurDataMonitoringTrigger(props),
      {
        wrapper,
        initialProps: {
          isActive: true,
          onboardingFlowType: 'kubernetes_otel',
          onboardingId: 'test-onboarding-id',
          telemetryEventContext: {
            kubernetes: { selectedCollectorMethod: 'edot' },
          },
        },
      }
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(reportEvent).toHaveBeenCalledTimes(1);
    expect(reportEvent).toHaveBeenCalledWith(
      OBSERVABILITY_ONBOARDING_FLOW_PROGRESS_TELEMETRY_EVENT.eventType,
      {
        onboardingFlowType: 'kubernetes_otel',
        onboardingId: 'test-onboarding-id',
        step: 'awaiting_data',
        context: {
          kubernetes: { selectedCollectorMethod: 'edot' },
        },
      }
    );

    rerender({
      isActive: true,
      onboardingFlowType: 'kubernetes_otel',
      onboardingId: 'test-onboarding-id',
      telemetryEventContext: {
        kubernetes: { selectedCollectorMethod: 'existing_collector' },
      },
    });

    expect(reportEvent).toHaveBeenCalledTimes(1);
  });
});
