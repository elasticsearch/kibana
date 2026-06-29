/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { LENS_ATTACHMENT_TYPE } from '../../../../common';
import {
  AttachmentActionType,
  type UnifiedValueAttachmentViewProps,
} from '../../../client/attachment_framework/types';

import { basicCase } from '../../../containers/mock';
import { getVisualizationAttachmentType } from '.';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';
import { renderWithTestingProviders } from '../../../common/mock';

describe('getVisualizationAttachmentType', () => {
  const mockEmbeddableComponent = jest
    .fn()
    .mockReturnValue(<div data-test-subj="embeddableComponent" />);

  const attachmentViewProps: UnifiedValueAttachmentViewProps = {
    data: {
      state: {
        attributes: { state: { query: {} } },
        timeRange: {},
      },
    },
    createdBy: { username: 'elastic', fullName: null, email: null, profileUid: undefined },
    version: '1',
    savedObjectId: 'test',
    caseData: { title: basicCase.title, id: basicCase.id },
    rowContext: {
      appId: 'cases',
      manageMarkdownEditIds: [],
      selectedOutlineCommentId: '',
      loadingCommentIds: [],
      euiTheme: {} as never,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create the attachment type correctly', () => {
    const lensType = getVisualizationAttachmentType();

    expect(lensType).toStrictEqual({
      id: LENS_ATTACHMENT_TYPE,
      icon: 'document',
      displayName: 'Visualizations',
      getAttachmentViewObject: expect.any(Function),
      getAttachmentRemovalObject: expect.any(Function),
      schema: expect.any(Object),
      workflowSchema: false,
    });
  });

  describe('getAttachmentViewObject', () => {
    it('renders the event correctly', () => {
      const lensType = getVisualizationAttachmentType();
      const event = lensType.getAttachmentViewObject(attachmentViewProps).event;

      expect(event).toBe('added visualization');
    });

    it('renders the timelineAvatar correctly', () => {
      const lensType = getVisualizationAttachmentType();
      const avatar = lensType.getAttachmentViewObject(attachmentViewProps).timelineAvatar;

      expect(avatar).toBe('lensApp');
    });

    it('does not hide the default actions', () => {
      const lensType = getVisualizationAttachmentType();
      const hideDefaultActions =
        lensType.getAttachmentViewObject(attachmentViewProps).hideDefaultActions;

      expect(hideDefaultActions).toBe(false);
    });

    it('set the custom actions correctly', () => {
      const lensType = getVisualizationAttachmentType();
      const actions = lensType
        .getAttachmentViewObject(attachmentViewProps)
        .getActions?.(attachmentViewProps)!;

      expect(actions.length).toBe(1);

      expect(actions[0]).toEqual({
        type: AttachmentActionType.CUSTOM,
        isPrimary: false,
        render: expect.any(Function),
      });
    });

    it('renders the open visualization button correctly', () => {
      const lensType = getVisualizationAttachmentType();
      const actions = lensType
        .getAttachmentViewObject(attachmentViewProps)
        .getActions?.(attachmentViewProps)!;

      const openLensButton = actions[0];

      const services = createStartServicesMock();
      services.lens.EmbeddableComponent = mockEmbeddableComponent;
      services.lens.canUseEditor = () => true;
      // @ts-expect-error: render exists on CustomAttachmentAction
      renderWithTestingProviders(openLensButton.render(), { wrapperProps: { services } });

      expect(screen.getByTestId('cases-open-in-visualization-btn')).toBeInTheDocument();
    });

    it('renders the children correctly', async () => {
      const lensType = getVisualizationAttachmentType();
      // eslint-disable-next-line testing-library/no-node-access
      const Component = lensType.getAttachmentViewObject(attachmentViewProps).children!;

      const services = createStartServicesMock();
      services.lens.EmbeddableComponent = mockEmbeddableComponent;

      renderWithTestingProviders(
        <Suspense fallback={'Loading...'}>
          <Component {...attachmentViewProps} />
        </Suspense>,
        { wrapperProps: { services } }
      );

      await waitFor(() => {
        expect(screen.getByTestId('embeddableComponent'));
      });
    });
  });

  describe('getAttachmentRemovalObject', () => {
    it('renders the removal event correctly', () => {
      const lensType = getVisualizationAttachmentType();
      const event = lensType.getAttachmentRemovalObject?.(attachmentViewProps);

      expect(event).toEqual({ event: 'removed visualization' });
    });
  });
});
