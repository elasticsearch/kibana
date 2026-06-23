/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, memo, useEffect, useState, useMemo } from 'react';

import { debounce } from 'lodash';
import {
  EuiProgress,
  EuiSplitPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiResizableContainer,
  useIsWithinBreakpoints,
} from '@elastic/eui';

import type { TextObject } from '../../../../common/text_object';

import { NetworkRequestStatusBar } from '../../components';
import {
  useServicesContext,
  useRequestReadContext,
  useRequestActionContext,
  useEditorActionContext,
  useEditorReadContext,
  OutputFilterContextProvider,
} from '../../contexts';
import { OutputPanel } from './output_panel';
import { InputPanel } from './input_panel';
import { OutputFilterControls, OutputFilterExpandedPanel } from './components';
import { getResponseWithMostSevereStatusCode } from '../../../lib/utils';
import { useStyles } from './editor_styles';
import { PanelStorage } from './panel_storage';
import { DEBOUNCE_DELAY } from '../../const';
import { editorI18n } from './editor_i18n';
import { useResizerButtonStyles } from '../styles';

const PANEL_MIN_SIZE = '20%';

interface Props {
  loading: boolean;
  inputEditorValue: string;
  setInputEditorValue: (value: string) => void;
}

export const Editor = memo(({ loading, inputEditorValue, setInputEditorValue }: Props) => {
  const {
    services: { objectStorageClient },
  } = useServicesContext();
  const styles = useStyles();
  const resizerStyles = useResizerButtonStyles();

  const panelStorage = useMemo(() => new PanelStorage(), []);
  const [firstPanelSize, secondPanelSize] = useMemo(
    () => panelStorage.getPanelSize(),
    [panelStorage]
  );

  // only used to hide content
  const { currentTextObject } = useEditorReadContext();

  const {
    requestInFlight,
    lastResult: { data: requestData, error: requestError },
  } = useRequestReadContext();

  // request related
  const dispatch = useRequestActionContext();
  // localStorage related
  const editorDispatch = useEditorActionContext();

  // used for showing a loading state when fetching autocomplete entities
  const [fetchingAutocompleteEntities, setFetchingAutocompleteEntities] = useState(false);

  const isVerticalLayout = useIsWithinBreakpoints(['xs', 's', 'm']);

  // note that the currentTextObject isn't updated, but its ok
  // because its really just providing a createdAt date
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const debouncedUpdateLocalStorageValue = useCallback(
    debounce((newValue: string | undefined) => {
      const textObject = {
        ...currentTextObject,
        text: newValue,
        updatedAt: Date.now(),
      } as TextObject;

      objectStorageClient.text.update(textObject);

      editorDispatch({
        type: 'setCurrentTextObject',
        payload: textObject,
      });
    }, DEBOUNCE_DELAY),
    []
  );

  // Always keep the localstorage value in sync with the value in the editor
  // to avoid losing the text object when the user navigates away from the shell
  useEffect(() => {
    debouncedUpdateLocalStorageValue(inputEditorValue);
  }, [debouncedUpdateLocalStorageValue, inputEditorValue]);

  if (!currentTextObject) return null;

  const data = getResponseWithMostSevereStatusCode(requestData) ?? requestError;
  const isLoading = loading || requestInFlight;

  return (
    <OutputFilterContextProvider>
      {fetchingAutocompleteEntities ? (
        <div css={styles.requestProgressBarContainer}>
          <EuiProgress size="xs" color="accent" position="absolute" />
        </div>
      ) : null}
      <EuiResizableContainer
        css={styles.fullHeightPanel}
        direction={isVerticalLayout ? 'vertical' : 'horizontal'}
        onPanelWidthChange={(sizes) =>
          panelStorage.setPanelSize(sizes as { inputPanel: number; outputPanel: number })
        }
        data-test-subj="consoleEditorContainer"
      >
        {(EuiResizablePanel, EuiResizableButton) => (
          <>
            <EuiResizablePanel
              initialSize={firstPanelSize}
              minSize={PANEL_MIN_SIZE}
              tabIndex={0}
              paddingSize="none"
              id="inputPanel"
            >
              <EuiSplitPanel.Outer
                grow={true}
                borderRadius="none"
                hasShadow={false}
                css={styles.fullHeightPanel}
              >
                <EuiSplitPanel.Inner
                  paddingSize="none"
                  grow={true}
                  css={[styles.consoleEditorPanel, styles.editorPanelPositioned]}
                >
                  <InputPanel
                    loading={loading}
                    inputEditorValue={inputEditorValue}
                    setInputEditorValue={setInputEditorValue}
                    setFetchingAutocompleteEntities={setFetchingAutocompleteEntities}
                  />
                </EuiSplitPanel.Inner>

                {!loading && (
                  <EuiSplitPanel.Inner
                    grow={false}
                    paddingSize="s"
                    color="subdued"
                    css={styles.consoleEditorPanel}
                  >
                    <EuiButtonEmpty
                      size="xs"
                      color="primary"
                      data-test-subj="clearConsoleInput"
                      onClick={() => {
                        setInputEditorValue('');
                      }}
                    >
                      {editorI18n.clearConsoleInputButton}
                    </EuiButtonEmpty>
                  </EuiSplitPanel.Inner>
                )}
              </EuiSplitPanel.Outer>
            </EuiResizablePanel>

            <EuiResizableButton
              css={resizerStyles}
              aria-label={
                isVerticalLayout
                  ? editorI18n.adjustPanelSizeVertical
                  : editorI18n.adjustPanelSizeHorizontal
              }
            />

            <EuiResizablePanel
              initialSize={secondPanelSize}
              minSize={PANEL_MIN_SIZE}
              tabIndex={0}
              paddingSize="none"
              id="outputPanel"
            >
              <EuiSplitPanel.Outer
                borderRadius="none"
                hasShadow={false}
                css={styles.fullHeightPanel}
              >
                <EuiSplitPanel.Inner paddingSize="none" css={styles.outputPanelContent}>
                  <OutputPanel loading={isLoading} />
                </EuiSplitPanel.Inner>

                {(data || isLoading) && (
                  <EuiSplitPanel.Inner
                    grow={false}
                    paddingSize="s"
                    css={styles.actionsPanelWithBackground}
                  >
                    <EuiFlexGroup gutterSize="none" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiButtonEmpty
                          size="xs"
                          color="primary"
                          data-test-subj="clearConsoleOutput"
                          onClick={() => dispatch({ type: 'cleanRequest', payload: undefined })}
                        >
                          {editorI18n.clearConsoleOutputButton}
                        </EuiButtonEmpty>
                      </EuiFlexItem>

                      <EuiFlexItem />

                      <EuiFlexItem grow={false}>
                        <OutputFilterControls />
                      </EuiFlexItem>

                      <EuiFlexItem grow={false} style={{ marginLeft: 8 }}>
                        <NetworkRequestStatusBar />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiSplitPanel.Inner>
                )}

                <OutputFilterExpandedPanel />
              </EuiSplitPanel.Outer>
            </EuiResizablePanel>
          </>
        )}
      </EuiResizableContainer>
    </OutputFilterContextProvider>
  );
});
