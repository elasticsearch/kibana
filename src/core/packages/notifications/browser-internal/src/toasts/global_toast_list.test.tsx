/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Toast } from '@kbn/core-notifications-browser/src/types';
import React, { type ComponentProps } from 'react';
import { Observable, from, EMPTY, BehaviorSubject } from 'rxjs';
import { screen, render, fireEvent, act } from '@testing-library/react';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import type { EuiToast } from '@elastic/eui';
import { ToastsTelemetry } from './telemetry';

import { GlobalToastList } from './global_toast_list';

const mockAnalytics = analyticsServiceMock.createAnalyticsServiceStart();

const toastsTelemetry = new ToastsTelemetry();

toastsTelemetry.setup({ analytics: analyticsServiceMock.createAnalyticsServiceSetup() });

const sharedProps = {
  toasts$: EMPTY,
  dismissToast: jest.fn(),
  reportEvent: toastsTelemetry.start({ analytics: mockAnalytics }),
};

function RenderToastList(props: Partial<ComponentProps<typeof GlobalToastList>> = {}) {
  return <GlobalToastList {...sharedProps} {...props} />;
}

const dummyToastText = `You've got mail!`;
const dummyToastTitle = `AOL Notifications`;

const createMockToast = (id: any, type?: ComponentProps<typeof EuiToast>['color']): Toast => ({
  id: id.toString(),
  text: dummyToastText,
  title: dummyToastTitle,
  toastLifeTimeMs: 5000,
  color: type,
});

it('subscribes to toasts$ on mount and unsubscribes on unmount', () => {
  const unsubscribeSpy = jest.fn();
  const subscribeSpy = jest.fn((observer) => {
    observer.next([]);
    return unsubscribeSpy;
  });

  const { unmount } = render(<RenderToastList toasts$={new Observable<any>(subscribeSpy)} />);

  expect(subscribeSpy).toHaveBeenCalledTimes(1);
  expect(unsubscribeSpy).not.toHaveBeenCalled();

  unmount();

  expect(subscribeSpy).toHaveBeenCalledTimes(1);
  expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
});

it('uses the latest value from toasts$ passed to <EuiGlobalToastList /> to render the right number of toasts', () => {
  const toastObservable$ = new BehaviorSubject([
    { id: '1', title: 'Toast 1' },
    { id: '2', title: 'Toast 2' },
  ]);

  render(<RenderToastList toasts$={toastObservable$.asObservable() as any} />);

  expect(screen.getAllByTestId('euiToastHeader__title')).toHaveLength(2);

  act(() => {
    toastObservable$.next([...toastObservable$.getValue(), { id: '3', title: 'Toast 3' }]);
  });

  expect(screen.getAllByTestId('euiToastHeader__title')).toHaveLength(3);
});

describe('global_toast_list with duplicate elements', () => {
  const TOAST_DUPLICATE_COUNT = 4;

  function ToastListWithDuplicates() {
    return (
      <RenderToastList
        toasts$={
          from([
            Array.from(new Array(TOAST_DUPLICATE_COUNT)).map((_, idx) => createMockToast(idx)),
          ]) as any
        }
      />
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the toast list with a single toast when toasts matching deduplication heuristics are passed', () => {
    render(<ToastListWithDuplicates />);

    const { 0: firstToast, length: toastCount } = screen.getAllByTestId('euiToastHeader__title');

    expect(toastCount).toEqual(1);

    expect(screen.getAllByText(dummyToastText)).toHaveLength(1);

    expect(firstToast.querySelector('.euiNotificationBadge')?.innerHTML).toEqual('4');
  });

  it('renders a single toast also when toast titles are mount points are used that match the deduplication heuristics', () => {
    const createMockToastWithMountPoints = (id: any): Toast => ({
      id: id.toString(),
      text: dummyToastText,
      title: (element) => {
        const a = document.createElement('a');
        a.innerText = 'Click me!';
        a.href = 'https://elastic.co';
        element.appendChild(a);
        return () => element.removeChild(a);
      },
      toastLifeTimeMs: 5000,
    });

    render(
      <RenderToastList
        toasts$={
          from([
            Array.from(new Array(TOAST_DUPLICATE_COUNT)).map((_, idx) =>
              createMockToastWithMountPoints(idx)
            ),
          ]) as any
        }
      />
    );

    const renderedToasts = screen.getAllByText(dummyToastText);

    expect(renderedToasts).toHaveLength(TOAST_DUPLICATE_COUNT);
  });

  it(`when a represented toast is closed, the provided dismiss action is called for all its internal toasts`, () => {
    render(<ToastListWithDuplicates />);

    const { 0: toastDismissButton, length: toastDismissButtonLength } =
      screen.getAllByLabelText('Dismiss toast');

    expect(toastDismissButtonLength).toEqual(1);

    fireEvent.click(toastDismissButton);

    act(() => {
      // This is so that the toast fade out animation succesfully runs,
      // only after this is the dismiss method invoked
      jest.runOnlyPendingTimers();
    });

    expect(sharedProps.dismissToast).toHaveBeenCalledTimes(TOAST_DUPLICATE_COUNT);
    expect(sharedProps.dismissToast).toHaveBeenCalledWith('0');
    expect(sharedProps.dismissToast).toHaveBeenCalledWith('1');
    expect(sharedProps.dismissToast).toHaveBeenCalledWith('2');
    expect(sharedProps.dismissToast).toHaveBeenCalledWith('3');
  });
});

