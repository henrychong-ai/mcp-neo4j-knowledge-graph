import { describe, it, expect, vi } from 'vitest';
import { KnowledgeGraphManager, Entity, Relation } from '../KnowledgeGraphManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// Define EntityObservation type based on the addObservations method parameter
interface EntityObservation {
  entityName: string;
  contents: string[];
}

describe('KnowledgeGraphManager with StorageProvider', () => {
  it('should accept a StorageProvider in constructor', () => {
    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    expect(manager).toBeInstanceOf(KnowledgeGraphManager);
  });

  it('should use StorageProvider loadGraph when reading graph', async () => {
    const mockGraph = {
      entities: [{ name: 'test', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn().mockResolvedValue(mockGraph),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const result = await manager.readGraph();

    expect(mockProvider.loadGraph).toHaveBeenCalled();
    expect(result).toEqual(mockGraph);
  });

  it('should use StorageProvider saveGraph with updated graph when saving', async () => {
    const initialGraph = {
      entities: [{ name: 'test', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn().mockResolvedValue(initialGraph),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn().mockImplementation(async (entities: Entity[]) => entities),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const newEntity: Entity = { name: 'newEntity', entityType: 'test', observations: [] };
    await manager.createEntities([newEntity]);

    expect(mockProvider.createEntities).toHaveBeenCalledWith([newEntity]);
  });

  it('should use StorageProvider searchNodes when searching', async () => {
    const mockSearchResult = {
      entities: [{ name: 'test', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn().mockResolvedValue(mockSearchResult),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const query = 'test';
    const result = await manager.searchNodes(query);

    expect(mockProvider.searchNodes).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockSearchResult);
  });

  it('should use StorageProvider openNodes when opening nodes', async () => {
    const mockOpenResult = {
      entities: [{ name: 'test', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn().mockResolvedValue(mockOpenResult),
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const nodeNames = ['test'];
    const result = await manager.openNodes(nodeNames);

    expect(mockProvider.openNodes).toHaveBeenCalledWith(nodeNames);
    expect(result).toEqual(mockOpenResult);
  });

  it('should use StorageProvider when creating relations', async () => {
    const initialGraph = {
      entities: [
        { name: 'entity1', entityType: 'test', observations: [] },
        { name: 'entity2', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn().mockResolvedValue(initialGraph),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn().mockImplementation(async (relations: Relation[]) => relations),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const newRelation: Relation = { from: 'entity1', to: 'entity2', relationType: 'test' };
    await manager.createRelations([newRelation]);

    expect(mockProvider.createRelations).toHaveBeenCalledWith([newRelation]);
    expect(mockProvider.loadGraph).not.toHaveBeenCalled();
    expect(mockProvider.saveGraph).not.toHaveBeenCalled();
  });

  it('should use StorageProvider when adding observations', async () => {
    const observations: EntityObservation[] = [
      {
        entityName: 'entity1',
        contents: ['new observation'],
      },
    ];

    const expectedResult = [
      {
        entityName: 'entity1',
        addedObservations: ['new observation'],
      },
    ];

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn().mockResolvedValue(expectedResult),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const result = await manager.addObservations(observations);

    expect(mockProvider.addObservations).toHaveBeenCalledWith(observations);
    expect(result).toEqual(expectedResult);
    expect(mockProvider.loadGraph).not.toHaveBeenCalled();
    expect(mockProvider.saveGraph).not.toHaveBeenCalled();
  });

  it('should directly delegate to StorageProvider for createRelations', async () => {
    const initialGraph = {
      entities: [
        { name: 'entity1', entityType: 'test', observations: [] },
        { name: 'entity2', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn().mockResolvedValue(initialGraph),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createEntities: vi.fn(),
      createRelations: vi.fn().mockImplementation(async (relations: Relation[]) => relations),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });
    const newRelation: Relation = { from: 'entity1', to: 'entity2', relationType: 'test' };

    const result = await manager.createRelations([newRelation]);

    expect(mockProvider.createRelations).toHaveBeenCalledWith([newRelation]);
    expect(result).toEqual([newRelation]);
    expect(mockProvider.loadGraph).not.toHaveBeenCalled();
    expect(mockProvider.saveGraph).not.toHaveBeenCalled();
  });
});
