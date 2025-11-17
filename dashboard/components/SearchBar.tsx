'use client';

import { useState, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  onClear,
  isLoading = false,
  placeholder = 'Search entities...',
}: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        onSearch(query.trim());
      }
    },
    [query, onSearch]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    onClear();
  }, [onClear]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-gray-400" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed
            text-sm"
          data-testid="search-input"
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center
              text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
            data-testid="clear-button"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={!query.trim() || isLoading}
        className="mt-2 w-full bg-blue-600 text-white py-2 px-4 rounded-lg
          hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
          transition-colors text-sm font-medium"
        data-testid="search-button"
      >
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
