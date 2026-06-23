/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InMemoryFs } from 'just-bash';
import { CapacityLimitedFs } from './capacity_limited_fs';

const make = (cap: number) => {
  const inner = new InMemoryFs();
  return { inner, fs: new CapacityLimitedFs(inner, cap) };
};

describe('CapacityLimitedFs', () => {
  describe('writeFile', () => {
    it('allows writes under the cap', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(50));
      await fs.writeFile('/b.txt', 'y'.repeat(40));
      expect(await fs.readFile('/a.txt')).toBe('x'.repeat(50));
      expect(await fs.readFile('/b.txt')).toBe('y'.repeat(40));
    });

    it('rejects a write that would exceed the cap', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(60));
      await expect(fs.writeFile('/b.txt', 'y'.repeat(50))).rejects.toThrow(/ENOSPC/);
    });

    it('allows overwriting an existing file when the new content fits', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(60));
      // 60 - 60 + 80 = 80 ≤ 100
      await fs.writeFile('/a.txt', 'y'.repeat(80));
      expect((await fs.readFile('/a.txt')).length).toBe(80);
    });

    it('rejects an overwrite that would still exceed the cap', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(60));
      await fs.writeFile('/b.txt', 'y'.repeat(30));
      // current 90, overwrite /a from 60→120 = projected 150 > 100
      await expect(fs.writeFile('/a.txt', 'x'.repeat(120))).rejects.toThrow(/ENOSPC/);
    });

    it('reflects rm() freeing capacity', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(90));
      await expect(fs.writeFile('/b.txt', 'y'.repeat(20))).rejects.toThrow(/ENOSPC/);
      await fs.rm('/a.txt');
      await fs.writeFile('/b.txt', 'y'.repeat(20));
      expect((await fs.readFile('/b.txt')).length).toBe(20);
    });
  });

  describe('appendFile', () => {
    it('rejects an append that would exceed the cap', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(80));
      await expect(fs.appendFile('/a.txt', 'y'.repeat(30))).rejects.toThrow(/ENOSPC/);
    });

    it('allows an append that fits', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(50));
      await fs.appendFile('/a.txt', 'y'.repeat(40));
      expect((await fs.readFile('/a.txt')).length).toBe(90);
    });
  });

  describe('cp', () => {
    it('rejects a copy that would exceed the cap', async () => {
      const { fs } = make(100);
      await fs.writeFile('/src.txt', 'x'.repeat(60));
      await fs.writeFile('/other.txt', 'y'.repeat(30));
      // current 90, cp adds 60 (no existing dest) = 150 > 100
      await expect(fs.cp('/src.txt', '/dst.txt')).rejects.toThrow(/ENOSPC/);
    });

    it('allows a copy that fits', async () => {
      const { fs } = make(100);
      await fs.writeFile('/src.txt', 'x'.repeat(30));
      await fs.cp('/src.txt', '/dst.txt');
      expect(await fs.readFile('/dst.txt')).toBe('x'.repeat(30));
    });
  });

  describe('mv', () => {
    it('passes through — net-neutral in size', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'x'.repeat(60));
      await fs.writeFile('/b.txt', 'y'.repeat(35));
      // total 95; mv doesn't change total, so allow.
      await fs.mv('/a.txt', '/c.txt');
      expect(await fs.exists('/a.txt')).toBe(false);
      expect(await fs.readFile('/c.txt')).toBe('x'.repeat(60));
    });
  });

  describe('reads pass through', () => {
    it('readFile / stat / readdir delegate to inner', async () => {
      const { fs } = make(100);
      await fs.writeFile('/a.txt', 'hello');
      expect(await fs.readFile('/a.txt')).toBe('hello');
      expect((await fs.stat('/a.txt')).size).toBe(5);
      expect(await fs.readdir('/')).toContain('a.txt');
    });
  });
});
