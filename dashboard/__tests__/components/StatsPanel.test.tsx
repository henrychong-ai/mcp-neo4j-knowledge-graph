import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatsPanel } from '@/components/StatsPanel';
import { api } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  api: {
    getStats: vi.fn(),
  },
}));

describe('StatsPanel', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const renderWithClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  it('should not render when closed', () => {
    const { container } = renderWithClient(
      <StatsPanel isOpen={false} onClose={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should show loading spinner when fetching stats', async () => {
    vi.mocked(api.getStats).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      const loader = document.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });
  });

  it('should display graph statistics when loaded', async () => {
    const mockStats = {
      entityCount: 150,
      relationCount: 250,
      avgConnectionsPerEntity: 1.67,
      entityTypes: [
        { type: 'person', count: 80 },
        { type: 'organization', count: 50 },
        { type: 'location', count: 20 },
      ],
      relationTypes: [
        { type: 'works_at', count: 100 },
        { type: 'knows', count: 75 },
        { type: 'located_in', count: 75 },
      ],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Graph Statistics')).toBeInTheDocument();
    });

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('1.67')).toBeInTheDocument();
  });

  it('should display entity type distribution', async () => {
    const mockStats = {
      entityCount: 150,
      relationCount: 250,
      avgConnectionsPerEntity: 1.67,
      entityTypes: [
        { type: 'person', count: 80 },
        { type: 'organization', count: 50 },
      ],
      relationTypes: [],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Entity Types (Top 10)')).toBeInTheDocument();
    });

    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.getByText('organization')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('should display relation type distribution', async () => {
    const mockStats = {
      entityCount: 150,
      relationCount: 250,
      avgConnectionsPerEntity: 1.67,
      entityTypes: [],
      relationTypes: [
        { type: 'works_at', count: 100 },
        { type: 'knows', count: 75 },
      ],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Relation Types (Top 10)')).toBeInTheDocument();
    });

    expect(screen.getByText('works_at')).toBeInTheDocument();
    expect(screen.getByText('knows')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('should limit entity types to top 10', async () => {
    const mockStats = {
      entityCount: 200,
      relationCount: 300,
      avgConnectionsPerEntity: 1.5,
      entityTypes: Array.from({ length: 15 }, (_, i) => ({
        type: `type_${i}`,
        count: 15 - i,
      })),
      relationTypes: [],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('type_0')).toBeInTheDocument();
    });

    expect(screen.getByText('type_9')).toBeInTheDocument();
    expect(screen.queryByText('type_10')).not.toBeInTheDocument();
  });

  it('should show error message when fetch fails', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('Network error'));

    renderWithClient(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics')).toBeInTheDocument();
    });
  });

  it('should call onClose when close button is clicked', async () => {
    const mockStats = {
      entityCount: 100,
      relationCount: 150,
      avgConnectionsPerEntity: 1.5,
      entityTypes: [],
      relationTypes: [],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    const onClose = vi.fn();
    renderWithClient(<StatsPanel isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Graph Statistics')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('Close stats');
    closeButton.click();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should render modal overlay when open', async () => {
    const mockStats = {
      entityCount: 100,
      relationCount: 150,
      avgConnectionsPerEntity: 1.5,
      entityTypes: [],
      relationTypes: [],
    };

    vi.mocked(api.getStats).mockResolvedValue(mockStats);

    const { container } = renderWithClient(
      <StatsPanel isOpen={true} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Graph Statistics')).toBeInTheDocument();
    });

    // Check for modal overlay (bg-black bg-opacity-50)
    const overlay = container.querySelector('.bg-black');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('bg-opacity-50');
  });
});
