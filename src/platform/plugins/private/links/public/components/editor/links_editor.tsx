/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMountedState from 'react-use/lib/useMountedState';

import type { DropResult, EuiButtonGroupOptionProps, UseEuiTheme } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiDragDropContext,
  euiDragDropReorder,
  EuiDraggable,
  EuiDroppable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiSwitch,
  EuiTitle,
} from '@elastic/eui';
import { css, keyframes } from '@emotion/react';

import { LINKS_HORIZONTAL_LAYOUT, LINKS_VERTICAL_LAYOUT } from '../../../common/constants';
import type { LinksLayoutType } from '../../../common/types';
import { focusMainFlyout } from '../../editor/links_editor_tools';
import { openLinkEditorFlyout } from '../../editor/open_link_editor_flyout';
import { coreServices } from '../../services/kibana_services';
import type { ResolvedLink } from '../../types';
import { LinksStrings } from '../links_strings';
import { TooltipWrapper } from '../tooltip_wrapper';
import { LinksEditorEmptyPrompt } from './links_editor_empty_prompt';
import { LinksEditorSingleLink } from './links_editor_single_link';

const layoutOptions: EuiButtonGroupOptionProps[] = [
  {
    id: LINKS_VERTICAL_LAYOUT,
    label: LinksStrings.editor.panelEditor.getVerticalLayoutLabel(),
    'data-test-subj': `links--panelEditor--${LINKS_VERTICAL_LAYOUT}LayoutBtn`,
  },
  {
    id: LINKS_HORIZONTAL_LAYOUT,
    label: LinksStrings.editor.panelEditor.getHorizontalLayoutLabel(),
    'data-test-subj': `links--panelEditor--${LINKS_HORIZONTAL_LAYOUT}LayoutBtn`,
  },
];

export interface LinksEditorProps {
  onSaveToLibrary: (newLinks: ResolvedLink[], newLayout: LinksLayoutType) => Promise<void>;
  onAddToDashboard: (newLinks: ResolvedLink[], newLayout: LinksLayoutType) => void;
  onClose: () => void;
  initialLinks?: ResolvedLink[];
  initialLayout?: LinksLayoutType;
  parentDashboardId?: string;
  isByReference: boolean;
  flyoutId: string; // used to manage the focus of this flyout after individual link editor flyout is closed
}

