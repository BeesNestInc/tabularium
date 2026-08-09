import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ParamInput from '../src/components/knowledge/ParamInput.svelte';
import { createQueryContext } from '../src/libs/query-context.js';

describe('ParamInput.svelte', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders options as a select and applies default param on mount', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, {
      props: { ctx, name: 'region', label: '地域:', default: '大阪', options: '東京,大阪,名古屋' },
    });
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('大阪');
    await waitFor(() => expect(get(ctx.params).region).toBe('大阪'));
  });

  it('updates the param when the select changes', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, {
      props: { ctx, name: 'region', options: '東京,大阪,名古屋' },
    });
    const select = screen.getByRole('combobox');
    await fireEvent.change(select, { target: { value: '名古屋' } });
    expect(get(ctx.params).region).toBe('名古屋');
  });

  it('renders a text input when no options are given', () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'kw' } });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
