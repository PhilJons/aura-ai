import { CosmosClient } from '@azure/cosmos';

if (!process.env.COSMOSDB_CONNECTION_STRING) {
  throw new Error('COSMOSDB_CONNECTION_STRING environment variable is not set');
}

if (!process.env.COSMOSDB_DATABASE_NAME) {
  throw new Error('COSMOSDB_DATABASE_NAME environment variable is not set');
}

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING);
const database = client.database(process.env.COSMOSDB_DATABASE_NAME);

// Get container references
export const containers = {
  users: database.container('users'),
  chats: database.container('chats'),
  messages: database.container('messages'),
  votes: database.container('votes'),
  documents: database.container('documents'),
  suggestions: database.container('suggestions'),
};

export { client, database }; 