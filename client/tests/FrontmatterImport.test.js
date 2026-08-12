import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FrontmatterImport from '../src/components/knowledge/FrontmatterImport.svelte';

describe('FrontmatterImport.svelte', () => {
  it('shows the imported table + row count when the import succeeded', () => {
    render(FrontmatterImport, { props: { path: 'knowledge/projects', as: 'projects', _imported: { ok: true, rows: 12, table: 'projects', kind: 'frontmatter' } } });
    expect(screen.getByText(/✔ 12 ページ → テーブル projects/)).toBeInTheDocument();
  });

  it('shows rows for csv imports', () => {
    render(FrontmatterImport, { props: { path: 'knowledge/data.csv', as: 'data', _imported: { ok: true, rows: 5, table: 'data', kind: 'csv' } } });
    expect(screen.getByText(/✔ 5 行 → テーブル data/)).toBeInTheDocument();
  });

  it('shows an error message when the import failed', () => {
    render(FrontmatterImport, { props: { path: 'nope', as: '', _imported: { ok: false, error: 'path not found' } } });
    expect(screen.getByText(/✘ path not found/)).toBeInTheDocument();
  });
});