export const LinksEditor = ({
  onSaveToLibrary,
  onAddToDashboard,
  onClose,
  initialLinks,
  initialLayout,
  parentDashboardId,
  isByReference,
  flyoutId,
}: LinksEditorProps) => {
  const toasts = coreServices.notifications.toasts;
  const isMounted = useMountedState();
  const editLinkFlyoutRef = useRef<HTMLDivElement>(null);

  const [currentLayout, setCurrentLayout] = useState<LinksLayoutType>(
    initialLayout ?? LINKS_VERTICAL_LAYOUT
  );
  const [isSaving, setIsSaving] = useState(false);
  const [orderedLinks, setOrderedLinks] = useState<ResolvedLink[]>([]);
  const [saveByReference, setSaveByReference] = useState(isByReference);

  const isEditingExisting = initialLinks || isByReference;

  useEffect(() => {
    if (!initialLinks) {
      setOrderedLinks([]);
      return;
    }
    setOrderedLinks(initialLinks);
  }, [initialLinks]);

  const onDragEnd = useCallback(
    ({ source, destination }: DropResult) => {
      if (source && destination) {
        const newList = euiDragDropReorder(orderedLinks, source.index, destination.index).map(
          (link, i) => {
            return link;
          }
        );
        setOrderedLinks(newList);
      }
    },
    [orderedLinks]
  );

  const addOrEditLink = useCallback(
    async (linkToEdit?: ResolvedLink) => {
      const newLink = await openLinkEditorFlyout({
        parentDashboardId,
        link: linkToEdit,
        mainFlyoutId: flyoutId,
        ref: editLinkFlyoutRef,
      });
      if (newLink) {
        if (linkToEdit) {
          setOrderedLinks(
            orderedLinks.map((link) => {
              if (link.id === linkToEdit.id) {
                return newLink as ResolvedLink;
              }
              return link;
            })
          );
        } else {
          setOrderedLinks([...orderedLinks, newLink as ResolvedLink]);
        }
      }
    },
    [editLinkFlyoutRef, orderedLinks, parentDashboardId, flyoutId]
  );

  const hasZeroLinks = useMemo(() => {
    return orderedLinks.length === 0;
  }, [orderedLinks]);

  const deleteLink = useCallback(
    (linkId: string) => {
      setOrderedLinks(
        orderedLinks.filter((link) => {
          return link.id !== linkId;
        })
      );
      focusMainFlyout(flyoutId);
    },
    [orderedLinks, flyoutId]
  );

  return (
    <>
      <div css={styles.flyoutStyles} ref={editLinkFlyoutRef} />
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s" data-test-subj="links--panelEditor--title">
              <h2>
                {isEditingExisting
                  ? LinksStrings.editor.panelEditor.getEditFlyoutTitle()
                  : LinksStrings.editor.panelEditor.getCreateFlyoutTitle()}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody css={styles.bodyStyles}>
        <EuiForm fullWidth>
          <EuiFormRow label={LinksStrings.editor.panelEditor.getLayoutSettingsTitle()}>
            <EuiButtonGroup
              options={layoutOptions}
              buttonSize="compressed"
              idSelected={currentLayout}
              onChange={(id) => {
                setCurrentLayout(id as LinksLayoutType);
              }}
              legend={LinksStrings.editor.panelEditor.getLayoutSettingsLegend()}
            />
          </EuiFormRow>
          <EuiFormRow label={LinksStrings.editor.panelEditor.getLinksTitle()}>
            {/* Needs to be surrounded by a div rather than a fragment so the EuiFormRow can respond
                to the focus of the inner elements */}
            <div>
              {hasZeroLinks ? (
                <LinksEditorEmptyPrompt addLink={() => addOrEditLink()} />
              ) : (
                <>
                  <EuiDragDropContext onDragEnd={onDragEnd}>
                    <EuiDroppable
                      css={styles.droppableStyles}
                      droppableId="linksDroppableLinksArea"
                      data-test-subj="links--panelEditor--linksAreaDroppable"
                    >
                      {orderedLinks.map((link, idx) => (
                        <EuiDraggable
                          spacing="m"
                          index={idx}
                          key={link.id}
                          draggableId={link.id}
                          customDragHandle={true}
                          hasInteractiveChildren={true}
                          data-test-subj={`links--panelEditor--draggableLink`}
                        >
                          {(provided) => (
                            <LinksEditorSingleLink
                              link={link}
                              editLink={() => addOrEditLink(link)}
                              deleteLink={() => deleteLink(link.id)}
                              dragHandleProps={provided.dragHandleProps ?? undefined} // casting `null` to `undefined`
                            />
                          )}
                        </EuiDraggable>
                      ))}
                    </EuiDroppable>
                  </EuiDragDropContext>
                  <EuiButtonEmpty
                    flush="left"
                    size="s"
                    iconType="plusCircle"
                    onClick={() => addOrEditLink()}
                    data-test-subj="links--panelEditor--addLinkBtn"
                  >
                    {LinksStrings.editor.getAddButtonLabel()}
                  </EuiButtonEmpty>
                </>
              )}
            </div>
          </EuiFormRow>
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup responsive={false} justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={onClose}
              flush="left"
              data-test-subj="links--panelEditor--closeBtn"
            >
              {LinksStrings.editor.getCancelButtonLabel()}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
              {!initialLinks || !isByReference ? (
                <EuiFlexItem grow={false}>
                  <TooltipWrapper
                    condition={!hasZeroLinks}
                    tooltipContent={LinksStrings.editor.panelEditor.getSaveToLibrarySwitchTooltip()}
                    data-test-subj="links--panelEditor--saveByReferenceTooltip"
                  >
                    <EuiSwitch
                      compressed
                      label={LinksStrings.editor.panelEditor.getSaveToLibrarySwitchLabel()}
                      checked={saveByReference}
                      disabled={hasZeroLinks}
                      onChange={() => setSaveByReference(!saveByReference)}
                      data-test-subj="links--panelEditor--saveByReferenceSwitch"
                    />
                  </TooltipWrapper>
                </EuiFlexItem>
              ) : null}
              <EuiFlexItem grow={false}>
                <TooltipWrapper
                  condition={hasZeroLinks}
                  tooltipContent={LinksStrings.editor.panelEditor.getEmptyLinksTooltip()}
                  data-test-id={'links--panelEditor--saveBtnTooltip'}
                >
                  <EuiButton
                    fill
                    isLoading={isSaving}
                    disabled={hasZeroLinks}
                    data-test-subj={'links--panelEditor--saveBtn'}
                    onClick={async () => {
                      if (saveByReference) {
                        setIsSaving(true);
                        onSaveToLibrary(orderedLinks, currentLayout)
                          .catch((e) => {
                            toasts.addError(e, {
                              title: LinksStrings.editor.panelEditor.getErrorDuringSaveToastTitle(),
                            });
                          })
                          .finally(() => {
                            if (isMounted()) {
                              setIsSaving(false);
                            }
                          });
                      } else {
                        onAddToDashboard(orderedLinks, currentLayout);
                      }
                    }}
                  >
                    {LinksStrings.editor.panelEditor.getSaveButtonLabel()}
                  </EuiButton>
                </TooltipWrapper>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </>
  );
};

