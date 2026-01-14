/**
 * CLI tool for generating embeddings for entities in the knowledge graph
 *
 * Usage:
 *   npm run embeddings:generate              # Generate for all entities without embeddings
 *   npm run embeddings:generate -- --limit 10  # Test with first 10 entities
 *   npm run embeddings:generate -- --force    # Regenerate all embeddings (even if exist)
 *
 * Requirements:
 *   - OPENAI_API_KEY environment variable must be set
 *   - Neo4j connection configured (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)
 */

import dotenv from 'dotenv';

import { EmbeddingServiceFactory } from '../embeddings/EmbeddingServiceFactory.js';
import { Neo4jStorageProvider } from '../storage/neo4j/Neo4jStorageProvider.js';
// Logger available if needed: import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

interface GenerateEmbeddingsOptions {
  limit?: number;
  force?: boolean;
  batchSize?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): GenerateEmbeddingsOptions {
  const args = process.argv.slice(2);
  const options: GenerateEmbeddingsOptions = {
    batchSize: 10, // Process 10 entities at a time
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit': {
        options.limit = Number.parseInt(args[++i], 10);
        break;
      }
      case '--force': {
        options.force = true;
        break;
      }
      case '--batch-size': {
        options.batchSize = Number.parseInt(args[++i], 10);
        break;
      }
      case '--help': {
        printHelp();
        process.exit(0);
      }
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Generate Embeddings CLI Tool

Usage:
  npm run embeddings:generate [options]

Options:
  --limit <n>        Generate embeddings for first N entities only (for testing)
  --force            Regenerate embeddings even if they already exist
  --batch-size <n>   Number of entities to process in each batch (default: 10)
  --help             Show this help message

Environment Variables:
  OPENAI_API_KEY     Required: Your OpenAI API key
  NEO4J_URI          Neo4j connection URI (default: bolt://localhost:7687)
  NEO4J_USERNAME     Neo4j username (default: neo4j)
  NEO4J_PASSWORD     Neo4j password

Examples:
  npm run embeddings:generate                    # Generate for all entities
  npm run embeddings:generate -- --limit 5       # Test with 5 entities first
  npm run embeddings:generate -- --force         # Regenerate all
  `);
}

/**
 * Generate embeddings for entities in the knowledge graph
 */
async function generateEmbeddings(options: GenerateEmbeddingsOptions = {}): Promise<void> {
  console.log('\n🚀 Starting embedding generation...\n');

  // Validate OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
    console.error('   Please set your OpenAI API key:');
    console.error('   export OPENAI_API_KEY=sk-your-key-here\n');
    process.exit(1);
  }

  // Create storage provider
  console.log('📊 Connecting to Neo4j...');
  const storageProvider = new Neo4jStorageProvider({
    config: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || '',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    },
  });

  try {
    // Create embedding service
    console.log('🤖 Initializing OpenAI embedding service...');
    const embeddingService = EmbeddingServiceFactory.createFromEnvironment();
    const modelInfo = embeddingService.getProviderInfo();
    console.log(`   Provider: ${modelInfo.provider}`);
    console.log(`   Model: ${modelInfo.model}`);
    console.log(`   Dimensions: ${modelInfo.dimensions}\n`);

    // Query entities
    const whereClause = options.force
      ? 'WHERE e.validTo IS NULL'
      : 'WHERE e.validTo IS NULL AND (e.embedding IS NULL OR size(e.embedding) = 0)';

    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    console.log('🔍 Querying entities without embeddings...');
    const query = `
      MATCH (e:Entity)
      ${whereClause}
      RETURN e.name AS name, e.observations AS observations, e.entityType AS entityType
      ORDER BY e.name
      ${limitClause}
    `;

    const connectionManager = storageProvider.getConnectionManager();
    const result = await connectionManager.executeQuery(query, {});
    const entities = result.records.map((record) => ({
      name: record.get('name'),
      observations: record.get('observations'),
      entityType: record.get('entityType'),
    }));

    if (entities.length === 0) {
      console.log('✅ All entities already have embeddings!\n');
      await storageProvider.close();
      return;
    }

    console.log(`   Found ${entities.length} entities to process\n`);

    // Process in batches
    const batchSize = options.batchSize || 10;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, Math.min(i + batchSize, entities.length));
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(entities.length / batchSize);

      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} entities)...`);

      for (const entity of batch) {
        try {
          // Prepare text from observations
          const observations = Array.isArray(entity.observations)
            ? entity.observations
            : JSON.parse(entity.observations || '[]');
          const text = observations.join('\n');

          if (!text || text.trim().length === 0) {
            console.log(`   ⚠️  Skipping ${entity.name}: no observations`);
            processed++;
            continue;
          }

          // Generate embedding
          const embedding = await embeddingService.generateEmbedding(text);

          // Update entity
          const updateQuery = `
            MATCH (e:Entity {name: $name})
            WHERE e.validTo IS NULL
            SET e.embedding = $embedding, e.updatedAt = $now
            RETURN e.name
          `;

          await connectionManager.executeQuery(updateQuery, {
            name: entity.name,
            embedding,
            now: Date.now(),
          });

          console.log(`   ✅ ${entity.name} (${entity.entityType})`);
          succeeded++;
        } catch (error) {
          console.error(`   ❌ Failed: ${entity.name}`);
          console.error(`      Error: ${error instanceof Error ? error.message : String(error)}`);
          failed++;
        }

        processed++;
      }

      // Progress summary
      const progress = ((processed / entities.length) * 100).toFixed(1);
      console.log(`   Progress: ${processed}/${entities.length} (${progress}%)\n`);

      // Rate limiting: small delay between batches
      if (i + batchSize < entities.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Final summary
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 Embedding Generation Complete!');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Total processed: ${processed}`);
    console.log(`   ✅ Succeeded: ${succeeded}`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed}`);
    }
    console.log('═══════════════════════════════════════════════════\n');

    // Calculate estimated cost
    const avgTokensPerEntity = 200; // Conservative estimate
    const totalTokens = succeeded * avgTokensPerEntity;
    const costPer1MTokens = 0.02; // text-embedding-3-small
    const estimatedCost = (totalTokens / 1_000_000) * costPer1MTokens;

    console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)} USD`);
    console.log(`   (${totalTokens.toLocaleString()} tokens × $${costPer1MTokens}/1M tokens)\n`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await storageProvider.close();
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  generateEmbeddings(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { generateEmbeddings };
