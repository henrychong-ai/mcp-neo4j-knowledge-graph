import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntityPanel } from '@/components/EntityPanel';
import { api } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  api: {
    getEntity: vi.fn(),
  },
}));

describe('EntityPanel', () => {
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

  it('should show placeholder when no entity is selected', () => {
    renderWithClient(<EntityPanel entityName={null} onClose={vi.fn()} />);

    expect(screen.getByText('Select a node to view details')).toBeInTheDocument();
  });

  it('should show loading spinner while fetching entity', async () => {
    vi.mocked(api.getEntity).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    // Loading spinner should be present
    await waitFor(() => {
      const loader = document.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });
  });

  it('should display entity details when loaded', async () => {
    const mockEntity = {
      name: 'TestEntity',
      entityType: 'person',
      observations: ['First observation', 'Second observation'],
      incomingRelations: [
        { from: 'Entity1', relationType: 'knows', confidence: 0.9 },
      ],
      outgoingRelations: [
        { to: 'Entity2', relationType: 'works_at', confidence: 0.95 },
      ],
      version: 2,
      createdAt: 1609459200000, // 2021-01-01
      updatedAt: 1640995200000, // 2022-01-01
    };

    vi.mocked(api.getEntity).mockResolvedValue(mockEntity);

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('TestEntity')).toBeInTheDocument();
    });

    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.getByText('Observations (2)')).toBeInTheDocument();
    expect(screen.getByText('First observation')).toBeInTheDocument();
    expect(screen.getByText('Second observation')).toBeInTheDocument();
  });

  it('should display relations with confidence scores', async () => {
    const mockEntity = {
      name: 'TestEntity',
      entityType: 'person',
      observations: [],
      incomingRelations: [
        { from: 'Entity1', relationType: 'knows', confidence: 0.85 },
      ],
      outgoingRelations: [
        { to: 'Entity2', relationType: 'works_at', confidence: 0.95 },
      ],
    };

    vi.mocked(api.getEntity).mockResolvedValue(mockEntity);

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('TestEntity')).toBeInTheDocument();
    });

    expect(screen.getByText('Outgoing Relations (1)')).toBeInTheDocument();
    expect(screen.getByText('Incoming Relations (1)')).toBeInTheDocument();
    expect(screen.getByText('works_at')).toBeInTheDocument();
    expect(screen.getByText('knows')).toBeInTheDocument();
    expect(screen.getByText('(95%)')).toBeInTheDocument();
    expect(screen.getByText('(85%)')).toBeInTheDocument();
  });

  it('should handle entity with no observations', async () => {
    const mockEntity = {
      name: 'TestEntity',
      entityType: 'person',
      observations: [],
      incomingRelations: [],
      outgoingRelations: [],
    };

    vi.mocked(api.getEntity).mockResolvedValue(mockEntity);

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No observations')).toBeInTheDocument();
    });
  });

  it('should show error message when fetch fails', async () => {
    vi.mocked(api.getEntity).mockRejectedValue(new Error('Network error'));

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load entity details')).toBeInTheDocument();
    });
  });

  it('should call onClose when close button is clicked', async () => {
    const mockEntity = {
      name: 'TestEntity',
      entityType: 'person',
      observations: [],
      incomingRelations: [],
      outgoingRelations: [],
    };

    vi.mocked(api.getEntity).mockResolvedValue(mockEntity);

    const onClose = vi.fn();
    renderWithClient(<EntityPanel entityName="TestEntity" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('TestEntity')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('Close panel');
    closeButton.click();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should display metadata fields when present', async () => {
    const mockEntity = {
      name: 'TestEntity',
      entityType: 'person',
      observations: [],
      incomingRelations: [],
      outgoingRelations: [],
      version: 5,
      createdAt: 1609459200000, // 2021-01-01
      updatedAt: 1640995200000, // 2022-01-01
    };

    vi.mocked(api.getEntity).mockResolvedValue(mockEntity);

    renderWithClient(<EntityPanel entityName="TestEntity" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Version:')).toBeInTheDocument();
    });

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Created:')).toBeInTheDocument();
    expect(screen.getByText('Updated:')).toBeInTheDocument();
  });
});
