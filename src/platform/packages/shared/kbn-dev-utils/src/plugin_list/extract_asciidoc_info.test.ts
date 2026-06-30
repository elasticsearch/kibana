/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { extractAsciidocInfo } from './extract_asciidoc_info';

it('Returns the intro paragraph when there is only one paragraph', () => {
  const { firstParagraph } = extractAsciidocInfo(
    `[[this-is-the-anchor]]
== I'm the heading!

Hello

I'm an intro paragraph!`
  );

  expect(firstParagraph).toEqual(`Hello\n\nI'm an intro paragraph!`);
});

it('Returns only the intro paragraph when there are multiple paragraphs without an anchor', () => {
  const { firstParagraph } = extractAsciidocInfo(
    `[[this-is-the-anchor]]
== Heading here

Intro.

=== Another heading

More details`
  );

  expect(firstParagraph).toEqual(`Intro.`);
});

it('Returns only the intro paragraph when there are multiple paragraphs with anchors', () => {
  const { firstParagraph } = extractAsciidocInfo(
    `[[this-is-the-anchor]]
== Heading here

Intro.

[[an-anchor]]
=== Another heading

More details
 `
  );

  expect(firstParagraph).toEqual(`Intro.`);
});

it('Returns only the intro paragraph when there are multiple paragraphs with discrete prefixes', () => {
  const { firstParagraph } = extractAsciidocInfo(
    `[[this-is-the-anchor]]
== Heading here

Intro.

[discrete]
=== Another heading

More details
 `
  );

  expect(firstParagraph).toEqual(`Intro.`);
});
