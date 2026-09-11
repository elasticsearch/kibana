/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { WAIT_FOR_FUNCTION_TIMEOUT_MS } from './lens_editor_helpers';

/** `LensApp` helpers needed by plugin-local drag-and-drop / field-list actions. */
interface LensDragDropDeps {
  getFieldAttrName: (field: string) => string;
  getFieldListPanelFieldLocator: (field: string) => Locator;
  waitForLensDragDropToFinish: () => Promise<void>;
  html5DragAndDrop: (from: string, to: string) => Promise<void>;
  waitForVisualization: (chartTestSubj: string) => Promise<void>;
}

/**
 * Lens editor drag-and-drop variants beyond shared `dragFieldToWorkspace`
 * (geo, extra drop types, reorder, keyboard DnD, field-list / data-panel helpers).
 */
export class LensDragDrop {
  constructor(private readonly page: ScoutPage, private readonly deps: LensDragDropDeps) {}

  /**
   * Geo workspace drop target only mounts after dragstart on a geo field, so
   * Playwright `dragTo` cannot resolve the target up-front. Mirror FTR
   * `html5DragAndDrop`: dispatch dragstart, wait for the geo drop zone, drop.
   */
  async dragFieldToGeoFieldWorkspace(field: string) {
    const fieldLocator = this.deps.getFieldListPanelFieldLocator(field);
    await fieldLocator.waitFor({ state: 'visible' });
    const fieldTestSubj =
      (await fieldLocator.getAttribute('data-test-subj')) ??
      `lnsFieldListPanelField-${this.deps.getFieldAttrName(field)}`;

    await this.page.evaluate((fromSel: string) => {
      interface Transfer {
        data: Record<string, string>;
        setData: (key: string, value: string) => void;
        getData: (key: string) => string;
      }

      function createEvent(typeOfEvent: string) {
        const event = document.createEvent('CustomEvent') as CustomEvent & {
          dataTransfer: Transfer;
        };
        event.initCustomEvent(typeOfEvent, true, true, null);
        event.dataTransfer = {
          data: {},
          setData(key: string, value: string) {
            this.data[key] = value;
          },
          getData(key: string) {
            return this.data[key];
          },
        };
        return event;
      }

      const origin = document.querySelector(`[data-test-subj="${fromSel}"]`);
      if (!origin) {
        throw new Error(`dragFieldToGeoFieldWorkspace: origin not found for ${fromSel}`);
      }
      const dragStartEvent = createEvent('dragstart');
      origin.dispatchEvent(dragStartEvent);
      (window as unknown as { __lensGeoDragTransfer?: Transfer }).__lensGeoDragTransfer =
        dragStartEvent.dataTransfer;
    }, fieldTestSubj);

    const dropTarget = this.page.testSubj.locator('lnsGeoFieldWorkspace');
    await dropTarget.waitFor({ state: 'visible' });

    await this.page.evaluate(() => {
      interface Transfer {
        data: Record<string, string>;
        setData: (key: string, value: string) => void;
        getData: (key: string) => string;
      }
      const transfer = (window as unknown as { __lensGeoDragTransfer?: Transfer })
        .__lensGeoDragTransfer;
      const target = document.querySelector('[data-test-subj="lnsGeoFieldWorkspace"]');
      if (!target || !transfer) {
        throw new Error('dragFieldToGeoFieldWorkspace: drop target or transfer missing');
      }

      function createEvent(typeOfEvent: string) {
        const event = document.createEvent('CustomEvent') as CustomEvent & {
          dataTransfer: Transfer;
        };
        event.initCustomEvent(typeOfEvent, true, true, null);
        event.dataTransfer = transfer!;
        return event;
      }

      target.dispatchEvent(createEvent('dragenter'));
      target.dispatchEvent(createEvent('dragover'));
      target.dispatchEvent(createEvent('drop'));
      delete (window as unknown as { __lensGeoDragTransfer?: Transfer }).__lensGeoDragTransfer;
    });

    await this.deps.waitForLensDragDropToFinish();
  }

