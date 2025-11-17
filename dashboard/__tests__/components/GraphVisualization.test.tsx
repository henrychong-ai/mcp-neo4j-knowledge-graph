import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraphVisualization } from '@/components/GraphVisualization';
import type { CytoscapeData } from '@/lib/types';

// Mock Cytoscape
const mockCy = {
  on: vi.fn(),
  elements: vi.fn(() => ({
    remove: vi.fn(),
    unselect: vi.fn(),
  })),
  add: vi.fn(),
  layout: vi.fn(() => ({
    run: vi.fn(),
  })),
  fit: vi.fn(),
  getElementById: vi.fn(() => ({
    length: 1,
    select: vi.fn(),
  })),
  animate: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('cytoscape', () => {
  return {
    default: vi.fn(() => mockCy),
  };
});

vi.mock('cytoscape-cose-bilkent', () => ({
  default: vi.fn(),
}));

describe('GraphVisualization', () => {
  const mockData: CytoscapeData = {
    nodes: [
      {
        data: { id: 'node1', label: 'Node 1', type: 'person' },
      },
      {
        data: { id: 'node2', label: 'Node 2', type: 'organization' },
      },
    ],
    edges: [
      {
        data: {
          id: 'edge1',
          source: 'node1',
          target: 'node2',
          label: 'works_at',
          type: 'works_at',
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render graph container', () => {
    render(<GraphVisualization data={mockData} />);

    expect(screen.getByTestId('graph-visualization')).toBeInTheDocument();
  });

  it('should initialize Cytoscape on mount', () => {
    const cytoscape = vi.mocked(require('cytoscape').default);

    render(<GraphVisualization data={mockData} />);

    expect(cytoscape).toHaveBeenCalled();
  });

  it('should register node click handler', () => {
    const onNodeClick = vi.fn();

    render(<GraphVisualization data={mockData} onNodeClick={onNodeClick} />);

    expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function));
  });

  it('should update graph when data changes', () => {
    const { rerender } = render(<GraphVisualization data={mockData} />);

    const newData: CytoscapeData = {
      nodes: [
        {
          data: { id: 'node3', label: 'Node 3', type: 'location' },
        },
      ],
      edges: [],
    };

    rerender(<GraphVisualization data={newData} />);

    // Should remove old elements and add new ones
    expect(mockCy.elements).toHaveBeenCalled();
    expect(mockCy.add).toHaveBeenCalled();
  });

  it('should run layout when data updates', () => {
    const { rerender } = render(<GraphVisualization data={mockData} />);

    const newData: CytoscapeData = {
      nodes: [
        {
          data: { id: 'node3', label: 'Node 3', type: 'location' },
        },
      ],
      edges: [],
    };

    rerender(<GraphVisualization data={newData} />);

    expect(mockCy.layout).toHaveBeenCalled();
  });

  it('should highlight selected node', () => {
    const { rerender } = render(<GraphVisualization data={mockData} />);

    rerender(
      <GraphVisualization data={mockData} selectedNode="node1" />
    );

    expect(mockCy.getElementById).toHaveBeenCalledWith('node1');
  });

  it('should animate to selected node', () => {
    const { rerender } = render(<GraphVisualization data={mockData} />);

    rerender(
      <GraphVisualization data={mockData} selectedNode="node1" />
    );

    expect(mockCy.animate).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: 1.5,
        duration: 500,
      })
    );
  });

  it('should unselect all nodes when selectedNode is null', () => {
    const { rerender } = render(
      <GraphVisualization data={mockData} selectedNode="node1" />
    );

    rerender(
      <GraphVisualization data={mockData} selectedNode={null} />
    );

    expect(mockCy.elements).toHaveBeenCalled();
  });

  it('should destroy Cytoscape instance on unmount', () => {
    const { unmount } = render(<GraphVisualization data={mockData} />);

    unmount();

    expect(mockCy.destroy).toHaveBeenCalled();
  });

  it('should fit graph to viewport after layout', () => {
    render(<GraphVisualization data={mockData} />);

    expect(mockCy.fit).toHaveBeenCalled();
  });
});
