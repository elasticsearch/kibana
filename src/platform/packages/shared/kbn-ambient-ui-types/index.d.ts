/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/// <reference path="./emotion.d.ts" />

declare module '*.html' {
  const template: string;
  // eslint-disable-next-line import/no-default-export
  export default template;
}

declare module '*.png' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.svg' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.jpg' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.webp' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.gif' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default content;
}

declare module '*.mdx' {
  let MDXComponent: (props: any) => JSX.Element;
  // eslint-disable-next-line import/no-default-export
  export default MDXComponent;
}

// Side-effect CSS/SCSS imports are routed through webpack/rspack loaders at
// build time and have no JS exports. The empty `declare module` keeps TS 6's
// `noUncheckedSideEffectImports` happy without falsely typing a default export.
declare module '*.scss';
declare module '*.css';
declare module '*.sass';

// `reflect-metadata/lite` ships types under its `exports` map; classic
// (`moduleResolution: "node"`) resolution does not read `exports`. Declare it
// as a side-effect-only module until A3 lands and we can switch to
// `moduleResolution: "bundler"`.
declare module 'reflect-metadata/lite';

declare module '*?asUrl' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default string;
}

declare module '*?raw' {
  const content: string;
  // eslint-disable-next-line import/no-default-export
  export default string;
}