  /**
   * HTML5 DnD between dimension triggers/drop targets (FTR `dragDimensionToDimension`).
   * Both `from` and `to` are test-subj chains (e.g. `panel > lns-dimensionTrigger`).
   */
  async dragDimensionToDimension({ from, to }: { from: string; to: string }) {
    // Chains may match multiple nodes (e.g. Y panel with duplicates); wait for presence, not strict unique.
    await this.page.waitForFunction(
      (chain) => {
        const parts = chain.split('>').map((p: string) => p.trim());
        let nodes: Element[] = [document.body];
        for (const part of parts) {
          const next: Element[] = [];
          for (const node of nodes) {
            next.push(...Array.from(node.querySelectorAll(`[data-test-subj="${part}"]`)));
          }
          nodes = next;
        }
        return nodes.length > 0;
      },
      from,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    await this.page.waitForFunction(
      (chain) => {
        const parts = chain.split('>').map((p: string) => p.trim());
        let nodes: Element[] = [document.body];
        for (const part of parts) {
          const next: Element[] = [];
          for (const node of nodes) {
            next.push(...Array.from(node.querySelectorAll(`[data-test-subj="${part}"]`)));
          }
          nodes = next;
        }
        return nodes.length > 0;
      },
      to,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    await this.deps.html5DragAndDrop(from, to);
    await this.deps.waitForLensDragDropToFinish();
  }

  /** Drags a field onto a dimension trigger / empty slot (test-subj chain). */
  async dragFieldToDimensionTrigger(field: string, dimension: string) {
    const fieldLocator = this.deps.getFieldListPanelFieldLocator(field);
    await fieldLocator.waitFor({ state: 'visible' });
    const fieldTestSubj =
      (await fieldLocator.getAttribute('data-test-subj')) ??
      `lnsFieldListPanelField-${this.deps.getFieldAttrName(field)}`;
    await this.page.testSubj.locator(dimension).waitFor({ state: 'visible' });
    await this.deps.html5DragAndDrop(fieldTestSubj, dimension);
    await this.deps.waitForLensDragDropToFinish();
  }

  /**
   * Reorders dimensions within a group (1-based indices, FTR `reorderDimensions`).
   * The reorderable drop layer only mounts after dragstart, so the full DnD runs in-page.
   * Waits for the drop layer to become an active droppable (same signal as `html5DragAndDrop`)
   * instead of a fixed sleep.
   */
  async reorderDimensions(dimension: string, startIndex: number, endIndex: number) {
    await this.page.waitForFunction(
      ({ panelSubj, minCount }) =>
        document.querySelectorAll(`[data-test-subj="${panelSubj}"]`).length >= minCount,
      { panelSubj: dimension, minCount: Math.max(startIndex, endIndex) },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    await this.page.evaluate(
      async ([panelSubj, startIdx, endIdx]) => {
        interface Transfer {
          data: Record<string, string>;
          setData: (key: string, value: string) => void;
          getData: (key: string) => string;
        }

        function createEvent(typeOfEvent: string) {
          const event = document.createEvent('CustomEvent') as CustomEvent & {
            dataTransfer: Transfer;
          };
          event.initCustomEvent(typeOfEvent, true, true, null);
          event.dataTransfer = {
            data: {},
            setData(key: string, value: string) {
              this.data[key] = value;
            },
            getData(key: string) {
              return this.data[key];
            },
          };
          return event;
        }

        function getReorderDropTarget(): Element | null {
          const panels = Array.from(document.querySelectorAll(`[data-test-subj="${panelSubj}"]`));
          return (
            panels[endIdx - 1]?.querySelector(
              `[data-test-subj="lnsDragDrop-reorderableDropLayer"]`
            ) ?? null
          );
        }

        async function waitForReorderDropTarget(timeout: number) {
          // Reorder drop layers mount after dragstart; they don't always pick up
          // `domDroppable--active` the way group-to-group drops do — wait for mount.
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const element = getReorderDropTarget();
            if (element) {
              return element;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return null;
        }

        const panels = Array.from(document.querySelectorAll(`[data-test-subj="${panelSubj}"]`));
        const origin = panels[startIdx - 1]?.querySelector('.domDraggable');
        if (!origin) {
          throw new Error(
            `reorderDimensions: missing origin for ${panelSubj} index ${startIdx} (found ${panels.length} panels)`
          );
        }
        const dragStartEvent = createEvent('dragstart');
        origin.dispatchEvent(dragStartEvent);

        const target = await waitForReorderDropTarget(2_000);
        if (!target) {
          throw new Error(
            `reorderDimensions: drop layer never mounted for ${panelSubj} index ${endIdx}`
          );
        }
        const dropEvent = createEvent('drop');
        dropEvent.dataTransfer = dragStartEvent.dataTransfer;
        target.dispatchEvent(dropEvent);
        const dragEndEvent = createEvent('dragend');
        dragEndEvent.dataTransfer = dropEvent.dataTransfer;
        origin.dispatchEvent(dragEndEvent);
      },
      [dimension, startIndex, endIndex] as [string, number, number]
    );
    await this.deps.waitForLensDragDropToFinish();
  }

  /**
   * Drags over a dimension group and drops on an extra target (duplicate/swap/combine).
   * Waits for droppable active/hover readiness (same pattern as `html5DragAndDrop`) instead
   * of fixed sleeps.
   */
  private async dragEnterDrop(dragging: string, draggedOver: string, dropTarget: string) {
    await this.page.evaluate(
      async ([fromSel, overSel, dropSel]) => {
        interface Transfer {
          data: Record<string, string>;
          setData: (key: string, value: string) => void;
          getData: (key: string) => string;
        }

        function createEvent(typeOfEvent: string) {
          const event = document.createEvent('CustomEvent') as CustomEvent & {
            dataTransfer: Transfer;
          };
          event.initCustomEvent(typeOfEvent, true, true, null);
          event.dataTransfer = {
            data: {},
            setData(key: string, value: string) {
              this.data[key] = value;
            },
            getData(key: string) {
              return this.data[key];
            },
          };
          return event;
        }

        function queryChain(chain: string): Element | null {
          // CSS selector (starts with `[`) or test-subj chain with `>`
          if (chain.trim().startsWith('[')) {
            return document.querySelector(chain);
          }
          const parts = chain.split('>').map((p) => p.trim());
          let nodes: Element[] = [document.body];
          for (const part of parts) {
            const next: Element[] = [];
            for (const node of nodes) {
              next.push(...Array.from(node.querySelectorAll(`[data-test-subj="${part}"]`)));
            }
            nodes = next;
          }
          return nodes[0] ?? null;
        }

        async function waitForTargetWithClass(chain: string, className: string, timeout: number) {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const element = queryChain(chain);
            if (element?.closest('.domDroppable')?.classList.contains(className)) {
              return element;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return null;
        }

        async function waitForElement(chain: string, timeout: number) {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const element = queryChain(chain);
            if (element) {
              return element;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return null;
        }

        const origin = queryChain(fromSel);
        if (!origin) {
          throw new Error(`dragEnterDrop: origin not found for ${fromSel}`);
        }
        const dragStartEvent = createEvent('dragstart');
        origin.dispatchEvent(dragStartEvent);

        const over = await waitForTargetWithClass(overSel, 'domDroppable--active', 2_000);
        if (!over) {
          throw new Error(`dragEnterDrop: draggedOver never became active for ${overSel}`);
        }
        const dragenter = createEvent('dragenter');
        dragenter.dataTransfer = dragStartEvent.dataTransfer;
        over.dispatchEvent(dragenter);
        const dragover = createEvent('dragover');
        dragover.dataTransfer = dragStartEvent.dataTransfer;
        over.dispatchEvent(dragover);

        // Extra drop targets (duplicate/swap/combine) mount after the hover; wait for them
        // rather than sleeping a fixed interval.
        const target = await waitForElement(dropSel, 5_000);
        if (!target) {
          throw new Error(`dragEnterDrop: dropTarget not found for ${dropSel}`);
        }
        const dropEvent = createEvent('drop');
        dropEvent.dataTransfer = dragStartEvent.dataTransfer;
        target.dispatchEvent(dropEvent);
        const dragEndEvent = createEvent('dragend');
        dragEndEvent.dataTransfer = dropEvent.dataTransfer;
        origin.dispatchEvent(dragEndEvent);
      },
      [dragging, draggedOver, dropTarget] as [string, string, string]
    );
  }

  async dragFieldToExtraDropType(
    field: string,
    to: string,
    type: 'duplicate' | 'swap' | 'combine',
    visDataTestSubj?: string
  ) {
    const fieldLocator = this.deps.getFieldListPanelFieldLocator(field);
    await fieldLocator.waitFor({ state: 'visible' });
    const fieldTestSubj =
      (await fieldLocator.getAttribute('data-test-subj')) ??
      `lnsFieldListPanelField-${this.deps.getFieldAttrName(field)}`;
    await this.dragEnterDrop(
      fieldTestSubj,
      `${to} > lnsDragDrop-domDroppable`,
      `${to} > domDragDrop-dropTarget-${type}`
    );
    if (visDataTestSubj) {
      await this.deps.waitForVisualization(visDataTestSubj);
    }
  }

  async dragDimensionToExtraDropType(
    from: string,
    to: string,
    type: 'duplicate' | 'swap' | 'combine',
    visDataTestSubj?: string
  ) {
    await this.page.testSubj.locator(from).waitFor({ state: 'visible' });
    await this.dragEnterDrop(
      from,
      `${to} > lnsDragDrop-domDroppable`,
      `${to} > domDragDrop-dropTarget-${type}`
    );
    if (visDataTestSubj) {
      await this.deps.waitForVisualization(visDataTestSubj);
    }
  }

  /** Active keyboard-DnD drop target key (test-subj or class+text fallback). */
  private async getKeyboardDragActiveKey(): Promise<string> {
    return this.page.evaluate(() => {
      const active = document.querySelector('.domDroppable--active, .domDroppable--hover');
      if (!active) {
        return '';
      }
      return (
        active.getAttribute('data-test-subj') ??
        `${active.className}:${(active.textContent ?? '').slice(0, 40)}`
      );
    });
  }

  /**
   * Pace between Lens keyboard DnD arrow presses (FTR `common.sleep(200)`).
   * Lens does not expose a reliable settle signal here: waiting for
   * `.domDroppable--active` key changes times out on common workspace drops
   * (highlight often updates without a distinct key). Intentional short sleep.
   */
  private async paceKeyboardDragDrop(previousActiveKey?: string): Promise<string> {
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(200);
    return (await this.getKeyboardDragActiveKey()) || previousActiveKey || '';
  }

  /**
   * Keyboard-drags a field onto a drop target by arrow steps (FTR `dragFieldWithKeyboard`).
   */
  async dragFieldWithKeyboard(fieldName: string, steps = 1, reverse = false) {
    const handler = this.page.locator(
      `[data-attr-field="${fieldName}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
    );
    // Prefer available-fields handler when the field is listed twice (selected + available).
    const availableHandler = this.page.locator(
      `[data-test-subj="lnsIndexPatternAvailableFields"] [data-attr-field="${fieldName}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
    );
    const target = (await availableHandler.count()) > 0 ? availableHandler : handler;
    await target.waitFor({ state: 'visible' });
    await target.focus();
    await this.page.keyboard.press('Enter');
    await this.page.waitForFunction(
      () => document.querySelectorAll('.domDroppable--active').length > 0,
      undefined,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    let activeKey = await this.paceKeyboardDragDrop();
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press(reverse ? 'ArrowLeft' : 'ArrowRight');
      activeKey = await this.paceKeyboardDragDrop(activeKey);
    }
    await this.page.keyboard.press('Enter');
    await this.deps.waitForLensDragDropToFinish();
  }

  /**
   * Keyboard-moves a dimension by arrow steps (FTR `dimensionKeyboardDragDrop`).
   */
  async dimensionKeyboardDragDrop(group: string, index = 0, steps = 1, reverse = false) {
    const handlersLocator = this.page.locator(
      `[data-test-subj="${group}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
    );
    await this.page.waitForFunction(
      ({ groupSubj, min }) =>
        document.querySelectorAll(
          `[data-test-subj="${groupSubj}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
        ).length > min,
      { groupSubj: group, min: index },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    const handlers = await handlersLocator.all();
    const handler = handlers[index];
    if (!handler) {
      throw new Error(`dimensionKeyboardDragDrop: handler not found at index ${index}`);
    }
    await handler.focus();
    await this.page.keyboard.press('Enter');
    let activeKey = await this.paceKeyboardDragDrop();
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press(reverse ? 'ArrowLeft' : 'ArrowRight');
      activeKey = await this.paceKeyboardDragDrop(activeKey);
    }
    await this.paceKeyboardDragDrop(activeKey);
    await this.page.keyboard.press('Enter');
    await this.deps.waitForLensDragDropToFinish();
  }

  /**
   * Keyboard-reorders a dimension within its group (FTR `dimensionKeyboardReorder`).
   */
  async dimensionKeyboardReorder(group: string, index = 0, steps = 1, reverse = false) {
    const handlersLocator = this.page.locator(
      `[data-test-subj="${group}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
    );
    await this.page.waitForFunction(
      ({ groupSubj, min }) =>
        document.querySelectorAll(
          `[data-test-subj="${groupSubj}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
        ).length > min,
      { groupSubj: group, min: index },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    const handlers = await handlersLocator.all();
    const handler = handlers[index];
    if (!handler) {
      throw new Error(`dimensionKeyboardReorder: handler not found at index ${index}`);
    }
    await handler.focus();
    await this.page.keyboard.press('Enter');
    let activeKey = await this.paceKeyboardDragDrop();
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press(reverse ? 'ArrowUp' : 'ArrowDown');
      activeKey = await this.paceKeyboardDragDrop(activeKey);
    }
    await this.paceKeyboardDragDrop(activeKey);
    await this.page.keyboard.press('Enter');
    await this.deps.waitForLensDragDropToFinish();
  }

  /** Filters the field list (FTR `searchField`). */
  async searchField(name: string) {
    const input = this.page.testSubj.locator('lnsIndexPatternFieldSearch');
    await input.waitFor({ state: 'visible' });
    await input.fill('');
    await this.page.testSubj.typeWithDelay('lnsIndexPatternFieldSearch', name, { delay: 30 });
  }

  /**
   * Changes the data view in the Lens data panel.
   * Waits for a saved `dataView-{title}` row and fails if it is missing
   * (does not fall back to "Explore matching indices").
   *
   * Does not type into the switcher search box: EuiSelectable filtering races with
   * async option load under CI. Scopes to the :visible switcher because the layer
   * panel also mounts `indexPattern-switcher` (hidden) while the popover is open.
   */
  async switchDataPanelIndexPattern(dataViewTitle: string) {
    const switchLink = this.page.testSubj.locator('lns-dataView-switch-link');
    await switchLink.waitFor({ state: 'visible' });
    const fullText = switchLink.locator('[data-test-subj="fullText"]');
    if ((await fullText.innerText()).trim() === dataViewTitle) {
      return;
    }

    await switchLink.click();
    // Layer config also uses `indexPattern-switcher`; only the open popover is visible.
    const switcher = this.page.locator('[data-test-subj="indexPattern-switcher"]:visible');
    await switcher.waitFor({ state: 'visible' });
    const matching = switcher.getByTestId(`dataView-${dataViewTitle}`);
    await matching.waitFor({ state: 'visible' });
    await matching.click();
    await switcher.waitFor({ state: 'hidden' });
    await this.page.testSubj.locator('fieldListLoading').waitFor({ state: 'hidden' });
  }
}
