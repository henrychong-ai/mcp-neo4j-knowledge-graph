'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Loader2, X, ArrowRight, ArrowLeft } from 'lucide-react';

interface EntityPanelProps {
  entityName: string | null;
  onClose: () => void;
}

export function EntityPanel({ entityName, onClose }: EntityPanelProps) {
  const { data: entity, isLoading, error } = useQuery({
    queryKey: ['entity', entityName],
    queryFn: () => api.getEntity(entityName!),
    enabled: !!entityName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (!entityName) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
        <p>Select a node to view details</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">Failed to load entity details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 truncate flex-1 mr-2">
          {entity.name}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Entity Type */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Type</h3>
          <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
            {entity.entityType}
          </span>
        </div>

        {/* Observations */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Observations ({entity.observations.length})
          </h3>
          {entity.observations.length > 0 ? (
            <ul className="space-y-2">
              {entity.observations.map((obs, index) => (
                <li
                  key={index}
                  className="text-sm text-gray-600 bg-gray-50 p-2 rounded"
                >
                  {obs}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">No observations</p>
          )}
        </div>

        {/* Outgoing Relations */}
        {entity.outgoingRelations.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <ArrowRight className="h-4 w-4 mr-1" />
              Outgoing Relations ({entity.outgoingRelations.length})
            </h3>
            <ul className="space-y-2">
              {entity.outgoingRelations.map((rel, index) => (
                <li key={index} className="text-sm bg-green-50 p-2 rounded">
                  <span className="font-medium">{rel.relationType}</span>
                  <span className="text-gray-600"> → {rel.to}</span>
                  {rel.confidence && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({(rel.confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Incoming Relations */}
        {entity.incomingRelations.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Incoming Relations ({entity.incomingRelations.length})
            </h3>
            <ul className="space-y-2">
              {entity.incomingRelations.map((rel, index) => (
                <li key={index} className="text-sm bg-purple-50 p-2 rounded">
                  <span className="text-gray-600">{rel.from} → </span>
                  <span className="font-medium">{rel.relationType}</span>
                  {rel.confidence && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({(rel.confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Metadata</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {entity.version !== undefined && (
              <>
                <dt className="text-gray-500">Version:</dt>
                <dd className="text-gray-900">{entity.version}</dd>
              </>
            )}
            {entity.createdAt && (
              <>
                <dt className="text-gray-500">Created:</dt>
                <dd className="text-gray-900">
                  {new Date(entity.createdAt).toLocaleDateString()}
                </dd>
              </>
            )}
            {entity.updatedAt && (
              <>
                <dt className="text-gray-500">Updated:</dt>
                <dd className="text-gray-900">
                  {new Date(entity.updatedAt).toLocaleDateString()}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
