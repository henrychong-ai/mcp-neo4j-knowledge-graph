import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '@/components/SearchBar';

describe('SearchBar', () => {
  it('should render search input', () => {
    render(
      <SearchBar
        onSearch={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-button')).toBeInTheDocument();
  });

  it('should call onSearch when form is submitted', () => {
    const onSearch = vi.fn();

    render(
      <SearchBar
        onSearch={onSearch}
        onClear={vi.fn()}
      />
    );

    const input = screen.getByTestId('search-input');
    const button = screen.getByTestId('search-button');

    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.click(button);

    expect(onSearch).toHaveBeenCalledWith('test query');
  });

  it('should not call onSearch with empty query', () => {
    const onSearch = vi.fn();

    render(
      <SearchBar
        onSearch={onSearch}
        onClear={vi.fn()}
      />
    );

    const button = screen.getByTestId('search-button');
    fireEvent.click(button);

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('should show clear button when query exists', () => {
    render(
      <SearchBar
        onSearch={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const input = screen.getByTestId('search-input');

    // Initially no clear button
    expect(screen.queryByTestId('clear-button')).not.toBeInTheDocument();

    // After typing, clear button appears
    fireEvent.change(input, { target: { value: 'test' } });
    expect(screen.getByTestId('clear-button')).toBeInTheDocument();
  });

  it('should call onClear when clear button is clicked', () => {
    const onClear = vi.fn();

    render(
      <SearchBar
        onSearch={vi.fn()}
        onClear={onClear}
      />
    );

    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    const clearButton = screen.getByTestId('clear-button');
    fireEvent.click(clearButton);

    expect(onClear).toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('should disable inputs when loading', () => {
    render(
      <SearchBar
        onSearch={vi.fn()}
        onClear={vi.fn()}
        isLoading={true}
      />
    );

    const input = screen.getByTestId('search-input');
    const button = screen.getByTestId('search-button');

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it('should show loading text when searching', () => {
    render(
      <SearchBar
        onSearch={vi.fn()}
        onClear={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });
});
