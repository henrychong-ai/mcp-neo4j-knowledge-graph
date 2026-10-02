/**
 * An option that is left out, or passed as `undefined`, keeps its default.
 *
 * Every class that merges a caller's Neo4j configuration over
 * DEFAULT_NEO4J_CONFIG is covered: the storage provider, the connection
 * manager and the schema manager, plus the factory that feeds the provider.
 * The last block pins the configuration the server's own start-up path
 * produces, character for character.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createStorageConfig } from '../../../config/storage.js';
import {
  DEFAULT_NEO4J_CONFIG,
  type Neo4jConfig,
  resolveNeo4jConfig,
} from '../../neo4j/Neo4jConfig.js';
import { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager.js';
import { Neo4jSchemaManager } from '../../neo4j/Neo4jSchemaManager.js';
import { Neo4jStorageProvider } from '../../neo4j/Neo4jStorageProvider.js';
import { StorageProviderFactory } from '../../StorageProviderFactory.js';

const CONFIG_KEYS = [
  'uri',
  'username',
  'password',
  'database',
  'vectorIndexName',
  'vectorDimensions',
  'similarityFunction',
];

/** The three resolved configurations a provider holds. */
function resolvedConfigs(provider: unknown): Neo4jConfig[] {
  const internals = provider as any;
  return [internals.config, internals.connectionManager.config, internals.schemaManager.config];
}

