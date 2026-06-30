/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { History } from 'history';
import type { EmbeddableStateTransfer } from '@kbn/embeddable-plugin/public';
import { navigateToVisualizeEditor } from './navigate_to_visualize_editor';

const setup = () => {
  const stateTransferService = {
    navigateToEditor: jest.fn(),
  } as unknown as EmbeddableStateTransfer;
  const history = { push: jest.fn() } as unknown as History;
  return { stateTransferService, history };
};

describe('navigateToVisualizeEditor', () => {
  it('does not navigate when the item has an error', async () => {
    const { stateTransferService, history } = setup();
    await navigateToVisualizeEditor(
      { id: '1', error: 'broken', editor: { editUrl: '/edit/1' } },
      { stateTransferService, history }
    );
    expect(history.push).not.toHaveBeenCalled();
    expect(stateTransferService.navigateToEditor).not.toHaveBeenCalled();
  });

  it('does not navigate when the item is readOnly', async () => {
    const { stateTransferService, history } = setup();
    await navigateToVisualizeEditor(
      { id: '1', readOnly: true, editor: { editUrl: '/edit/1' } },
      { stateTransferService, history }
    );
    expect(history.push).not.toHaveBeenCalled();
    expect(stateTransferService.navigateToEditor).not.toHaveBeenCalled();
  });

  it('invokes the editor onEdit callback when present', async () => {
    const { stateTransferService, history } = setup();
    const onEdit = jest.fn();
    await navigateToVisualizeEditor(
      { id: '1', editor: { onEdit } },
      { stateTransferService, history }
    );
    expect(onEdit).toHaveBeenCalledWith('1');
    expect(history.push).not.toHaveBeenCalled();
  });

  it('hands off to the target app via the state transfer service when editApp is set', async () => {
    const { stateTransferService, history } = setup();
    await navigateToVisualizeEditor(
      { id: '1', editor: { editApp: 'lens', editUrl: '/edit/1' } },
      { stateTransferService, history }
    );
    expect(stateTransferService.navigateToEditor).toHaveBeenCalledWith('lens', {
      path: '/edit/1',
      state: { originatingApp: 'visualize' },
    });
    expect(history.push).not.toHaveBeenCalled();
  });

  it('pushes onto the local router when editApp is unset', async () => {
    const { stateTransferService, history } = setup();
    await navigateToVisualizeEditor(
      { id: '1', editor: { editUrl: '/edit/1' } },
      { stateTransferService, history }
    );
    expect(history.push).toHaveBeenCalledWith('/edit/1');
    expect(stateTransferService.navigateToEditor).not.toHaveBeenCalled();
  });
});
