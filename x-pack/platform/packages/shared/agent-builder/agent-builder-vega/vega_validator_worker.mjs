/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Native ESM worker that compiles and runs a Vega or Vega-Lite spec to surface
 * render-time errors and warnings. It MUST stay a native `.mjs`: the `vega`
 * module graph contains a top-level `await import('canvas')` (via vega-canvas),
 * which cannot be loaded by Kibana's CommonJS server runtime. A worker thread
 * loaded as native ESM bypasses that constraint without `eval`/`new Function`.
 */

import { parentPort } from 'node:worker_threads';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';

/** Vega-Lite view-composition keys whose child specs can carry their own `data`. */
const SUBVIEW_KEYS = ['spec', 'layer', 'concat', 'hconcat', 'vconcat'];

/**
 * Representative panel size for the headless run. Layout-dependent specs (e.g. a
 * trend indicator that centers text via the `width`/`height` signals, or a
 * small-multiples grid derived from them) default to 0×0 headless, which piles
 * every centered mark onto the origin and makes overlap detection meaningless.
 * Running at a realistic size surfaces collisions the user would actually see.
 */
const VALIDATION_WIDTH = 500;
const VALIDATION_HEIGHT = 350;

/**
 * Panel shapes to probe for text overlap. Indicator-style fonts sized with
 * `min(width/.., height/..)` only collide at certain aspect ratios, so a single
 * size would miss many real collisions; these cover wide, square and tall panels.
 */
const OVERLAP_PROBE_SIZES = [
  [700, 260],
  [380, 380],
  [300, 480],
];

/**
 * Whether a scenegraph mark is author-positioned content text (not an axis or
 * legend label, which Vega lays out to avoid collisions on its own). Only these
 * are policed for overlap.
 */
const isContentTextMark = (mark) =>
  mark.marktype === 'text' &&
  !(
    typeof mark.role === 'string' &&
    (mark.role.startsWith('axis') || mark.role.startsWith('legend'))
  );

/**
 * Collect GLOBAL bounds of every content text item. The first arg is an array
 * of scenegraph MARK objects (each with a `marktype` and an `items` array of
 * instances). A group mark's instances are group items whose own `items` are
 * the child marks, so recursion descends one mark→item→marks level at a time.
 * Child item bounds are stored relative to their parent group, so the group's
 * (x, y) offset is accumulated as `dx`/`dy` to translate them into global space
 * (without this, every cell of a small-multiples grid reports the same local
 * coordinates and looks like it overlaps itself).
 */
const collectContentTextBounds = (markSet, dx, dy, acc) => {
  for (const mark of markSet) {
    if (mark.marktype === 'group') {
      for (const groupItem of mark.items ?? []) {
        collectContentTextBounds(
          groupItem.items ?? [],
          dx + (groupItem.x ?? 0),
          dy + (groupItem.y ?? 0),
          acc
        );
      }
    } else if (isContentTextMark(mark)) {
      for (const item of mark.items ?? []) {
        const b = item.bounds;
        if (b && isFinite(b.x1) && isFinite(b.y1) && isFinite(b.x2) && isFinite(b.y2)) {
          acc.push({ x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy, text: item.text });
        }
      }
    }
  }
};

const boundsArea = (b) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);

/**
 * Detect author-positioned text marks that substantially overlap (e.g. a big
 * "current value" number printed on top of its label). Returns a single warning
 * string, or undefined when nothing overlaps. Conservative by design: requires
 * the overlap to span more than a few pixels in BOTH dimensions and cover >25%
 * of the smaller mark, so text that merely touches is not reported. Bounds are
 * approximate in Node (no canvas text metrics), but gross collisions are caught
 * reliably.
 */
const detectTextOverlap = (view) => {
  const root = view.scenegraph()?.root;
  if (!root) {
    return undefined;
  }
  const items = [];
  // `root` is the top-level group mark; start traversal from it at offset (0,0).
  collectContentTextBounds([root], 0, 0, items);

  const max = Math.min(items.length, 60);
  for (let i = 0; i < max; i++) {
    for (let j = i + 1; j < max; j++) {
      const areaI = boundsArea(items[i]);
      const areaJ = boundsArea(items[j]);
      if (areaI < 16 || areaJ < 16) {
        continue;
      }
      const overlapW = Math.max(
        0,
        Math.min(items[i].x2, items[j].x2) - Math.max(items[i].x1, items[j].x1)
      );
      const overlapH = Math.max(
        0,
        Math.min(items[i].y2, items[j].y2) - Math.max(items[i].y1, items[j].y1)
      );
      if (overlapW > 3 && overlapH > 3 && overlapW * overlapH > 0.25 * Math.min(areaI, areaJ)) {
        const a = String(items[i].text ?? '').slice(0, 30);
        const b = String(items[j].text ?? '').slice(0, 30);
        return `Overlapping text marks detected ("${a}" overlaps "${b}"); space the text marks out (or shrink the font) so labels do not collide.`;
      }
    }
  }
  return undefined;
};

