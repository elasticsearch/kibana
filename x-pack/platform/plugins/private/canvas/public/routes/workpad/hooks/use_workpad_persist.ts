/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useEffect } from 'react';
import usePrevious from 'react-use/lib/usePrevious';
import { useDispatch, useSelector } from 'react-redux';
import type { CanvasWorkpad, State } from '../../../../types';
import { getWorkpad } from '../../../state/selectors/workpad';
import { canUserWrite } from '../../../state/selectors/app';
import { setWorkpadTimestamp } from '../../../state/actions/workpad';
import { notifyError } from '../../../lib/assets';
import { getCanvasWorkpadService } from '../../../services/canvas_workpad_service';

export const useWorkpadPersist = () => {
  const dispatch = useDispatch();

  // Watch for workpad state and then persist those changes
  const [workpad, canWrite]: [CanvasWorkpad, boolean] = useSelector((state: State) => [
    getWorkpad(state),
    canUserWrite(state),
  ]);

  const previousWorkpad = usePrevious(workpad);

  const workpadChanged = previousWorkpad && workpad !== previousWorkpad;

  // The server stamps `@timestamp` on every save, while local edits leave it
  // untouched. So a changed `@timestamp` means this workpad was (re)loaded from
  // the server (e.g. by the auto-refresh reload) rather than edited locally —
  // persisting it would echo a server reload straight back, so we skip it.
  const reloadedFromServer = Boolean(
    previousWorkpad && workpad['@timestamp'] !== previousWorkpad['@timestamp']
  );

  useEffect(() => {
    if (canWrite) {
      if (workpadChanged && !reloadedFromServer) {
        getCanvasWorkpadService()
          .updateWorkpad(workpad.id, workpad)
          .then((response) => {
            // The server re-stamps `@timestamp` on every save. Sync it back into
            // state so the next auto-refresh doesn't treat this save as an external
            // change and reload the workpad (which would re-run every renderable).
            if (response?.['@timestamp']) {
              dispatch(setWorkpadTimestamp(response['@timestamp']));
            }
          })
          .catch((err) => {
            notifyError(err);
          });
      }
    }
  }, [workpad, workpadChanged, reloadedFromServer, canWrite, dispatch]);
};
