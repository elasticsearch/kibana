/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KeyboardEventHandler,
  KeyboardEvent,
  MutableRefObject,
  PropsWithChildren,
  ClipboardEventHandler,
} from 'react';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { pick } from 'lodash';
import styled from '@emotion/styled';
import { i18n } from '@kbn/i18n';
import { useIsMounted } from '@kbn/securitysolution-hook-utils';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../../../hooks/state_selectors/use_data_test_subj';

const ARIA_PLACEHOLDER_MESSAGE = i18n.translate(
  'xpack.securitySolution.inputCapture.ariaPlaceHolder',
  { defaultMessage: 'Enter a command' }
);

const ARIA_LABEL_MESSAGE = i18n.translate('xpack.securitySolution.inputCapture.ariaLabel', {
  defaultMessage: 'Response console input',
});

const deSelectTextOnPage = () => {
  const selection = getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
};

const InputCaptureContainer = styled.div`
  .focus-container {
    // Tried to find a way to not use '!important', but cant seem to figure
    // out right combination of pseudo selectors
    outline: none !important;
  }

  .textSelectionBoundaryHelper {
    opacity: 0;
    position: absolute;
    top: -100vh;
    left: -100vw;
  }

  .invisible-input {
    &,
    &:focus {
      border: none;
      outline: none;
      background-image: none;
      background-color: transparent;
      -webkit-box-shadow: none;
      -moz-box-shadow: none;
      box-shadow: none;
      animation: none !important;
      width: 1ch !important;
      position: absolute;
      opacity: 0;
      top: -100vh;
      left: -100vw;
    }
`;

/**
 * Interface exposed by the `InputCapture` component that allows for interaction
 * with the component's focus/blur states.
 */
interface InputFocusInterface {
  focus: (force?: boolean) => void;
  blur: () => void;
}

export type InputCaptureProps = PropsWithChildren<{
  onCapture: (params: {
    /** The keyboard key value that was entered by the user */
    value: string | undefined;
    /** Any text that is selected/highlighted when user clicked the keyboard key */
    selection: string;
    /** Keyboard control keys from the keyboard event */
    eventDetails: Pick<
      KeyboardEvent,
      'key' | 'altKey' | 'ctrlKey' | 'keyCode' | 'metaKey' | 'repeat' | 'shiftKey' | 'code'
    >;
  }) => void;
  /** Sets an interface that allows interactions with this component's focus/blur states */
  focusRef?: MutableRefObject<InputFocusInterface | null>;
  /** Callback triggered whenever Focus/Blur events are triggered */
  onChangeFocus?: (hasFocus: boolean) => void;
}>;

/**
 * Component that will capture keyboard and other user input (ex. paste) that
 * occur within this component
 */
