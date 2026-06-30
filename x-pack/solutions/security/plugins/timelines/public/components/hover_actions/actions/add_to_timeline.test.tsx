/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonEmpty } from '@elastic/eui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import React from 'react';

import type { SuccessMessageProps } from './add_to_timeline';
import AddToTimelineButton, {
  ADD_TO_TIMELINE_KEYBOARD_SHORTCUT,
  AddSuccessMessage,
} from './add_to_timeline';
import type { DataProvider } from '../../../../common/types';
import { IS_OPERATOR } from '../../../../common/types';
import { TestProviders } from '../../../mock';
import { PRESS } from '../../tooltip_with_keyboard_shortcut';
import * as i18n from './translations';

const coreStart = coreMock.createStart();

const mockAddSuccess = jest.fn();
jest.mock('../../../hooks/use_app_toasts', () => ({
  useAppToasts: () => ({
    addSuccess: mockAddSuccess,
  }),
}));

jest.mock('../../../hooks/use_selector');

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const originalModule = jest.requireActual('react-redux');

  return {
    ...originalModule,
    useDispatch: () => mockDispatch,
  };
});

const mockStartDragToTimeline = jest.fn();
jest.mock('../../../hooks/use_add_to_timeline', () => {
  const originalModule = jest.requireActual('../../../hooks/use_add_to_timeline');

  return {
    ...originalModule,
    useAddToTimeline: () => ({
      beginDrag: jest.fn(),
      cancelDrag: jest.fn(),
      dragToLocation: jest.fn(),
      endDrag: jest.fn(),
      hasDraggableLock: jest.fn(),
      startDragToTimeline: mockStartDragToTimeline,
    }),
  };
});

const providerA: DataProvider = {
  and: [],
  enabled: true,
  excluded: false,
  id: 'context-field.name-a',
  kqlQuery: '',
  name: 'a',
  queryMatch: {
    field: 'field.name',
    value: 'a',
    operator: IS_OPERATOR,
  },
};

const providerB: DataProvider = {
  and: [],
  enabled: true,
  excluded: false,
  id: 'context-field.name-b',
  kqlQuery: '',
  name: 'b',
  queryMatch: {
    field: 'field.name',
    value: 'b',
    operator: IS_OPERATOR,
  },
};

const getButton = () => screen.getByTestId('add-to-timeline');

