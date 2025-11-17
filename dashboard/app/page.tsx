'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toCytoscapeFormat } from '@/lib/graph-utils';
import { GraphVisualization } from '@/components/GraphVisualization';
import { SearchBar } from '@/components/SearchBar';
import { EntityPanel } from '@/components/EntityPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { BarChart3, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Fetch full graph or search results
  const { data: graphData, isLoading, error } = useQuery({
    queryKey: searchQuery ? ['search', searchQuery] : ['graph'],
    queryFn: () => (searchQuery ? api.search(searchQuery) : api.getGraph()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Convert to Cytoscape format
  const cytoscapeData = graphData ? toCytoscapeFormat(graphData) : { nodes: [], edges: [] };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedEntity(null);
  };

  const handleClearSearch = () => {
    setSearchQuery(null);
    setSelectedEntity(null);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedEntity(nodeId);
  };

  const handleCloseEntity = () => {
    setSelectedEntity(null);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Knowledge Graph Dashboard
        </h1>
        <button
          onClick={() => setShowStats(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
            hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <BarChart3 className="h-4 w-4" />
          Statistics
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Search */}
        <aside className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Search</h2>
            <SearchBar
              onSearch={handleSearch}
              onClear={handleClearSearch}
              isLoading={isLoading}
            />
          </div>

          {searchQuery && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <span className="font-medium">Search:</span> {searchQuery}
              </p>
              {graphData && 'resultCount' in graphData && (
                <p className="text-xs text-blue-700 mt-1">
                  {graphData.resultCount} results found
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                Failed to load graph data. Please check your connection.
              </p>
            </div>
          )}

          {!isLoading && graphData && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p>
                <span className="font-medium">{graphData.entities.length}</span> entities
              </p>
              <p>
                <span className="font-medium">{graphData.relations.length}</span> relations
              </p>
            </div>
          )}
        </aside>

        {/* Center - Graph Visualization */}
        <main className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading graph...</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <p className="text-red-600 mb-2">Error loading graph</p>
                <p className="text-sm text-gray-600">
                  Please check your Neo4j connection
                </p>
              </div>
            </div>
          ) : (
            <GraphVisualization
              data={cytoscapeData}
              onNodeClick={handleNodeClick}
              selectedNode={selectedEntity}
            />
          )}
        </main>

        {/* Right Sidebar - Entity Details */}
        <aside className="w-96 bg-white border-l border-gray-200 overflow-hidden flex flex-col">
          <EntityPanel
            entityName={selectedEntity}
            onClose={handleCloseEntity}
          />
        </aside>
      </div>

      {/* Stats Modal */}
      <StatsPanel isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
}