describe('Neo4j configuration defaults', () => {
  const managers: Neo4jConnectionManager[] = [];

  /** Track a provider's driver so it is closed after the test. */
  function tracked<T>(provider: T): T {
    managers.push((provider as any).connectionManager);
    return provider;
  }

  afterEach(async () => {
    await Promise.all(managers.splice(0).map(manager => manager.close()));
  });

  describe('resolveNeo4jConfig', () => {
    it('returns a copy of the defaults when given nothing', () => {
      expect(resolveNeo4jConfig()).toStrictEqual(DEFAULT_NEO4J_CONFIG);
      expect(resolveNeo4jConfig(undefined)).toStrictEqual(DEFAULT_NEO4J_CONFIG);
      expect(resolveNeo4jConfig({})).toStrictEqual(DEFAULT_NEO4J_CONFIG);
      expect(resolveNeo4jConfig()).not.toBe(DEFAULT_NEO4J_CONFIG);
    });

    it('keeps the default for a key that is absent or undefined', () => {
      const resolved = resolveNeo4jConfig({
        uri: 'bolt://db.example:7687',
        username: undefined,
        vectorDimensions: undefined,
      });

      expect(resolved).toStrictEqual({ ...DEFAULT_NEO4J_CONFIG, uri: 'bolt://db.example:7687' });
      expect(Object.keys(resolved)).toStrictEqual(CONFIG_KEYS);
    });

    it('takes every value the caller supplies, exactly as a spread would', () => {
      const supplied = {
        uri: 'bolt://db.example:7687',
        username: 'kg_user',
        password: '',
        database: 'kg',
        vectorIndexName: 'kg_index',
        vectorDimensions: 0,
        similarityFunction: 'euclidean' as const,
        // A key outside Neo4jConfig is carried through, as it always was.
        extra: 'kept',
      };

      const resolved = resolveNeo4jConfig(supplied);

      expect(JSON.stringify(resolved)).toBe(
        JSON.stringify({ ...DEFAULT_NEO4J_CONFIG, ...supplied })
      );
    });

    it('does not change the defaults or the input', () => {
      const before = JSON.stringify(DEFAULT_NEO4J_CONFIG);
      const input = { uri: 'bolt://db.example:7687', username: undefined };

      const resolved = resolveNeo4jConfig(input);
      resolved.database = 'changed';

      expect(JSON.stringify(DEFAULT_NEO4J_CONFIG)).toBe(before);
      expect(input).toStrictEqual({ uri: 'bolt://db.example:7687', username: undefined });
    });
  });

  describe('StorageProviderFactory.createProvider', () => {
    it('keeps the defaults for the options a partial config leaves out', () => {
      const provider = tracked(
        new StorageProviderFactory().createProvider({
          type: 'neo4j',
          options: { neo4jUri: 'bolt://db.example:7687', neo4jPassword: 'secret' },
        })
      );

      for (const config of resolvedConfigs(provider)) {
        expect(config).toStrictEqual({
          ...DEFAULT_NEO4J_CONFIG,
          uri: 'bolt://db.example:7687',
          password: 'secret',
        });
      }
    });

    it('keeps the defaults for options passed as undefined', () => {
      const provider = tracked(
        new StorageProviderFactory().createProvider({
          type: 'neo4j',
          options: {
            neo4jUri: undefined,
            neo4jUsername: undefined,
            neo4jPassword: undefined,
            neo4jDatabase: 'kg',
            neo4jVectorIndexName: undefined,
            neo4jVectorDimensions: undefined,
            neo4jSimilarityFunction: undefined,
          } as any,
        })
      );

      for (const config of resolvedConfigs(provider)) {
        expect(config).toStrictEqual({ ...DEFAULT_NEO4J_CONFIG, database: 'kg' });
      }
    });

    it('keeps every default when the options object is empty', () => {
      const provider = tracked(
        new StorageProviderFactory().createProvider({ type: 'neo4j', options: {} })
      );

      for (const config of resolvedConfigs(provider)) {
        expect(config).toStrictEqual(DEFAULT_NEO4J_CONFIG);
      }
    });
  });

  describe('Neo4jStorageProvider', () => {
    it('keeps the default for a config key passed as undefined', () => {
      const provider = tracked(
        new Neo4jStorageProvider({
          config: { uri: 'bolt://db.example:7687', username: undefined, database: undefined },
        })
      );

      for (const config of resolvedConfigs(provider)) {
        expect(config).toStrictEqual({ ...DEFAULT_NEO4J_CONFIG, uri: 'bolt://db.example:7687' });
      }
    });
  });

  describe('Neo4jConnectionManager', () => {
    it('keeps the default for a config key passed as undefined', () => {
      const manager = new Neo4jConnectionManager({
        uri: 'bolt://db.example:7687',
        username: undefined,
        password: undefined,
        database: undefined,
      });
      managers.push(manager);

      expect((manager as any).config).toStrictEqual({
        ...DEFAULT_NEO4J_CONFIG,
        uri: 'bolt://db.example:7687',
      });
    });
  });

  describe('Neo4jSchemaManager', () => {
    it('keeps the default for a config key passed as undefined', () => {
      const manager = new Neo4jConnectionManager();
      managers.push(manager);

      const schemaManager = new Neo4jSchemaManager(
        manager,
        { vectorIndexName: 'kg_index', vectorDimensions: undefined, similarityFunction: undefined },
        false
      );

      expect((schemaManager as any).config).toStrictEqual({
        ...DEFAULT_NEO4J_CONFIG,
        vectorIndexName: 'kg_index',
      });
    });
  });

  describe('the start-up path (createStorageConfig -> createProvider)', () => {
    const ENV_KEYS = [
      'NEO4J_URI',
      'NEO4J_USERNAME',
      'NEO4J_PASSWORD',
      'NEO4J_DATABASE',
      'NEO4J_VECTOR_INDEX',
      'NEO4J_VECTOR_DIMENSIONS',
      'NEO4J_SIMILARITY_FUNCTION',
    ];
    const saved = new Map<string, string | undefined>();

    function setEnv(values: Record<string, string>): void {
      for (const key of ENV_KEYS) {
        saved.set(key, process.env[key]);
        if (key in values) {
          process.env[key] = values[key];
        } else {
          delete process.env[key];
        }
      }
    }

    afterEach(() => {
      for (const [key, value] of saved) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      saved.clear();
    });

    it('resolves the same configuration as before with no environment set', () => {
      setEnv({});

      const provider = tracked(
        new StorageProviderFactory().createProvider(createStorageConfig(undefined))
      );

      const expected =
        '{"uri":"bolt://localhost:7687","username":"neo4j","password":"memento_password",' +
        '"database":"neo4j","vectorIndexName":"entity_embeddings","vectorDimensions":1536,' +
        '"similarityFunction":"cosine"}';
      for (const config of resolvedConfigs(provider)) {
        expect(JSON.stringify(config)).toBe(expected);
      }
    });

    it('resolves the same configuration as before with every variable set', () => {
      setEnv({
        NEO4J_URI: 'bolt://db.example:7687',
        NEO4J_USERNAME: 'kg_user',
        NEO4J_PASSWORD: 'kg_pass',
        NEO4J_DATABASE: 'kg',
        NEO4J_VECTOR_INDEX: 'kg_index',
        NEO4J_VECTOR_DIMENSIONS: '1024',
        NEO4J_SIMILARITY_FUNCTION: 'euclidean',
      });

      const provider = tracked(
        new StorageProviderFactory().createProvider(createStorageConfig(undefined))
      );

      const expected =
        '{"uri":"bolt://db.example:7687","username":"kg_user","password":"kg_pass",' +
        '"database":"kg","vectorIndexName":"kg_index","vectorDimensions":1024,' +
        '"similarityFunction":"euclidean"}';
      for (const config of resolvedConfigs(provider)) {
        expect(JSON.stringify(config)).toBe(expected);
      }
    });
  });
});