describe('global_toast_list toast dismissal telemetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('does not invoke the reportEvent method when there is no recurring toast', async () => {
    const onDimissReporterSpy = jest.spyOn(sharedProps.reportEvent, 'onDismissToast');

    const toastObservable$ = new BehaviorSubject([createMockToast(1)]);

    sharedProps.dismissToast.mockImplementation((toastId: string) =>
      act(() => {
        const toastList = toastObservable$.getValue();
        toastObservable$.next(toastList.filter((t) => t.id !== toastId));
      })
    );

    render(<RenderToastList toasts$={toastObservable$.asObservable() as any} />);

    const { 0: toastDismissButton, length: toastDismissButtonLength } =
      screen.getAllByLabelText('Dismiss toast');

    expect(toastDismissButtonLength).toEqual(1);

    fireEvent.click(toastDismissButton);

    act(() => {
      // This is so that the toast fade out animation succesfully runs,
      // only after this is the dismiss method invoked
      jest.runOnlyPendingTimers();
    });

    expect(sharedProps.dismissToast).toHaveBeenCalled();
    expect(onDimissReporterSpy).not.toBeCalled();

    expect(screen.queryByTestId('euiToastHeader__title')).toBeNull();
  });

  it('does not invoke the reportEvent method for a recurring toast of the success type', () => {
    const REPEATED_TOAST_COUNT = 2;

    const onDimissReporterSpy = jest.spyOn(sharedProps.reportEvent, 'onDismissToast');

    const toastObservable$ = new BehaviorSubject(
      Array.from(new Array(2)).map((_, idx) => createMockToast(idx, 'success'))
    );

    sharedProps.dismissToast.mockImplementation((toastId: string) =>
      act(() => {
        const toastList = toastObservable$.getValue();
        toastObservable$.next(toastList.filter((t) => t.id !== toastId));
      })
    );

    render(<RenderToastList toasts$={toastObservable$.asObservable() as any} />);

    const { 0: toastDismissButton, length: toastDismissButtonLength } =
      screen.getAllByLabelText('Dismiss toast');

    expect(toastDismissButtonLength).toEqual(1);

    fireEvent.click(toastDismissButton);

    act(() => {
      // This is so that the toast fade out animation succesfully runs,
      // only after this is the dismiss method invoked
      jest.runOnlyPendingTimers();
    });

    expect(sharedProps.dismissToast).toHaveBeenCalledTimes(REPEATED_TOAST_COUNT);
    expect(onDimissReporterSpy).not.toBeCalled();

    expect(screen.queryByTestId('euiToastHeader__title')).toBeNull();
  });

  it('invokes the reportEvent method for a recurring toast of allowed type that is not success', () => {
    const REPEATED_TOAST_COUNT = 4;

    const onDimissReporterSpy = jest.spyOn(sharedProps.reportEvent, 'onDismissToast');

    const toastObservable$ = new BehaviorSubject(
      Array.from(new Array(REPEATED_TOAST_COUNT)).map((_, idx) => createMockToast(idx, 'warning'))
    );

    sharedProps.dismissToast.mockImplementation((toastId: string) =>
      act(() => {
        const toastList = toastObservable$.getValue();
        toastObservable$.next(toastList.filter((t) => t.id !== toastId));
      })
    );

    render(<RenderToastList toasts$={toastObservable$.asObservable() as any} />);

    const { 0: toastDismissButton, length: toastDismissButtonLength } =
      screen.getAllByLabelText('Dismiss toast');

    expect(toastDismissButtonLength).toEqual(1);

    fireEvent.click(toastDismissButton);

    act(() => {
      // This is so that the toast fade out animation succesfully runs,
      // only after this is the dismiss method invoked
      jest.runOnlyPendingTimers();
    });

    expect(sharedProps.dismissToast).toHaveBeenCalledTimes(REPEATED_TOAST_COUNT);
    expect(onDimissReporterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrenceCount: REPEATED_TOAST_COUNT,
      })
    );

    expect(screen.queryByTestId('euiToastHeader__title')).toBeNull();
  });

  it('invokes the reportEvent method when the clear all button is clicked', () => {
    const UNIQUE_TOASTS_COUNT = 4;
    const REPEATED_COUNT_PER_UNIQUE_TOAST = 2;

    const onDimissReporterSpy = jest.spyOn(sharedProps.reportEvent, 'onDismissToast');

    const toastObservable$ = new BehaviorSubject<Toast[]>(
      Array.from(new Array(UNIQUE_TOASTS_COUNT)).reduce((acc, _, idx) => {
        return acc.concat(
          Array.from(new Array(REPEATED_COUNT_PER_UNIQUE_TOAST)).map(() => ({
            ...createMockToast(idx, 'warning'),
            title: `${dummyToastTitle}_${idx}`,
          }))
        );
      }, [])
    );

    sharedProps.dismissToast.mockImplementation((toastId: string) =>
      act(() => {
        const toastList = toastObservable$.getValue();
        toastObservable$.next(toastList.filter((t) => t.id !== toastId));
      })
    );

    render(<RenderToastList toasts$={toastObservable$.asObservable() as any} />);

    fireEvent.click(screen.getByLabelText('Clear all toast notifications'));

    act(() => {
      // This is so that the toast fade out animation succesfully runs,
      // only after this is the dismiss method invoked
      jest.runOnlyPendingTimers();
    });

    expect(sharedProps.dismissToast).toHaveBeenCalledTimes(
      UNIQUE_TOASTS_COUNT * REPEATED_COUNT_PER_UNIQUE_TOAST
    );

    expect(onDimissReporterSpy).toHaveBeenCalledTimes(UNIQUE_TOASTS_COUNT);

    new Array(UNIQUE_TOASTS_COUNT).forEach((_, idx) => {
      expect(onDimissReporterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toastMessage: `${dummyToastTitle}_${idx}`,
          recurrenceCount: REPEATED_COUNT_PER_UNIQUE_TOAST,
        })
      );
    });

    expect(screen.queryByTestId('euiToastHeader__title')).toBeNull();
  });
});
