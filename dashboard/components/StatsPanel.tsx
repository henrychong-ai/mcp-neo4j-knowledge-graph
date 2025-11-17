'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Loader2, BarChart3, Network, TrendingUp } from 'lucide-react';

interface StatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StatsPanel({ isOpen, onClose }: StatsPanelProps) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            Graph Statistics
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close stats"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">Failed to load statistics</p>
            </div>
          )}

          {stats && (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <Network className="h-5 w-5 text-blue-600 mr-2" />
                    <span className="text-sm font-medium text-blue-900">Entities</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{stats.entityCount}</p>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
                    <span className="text-sm font-medium text-green-900">Relations</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">{stats.relationCount}</p>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <BarChart3 className="h-5 w-5 text-purple-600 mr-2" />
                    <span className="text-sm font-medium text-purple-900">Avg. Connections</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900">
                    {stats.avgConnectionsPerEntity}
                  </p>
                </div>
              </div>

              {/* Entity Types */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Entity Types (Top 10)
                </h3>
                <div className="space-y-2">
                  {stats.entityTypes.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 truncate flex-1 mr-4">
                        {item.type}
                      </span>
                      <div className="flex items-center flex-shrink-0">
                        <div className="w-32 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${(item.count / stats.entityCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-12 text-right">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Relation Types */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Relation Types (Top 10)
                </h3>
                <div className="space-y-2">
                  {stats.relationTypes.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 truncate flex-1 mr-4">
                        {item.type}
                      </span>
                      <div className="flex items-center flex-shrink-0">
                        <div className="w-32 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{
                              width: `${(item.count / stats.relationCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-12 text-right">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