// required for dynamic import using React.lazy()
// eslint-disable-next-line import/no-default-export
export default LinksEditor;

const styles = {
  droppableStyles: ({ euiTheme }: UseEuiTheme) => css({ margin: `0 -${euiTheme.size.xs}` }),
  bodyStyles: css({
    // EUI TODO: We need to set transform to 'none' to avoid drag/drop issues in the flyout caused by the
    // `transform: translateZ(0)` workaround for the mask image bug in Chromium.
    // https://github.com/elastic/eui/pull/7855.
    '& .euiFlyoutBody__overflow': {
      transform: 'none',
    },
  }),
  flyoutStyles: ({ euiTheme }: UseEuiTheme) => {
    const euiFlyoutOpenAnimation = keyframes`
    0% {
      opacity: 0;
      transform: translateX(100%);
    }

    100% {
      opacity: 1;
      transform: translateX(0%);
    }
  `;

    const euiFlyoutCloseAnimation = keyframes`
    0% {
      opacity: 1;
      transform: translateX(0%);
    }

    100% {
      opacity: 0;
      transform: translateX(100%);
    }`;

    return css({
      '.linkEditor': {
        maxInlineSize: `calc(${euiTheme.size.xs} * 125)`,
        height: 'var(--kbn-layout--application-height)',
        position: 'fixed',
        display: 'flex',
        inlineSize: '50vw',
        zIndex: euiTheme.levels.flyout,
        alignItems: 'stretch',
        flexDirection: 'column',
        borderLeft: euiTheme.border.thin,
        background: euiTheme.colors.backgroundBasePlain,
        minWidth: `calc((${euiTheme.size.xl} * 13) + ${euiTheme.size.s})`, // 424px
        '&.in': {
          animation: `${euiFlyoutOpenAnimation} ${euiTheme.animation.normal} ${euiTheme.animation.resistance}`,
        },
        '&.out': {
          animation: `${euiFlyoutCloseAnimation} ${euiTheme.animation.normal} ${euiTheme.animation.resistance}`,
        },
      },
    });
  },
};
