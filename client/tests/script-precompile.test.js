import { describe, it, expect } from 'vitest';
import { precompile } from '../src/libs/script-precompile.js';

describe('script-precompile', () => {
  it('converts top-level let/const/var to shared assignments', () => {
    expect(precompile('const x = 5;\nlet y = 1;\nvar z = 2;')).toContain('void (x = 5)');
    expect(precompile('const x = 5;\nlet y = 1;\nvar z = 2;')).toContain('void (y = 1)');
    expect(precompile('const x = 5;\nlet y = 1;\nvar z = 2;')).toContain('void (z = 2)');
  });

  it('handles multiple declarators and no-init var', () => {
    const out = precompile('var a = 1, b = 2;\nvar c;');
    expect(out).toContain('void (a = 1, b = 2)');
    expect(out).toContain('void (c = undefined)');
  });

  it('converts top-level function/class to assignments', () => {
    expect(precompile('function f() {}\nf()')).toContain('f = function f() {}');
    expect(precompile('class C {}\nnew C()')).toContain('C = class C {}');
  });

  it('leaves nested declarations untouched', () => {
    const out = precompile('if (true) { let z = 99; }\nz + 1');
    expect(out).toContain('if (true) { let z = 99; }');
  });

  it('wraps the last expression as returnValue', () => {
    expect(precompile('5 + 5')).toContain('return {returnValue: (5 + 5)}');
  });

  it('does not wrap when the cell ends with a semicolon', () => {
    expect(precompile('5 + 5;')).not.toContain('returnValue');
  });

  it('strips a leading "use strict" directive', () => {
    const out = precompile('"use strict";\nconst x = 1;');
    expect(out).not.toContain('use strict');
    expect(out).toContain('void (x = 1)');
  });

  it('returns empty for blank code', () => {
    expect(precompile('')).toBe('');
    expect(precompile('   ')).toBe('');
  });

  it('returns only inner statements (no async IIFE wrapper)', () => {
    const out = precompile('const x = 1;\nx + 1');
    expect(out).not.toContain('(async () => {');
    expect(out).not.toContain('})()');
    expect(out).toContain('void (x = 1)');
    expect(out).toContain('return {returnValue: (x + 1)}');
  });
});

describe('static import → dynamic import', () => {
  it('converts named imports to a destructured dynamic import', () => {
    const out = precompile("import { a, b as c } from 'https://m.example/mod.js';\na + c");
    expect(out).toContain('void ({ a, b: c } = await import("https://m.example/mod.js"))');
  });

  it('converts default and namespace imports', () => {
    const out = precompile("import def from 'https://m.example/mod.js';\nimport * as ns from 'https://m.example/ns.js';\ndef + 1");
    expect(out).toContain('void (def = (await import("https://m.example/mod.js")).default)');
    expect(out).toContain('void (ns = await import("https://m.example/ns.js"))');
  });

  it('converts side-effect-only imports to await import', () => {
    const out = precompile("import 'https://m.example/style.js';\n1 + 1");
    expect(out).toContain('await import("https://m.example/style.js")');
    expect(out).toContain('return {returnValue: (1 + 1)}');
  });
});