describe('add to timeline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const field = 'user.name';

  describe('when the `Component` prop is NOT provided', () => {
    beforeEach(() => {
      render(
        <TestProviders>
          <AddToTimelineButton field={field} ownFocus={false} startServices={coreStart} />
        </TestProviders>
      );
    });

    test('it renders the button icon', () => {
      expect(getButton()).toHaveClass('timelines__hoverActionButton');
    });

    test('it has the expected aria label', () => {
      expect(getButton()).toHaveAttribute('aria-label', i18n.ADD_TO_TIMELINE);
    });
  });

  describe('when the `Component` prop is provided', () => {
    beforeEach(() => {
      render(
        <TestProviders>
          <AddToTimelineButton
            Component={EuiButtonEmpty}
            field={field}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );
    });

    test('it renders the component provided via the `Component` prop', () => {
      expect(getButton()).toHaveClass('euiButtonEmpty');
    });

    test('it has the expected aria label', () => {
      expect(getButton()).toHaveAttribute('aria-label', i18n.ADD_TO_TIMELINE);
    });
  });

  test('it renders the keyboard shortcut tooltip content when `showTooltip` is true', async () => {
    render(
      <TestProviders>
        <AddToTimelineButton
          field={field}
          ownFocus={true}
          showTooltip={true}
          startServices={coreStart}
        />
      </TestProviders>
    );

    fireEvent.mouseOver(screen.getByRole('button'));

    expect(await screen.findByText(PRESS)).toBeInTheDocument();
  });

  test('it does NOT render keyboard shortcut tooltip content when `showTooltip` is false (default)', () => {
    render(
      <TestProviders>
        <AddToTimelineButton field={field} ownFocus={true} startServices={coreStart} />
      </TestProviders>
    );

    fireEvent.mouseOver(screen.getByRole('button'));

    expect(screen.queryByText(PRESS)).not.toBeInTheDocument();
  });

  describe('when the user clicks the button', () => {
    const draggableId = 'abcd';

    test('it starts dragging to timeline when a `draggableId` is provided', () => {
      render(
        <TestProviders>
          <AddToTimelineButton
            draggableId={draggableId}
            field={field}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      expect(mockStartDragToTimeline).toBeCalled();
    });

    test('it does NOT start dragging to timeline when a `draggableId` is NOT provided', () => {
      render(
        <TestProviders>
          <AddToTimelineButton field={field} ownFocus={false} startServices={coreStart} />
        </TestProviders>
      );

      fireEvent.click(getButton());

      expect(mockStartDragToTimeline).not.toBeCalled();
    });

    test('it dispatches a single `addProviderToTimeline` action when a single, non-array `dataProvider` is provided', () => {
      render(
        <TestProviders>
          <AddToTimelineButton
            dataProvider={providerA}
            field={field}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      expect(mockDispatch).toHaveBeenCalledTimes(1);

      expect(mockDispatch).toHaveBeenCalledWith({
        payload: {
          dataProvider: {
            and: [],
            enabled: true,
            excluded: false,
            id: 'context-field.name-a',
            kqlQuery: '',
            name: 'a',
            queryMatch: { field: 'field.name', operator: ':', value: 'a' },
          },
          id: 'timeline-1',
        },
        type: 'x-pack/timelines/timeline/ADD_PROVIDER_TO_TIMELINE',
      });
    });

    test('it dispatches multiple `addProviderToTimeline` actions when an array of `dataProvider` are provided', () => {
      const providers = [providerA, providerB];

      render(
        <TestProviders>
          <AddToTimelineButton
            dataProvider={[providerA, providerB]}
            field={field}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      expect(mockDispatch).toHaveBeenCalledTimes(2);

      providers.forEach((_p, i) =>
        expect(mockDispatch).toHaveBeenNthCalledWith(i + 1, {
          payload: {
            dataProvider: {
              and: [],
              enabled: true,
              excluded: false,
              id: providers[i].id,
              kqlQuery: '',
              name: providers[i].name,
              queryMatch: { field: 'field.name', operator: ':', value: providers[i].name },
            },
            id: 'timeline-1',
          },
          type: 'x-pack/timelines/timeline/ADD_PROVIDER_TO_TIMELINE',
        })
      );
    });

    test('it invokes the `onClick` (callback) prop when the user clicks the button', () => {
      const onClick = jest.fn();

      render(
        <TestProviders>
          <AddToTimelineButton
            field={field}
            onClick={onClick}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      expect(onClick).toBeCalled();
    });
  });

  describe('keyboard event handling', () => {
    describe('when the keyboard shortcut is pressed', () => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        ctrlKey: false,
        key: ADD_TO_TIMELINE_KEYBOARD_SHORTCUT, // <-- the correct shortcut key
        metaKey: false,
      }) as unknown as React.KeyboardEvent;

      beforeEach(() => {
        keyboardEvent.stopPropagation = jest.fn();
        keyboardEvent.preventDefault = jest.fn();
      });

      test('it stops propagation of the keyboard event', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(keyboardEvent.preventDefault).toHaveBeenCalled();
      });

      test('it prevents the default keyboard event behavior', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(keyboardEvent.preventDefault).toHaveBeenCalled();
      });

      test('it starts dragging to timeline', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                draggableId="abcd"
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(mockStartDragToTimeline).toBeCalled();
      });
    });

    describe("when a key that's NOT the keyboard shortcut is pressed", () => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        ctrlKey: false,
        key: 'z', // <-- NOT the correct shortcut key
        metaKey: false,
      }) as unknown as React.KeyboardEvent;

      beforeEach(() => {
        keyboardEvent.stopPropagation = jest.fn();
        keyboardEvent.preventDefault = jest.fn();
      });

      test('it does NOT stop propagation of the keyboard event', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(keyboardEvent.preventDefault).not.toHaveBeenCalled();
      });

      test('it does NOT prevents the default keyboard event behavior', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(keyboardEvent.preventDefault).not.toHaveBeenCalled();
      });

      test('it does NOT start dragging to timeline', async () => {
        await act(async () => {
          render(
            <TestProviders>
              <AddToTimelineButton
                draggableId="abcd"
                field={field}
                keyboardEvent={keyboardEvent}
                ownFocus={true}
                showTooltip={true}
                startServices={coreStart}
              />
            </TestProviders>
          );
        });

        expect(mockStartDragToTimeline).not.toBeCalled();
      });
    });
  });

  describe('it shows the appropriate text based on timeline type', () => {
    test('Add success is called with "timeline" if timeline type is timeline', () => {
      render(
        <TestProviders>
          <AddToTimelineButton
            dataProvider={providerA}
            field={field}
            ownFocus={false}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      const message: SuccessMessageProps = {
        children: i18n.ADDED_TO_TIMELINE_OR_TEMPLATE_MESSAGE(providerA.name, true),
      };
      const wrapper = render(<AddSuccessMessage {...message} />);
      expect(wrapper.container.textContent).toBe('Added a to Timeline');
    });

    test('Add success is called with "template" if timeline type is template', () => {
      render(
        <TestProviders>
          <AddToTimelineButton
            dataProvider={providerA}
            field={field}
            ownFocus={false}
            timelineType={'template'}
            startServices={coreStart}
          />
        </TestProviders>
      );

      fireEvent.click(getButton());

      const message: SuccessMessageProps = {
        children: i18n.ADDED_TO_TIMELINE_OR_TEMPLATE_MESSAGE(providerA.name, false),
      };
      const wrapper = render(<AddSuccessMessage {...message} />);
      expect(wrapper.container.textContent).toBe('Added a to template');
    });
  });
});