/**
 * Decide the dialect from the (graph-forced) `$schema`, falling back to
 * structure: a top-level `marks` ARRAY is unique to raw Vega.
 */
const isVegaLite = (spec) => {
  const schema = typeof spec.$schema === 'string' ? spec.$schema : '';
  if (schema.includes('vega-lite')) {
    return true;
  }
  if (/\/vega\/v\d/i.test(schema)) {
    return false;
  }
  return !Array.isArray(spec.marks);
};

/**
 * Vega-Lite: replace the ES|QL `url` data object with inline sample rows so the
 * headless run does not fetch over the network. The graph binds a single
 * top-level `data.url` (inherited by layers/facets), but nested sub-views are
 * walked defensively and any `data` declaring a `url` is inlined.
 */
const inlineDataVegaLite = (spec, values) => {
  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const { data } = node;
    if (data && typeof data === 'object' && !Array.isArray(data) && 'url' in data) {
      node.data = { values };
    }
    for (const key of SUBVIEW_KEYS) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    }
  };

  visit(spec);
  // Guarantee the root view has data even if the model omitted it.
  if (!spec.data || typeof spec.data !== 'object' || Array.isArray(spec.data)) {
    spec.data = { values };
  }
  return spec;
};

/**
 * Raw Vega: replace ES|QL `url` data sets with inline sample rows. Derived data
 * sets (those with a `source`) are left untouched so their transforms still run
 * against the sample data.
 */
const inlineDataVega = (spec, values) => {
  if (!Array.isArray(spec.data)) {
    return spec;
  }
  for (const dataSet of spec.data) {
    if (dataSet && typeof dataSet === 'object' && 'url' in dataSet) {
      delete dataSet.url;
      delete dataSet.format;
      if (!('source' in dataSet)) {
        dataSet.values = values;
      }
    }
  }
  return spec;
};

const validate = async (spec, rows) => {
  const warnings = [];
  // Vega's logger contract: `error` throws (fatal), `warn` collects soft feedback.
  const logger = {
    _level: 2,
    level(value) {
      if (arguments.length) {
        this._level = value;
        return this;
      }
      return this._level;
    },
    error() {
      throw new Error(Array.from(arguments).join(' '));
    },
    warn() {
      warnings.push(Array.from(arguments).join(' '));
      return this;
    },
    info() {
      return this;
    },
    debug() {
      return this;
    },
  };

  const values = Array.isArray(rows) ? rows : [];

  // Vega-Lite is compiled to Vega first (surfaces authoring errors); raw Vega is
  // parsed directly. Either way the compiled/parsed Vega is run headlessly to
  // catch render-time errors and warnings.
  let vegaSpec;
  if (isVegaLite(spec)) {
    ({ spec: vegaSpec } = compile(inlineDataVegaLite(spec, values), { logger }));
  } else {
    vegaSpec = inlineDataVega(spec, values);
  }

  const runtime = parse(vegaSpec, undefined, { ast: true });
  const view = new View(runtime, { renderer: 'none', logger });
  // Primary run at a realistic size: surfaces render errors and warnings (and
  // avoids collapsing layout-dependent positions to 0×0).
  view.width(VALIDATION_WIDTH).height(VALIDATION_HEIGHT);
  await view.runAsync();

  // Probe a few panel shapes for colliding text marks; re-running is cheap (no
  // re-parse) and best-effort, so a probe failure never blocks the spec. Any
  // warnings re-emitted during probing are dropped (only the primary run counts).
  const primaryWarningCount = warnings.length;
  let overlapWarning = detectTextOverlap(view);
  try {
    for (let i = 0; !overlapWarning && i < OVERLAP_PROBE_SIZES.length; i++) {
      const [probeWidth, probeHeight] = OVERLAP_PROBE_SIZES[i];
      view.width(probeWidth).height(probeHeight);
      await view.runAsync();
      overlapWarning = detectTextOverlap(view);
    }
  } catch {
    // Probing is best-effort; ignore failures at extreme sizes.
  }
  warnings.length = primaryWarningCount;
  if (overlapWarning) {
    warnings.push(overlapWarning);
  }

  await view.finalize();

  return warnings;
};

parentPort.on('message', async ({ id, spec, rows }) => {
  try {
    const warnings = await validate(spec, rows);
    parentPort.postMessage({ id, ok: true, warnings });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