export const InputCapture = memo<InputCaptureProps>(
  ({ onCapture, focusRef, onChangeFocus, children }) => {
    const isMounted = useIsMounted();
    const getTestId = useTestIdGenerator(useDataTestSubj());
    // Reference to the `<div>` that take in focus (`tabIndex`)
    const focusEleRef = useRef<HTMLDivElement | null>(null);
    const childrenEleRef = useRef<HTMLInputElement | null>(null);
    const hiddenInputEleRef = useRef<HTMLInputElement | null>(null);

    const getTextSelection = useCallback((): string => {
      if (focusEleRef.current) {
        const selection = document.getSelection();

        // Get the selected text and remove any new line breaks from it.
        // The input area does not allow for new line breaks and due to the markup, if user makes
        // a selection that also captures the cursor, then a new line break is included in the selection
        const selectionText = (selection?.toString() ?? '').replace(/[\r\n]/g, '');

        const isSelectionWithinInputCapture =
          focusEleRef.current && selection
            ? focusEleRef.current?.contains(selection.focusNode) &&
              focusEleRef.current?.contains(selection.anchorNode)
            : false;

        if (!selection || selectionText.length === 0 || !isSelectionWithinInputCapture) {
          return '';
        }

        return selectionText;
      }

      return '';
    }, []);

    const isEventFromInputCapture = useCallback((ev: Pick<React.UIEvent, 'target'>) => {
      if (focusEleRef.current) {
        const { target: evTarget } = ev;

        return (
          evTarget === focusEleRef.current ||
          (evTarget instanceof Node && focusEleRef.current.contains(evTarget))
        );
      }

      return false;
    }, []);

    const handleOnKeyDown = useCallback<KeyboardEventHandler>(
      (ev) => {
        if (!isEventFromInputCapture(ev)) {
          return;
        }

        // handles the ctrl + a select and allows for clipboard events to be captured via onPaste event handler
        if (ev.metaKey || ev.ctrlKey) {
          if (ev.key === 'a') {
            ev.preventDefault();
            const selection = window.getSelection();
            if (selection && childrenEleRef.current) {
              const range = document.createRange();
              range.selectNodeContents(childrenEleRef.current);
              if (range.toString().length > 0) {
                // clear any current selection
                selection.removeAllRanges();
                // add the input text selection
                selection.addRange(range);
              }
            }
          }
          return;
        }

        // checking to ensure that the key is not a control character. Control character's `.key`
        // are at least two characters long and because we are handling `onKeyDown` we know that
        // a printable `.key` will always be just one character long.
        const newValue = /^[\w\d]{2}/.test(ev.key) ? '' : ev.key;

        const currentTextSelection = getTextSelection();

        const eventDetails = pick(ev, [
          'key',
          'altKey',
          'ctrlKey',
          'keyCode',
          'metaKey',
          'repeat',
          'shiftKey',
          'code',
        ]);

        onCapture({
          value: newValue,
          selection: currentTextSelection,
          eventDetails,
        });

        if (currentTextSelection) {
          deSelectTextOnPage();
        }
      },
      [getTextSelection, isEventFromInputCapture, onCapture]
    );

    const handleOnPaste = useCallback<ClipboardEventHandler>(
      (ev) => {
        if (!isEventFromInputCapture(ev)) {
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();

        // Get the data the user pasted as text and remove all new line breaks from it
        const value = ev.clipboardData.getData('text').replace(/[\r\n]/g, '');

        const currentTextSelection = getTextSelection();

        // hard-coded for use in onCapture and future keyboard functions
        const eventDetails = {
          altKey: false,
          ctrlKey: false,
          key: 'Meta',
          keyCode: 91,
          metaKey: true,
          repeat: false,
          shiftKey: false,
          code: 'MetaLeft',
        };

        onCapture({
          value,
          selection: currentTextSelection,
          eventDetails,
        });

        if (currentTextSelection) {
          deSelectTextOnPage();
        }
      },
      [getTextSelection, isEventFromInputCapture, onCapture]
    );

    const handleOnFocus = useCallback<React.FocusEventHandler<HTMLDivElement>>(
      (ev) => {
        if (!isEventFromInputCapture(ev)) {
          return;
        }

        if (onChangeFocus) {
          onChangeFocus(true);
        }
      },
      [isEventFromInputCapture, onChangeFocus]
    );

    const handleOnBlur = useCallback(() => {
      if (onChangeFocus) {
        onChangeFocus(false);
      }
    }, [onChangeFocus]);

    const focusInterface = useMemo<InputFocusInterface>(() => {
      return {
        focus: (force: boolean = false) => {
          // If user selected text and `force` is not true, then don't focus (else they lose selection)
          if (
            (!force && (window.getSelection()?.toString() ?? '').length > 0) ||
            document.activeElement === hiddenInputEleRef.current
          ) {
            return;
          }

          // Method could be called from State reducers, so need to make sure we don't cause
          // state to be changed in the middle of an update.
          // Avoids the nasty React warning: Cannot update a component (`name here`) while rendering a different component (`name here`)
          Promise.resolve().then(() => {
            if (isMounted() && hiddenInputEleRef.current) {
              hiddenInputEleRef.current?.focus();
            }
          });
        },

        blur: () => {
          // Method could be called from State reducers, so need to make sure we don't cause
          // state to be changed in the middle of an update.
          // Avoids the nasty React warning: Cannot update a component (`name here`) while rendering a different component (`name here`)
          Promise.resolve().then(() => {
            // only blur if the input has focus
            if (
              isMounted() &&
              hiddenInputEleRef.current &&
              document.activeElement === hiddenInputEleRef.current
            ) {
              hiddenInputEleRef.current?.blur();
            }
          });
        },
      };
    }, [isMounted]);

    if (focusRef) {
      focusRef.current = focusInterface;
    }

    return (
      <InputCaptureContainer
        data-test-subj={getTestId('inputCapture')}
        onKeyDown={handleOnKeyDown}
        onPaste={handleOnPaste}
      >
        <div
          role="textbox"
          aria-label={ARIA_LABEL_MESSAGE}
          aria-placeholder={ARIA_PLACEHOLDER_MESSAGE}
          tabIndex={0}
          ref={focusEleRef}
          className="focus-container"
          data-test-subj={getTestId('keyCapture-input')}
          onBlur={handleOnBlur}
          onFocus={handleOnFocus}
        >
          {/*
            This div.textSelectionBoundaryHelper and the one below help to ensure that when the user
            selects the start or end of the input text, that the node that are returned in the
            `Selection` object for 'focusNode` and `anchorNode` are within the input capture area.
          */}
          <div className="textSelectionBoundaryHelper"> </div>
          <div ref={childrenEleRef} className="text-container">
            {children}
          </div>
          <div className="textSelectionBoundaryHelper"> </div>
          <input
            name="inputCapture"
            ref={hiddenInputEleRef}
            type="text"
            value=""
            tabIndex={-1}
            onPaste={handleOnPaste}
            onChange={() => {}}
            spellCheck="false"
            className="invisible-input"
          />
        </div>
      </InputCaptureContainer>
    );
  }
);
InputCapture.displayName = 'InputCapture';
