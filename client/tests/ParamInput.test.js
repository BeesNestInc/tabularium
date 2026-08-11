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

  it('renders a number input', () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'min_price', type: 'number', step: '100' } });
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect(input.step).toBe('100');
  });

  it('renders a textarea', () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'memo', type: 'textarea', rows: '3' } });
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
  });

  it('renders a checkbox checked by default', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'flag', type: 'checkbox', default: 'true' } });
    expect(screen.getByRole('checkbox')).toBeChecked();
    await waitFor(() => expect(get(ctx.params).flag).toBe('true'));
  });

  it('defers setParam when inForm (no immediate re-run)', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'min_price', type: 'number', inForm: true } });
    const input = screen.getByRole('spinbutton');
    await fireEvent.input(input, { target: { value: '500' } });
    expect(get(ctx.params).min_price).toBeUndefined();
  });

  it('commits on apply button when apply mode is set', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(ParamInput, { props: { ctx, name: 'min_price', type: 'number', apply: true } });
    const input = screen.getByRole('spinbutton');
    await fireEvent.input(input, { target: { value: '500' } });
    expect(get(ctx.params).min_price).toBeUndefined();
    await fireEvent.click(screen.getByRole('button', { name: '適用' }));
    expect(get(ctx.params).min_price).toBe('500');
  });
});
