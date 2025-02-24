import 'server-only';
import { containers } from './cosmos';
import type { User, Chat, Message, Vote, Document, Suggestion } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { debug, debugError } from '@/lib/utils/debug';

export async function getUser(email: string): Promise<User | undefined> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.email = @email',
    parameters: [{ name: '@email', value: email }]
  };
  const { resources } = await containers.users.items.query(querySpec).fetchAll();
  return resources[0] as User | undefined;
}

export async function createUser(email: string, password?: string): Promise<User> {
  const user: User = {
    id: uuidv4(),
    type: "user",
    email,
    password,
    azureSub: '', // Empty string for non-Azure AD users
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const { resource } = await containers.users.items.create(user);
  return resource as User;
}

export async function saveChat({
  id,
  userId,
  title,
  visibility = 'private'
}: {
  id: string;
  userId: string;
  title: string;
  visibility?: 'private' | 'public';
}): Promise<Chat> {
  debug('db', 'Creating new chat', { chatId: id, userId, title, visibility });
  const chat: Chat = {
    id,
    createdAt: new Date().toISOString(),
    title,
    userId,
    visibility,
    type: 'chat'
  };
  const { resource } = await containers.chats.items.create(chat);
  debug('db', 'Chat created successfully', { chatId: id, title });
  return resource as Chat;
}

export async function deleteChatById({ id }: { id: string }) {
  debug('db', 'Deleting chat and related data', { chatId: id });
  
  // Delete votes for this chat
  const voteQuerySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources: votes } = await containers.votes.items.query(voteQuerySpec).fetchAll();
  debug('db', 'Found votes to delete', { chatId: id, count: votes.length });
  
  for (const vote of votes) {
    await containers.votes.item(vote.id, vote.chatId).delete();
  }

  // Delete messages for this chat
  const messageQuerySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources: messages } = await containers.messages.items.query(messageQuerySpec).fetchAll();
  debug('db', 'Found messages to delete', { chatId: id, count: messages.length });
  
  for (const message of messages) {
    await containers.messages.item(message.id, message.chatId).delete();
  }

  // Delete the chat itself
  await containers.chats.item(id, id).delete();
  debug('db', 'Chat and related data deleted successfully', { chatId: id });
}

export async function getChatsByUserId({ id }: { id: string }): Promise<Chat[]> {
  const querySpec = {
    query: "SELECT * FROM c WHERE (c.userId = @userId) OR (c.visibility = 'public' AND c.type = 'chat') ORDER BY c.createdAt DESC",
    parameters: [{ name: '@userId', value: id }]
  };
  const { resources } = await containers.chats.items.query(querySpec).fetchAll();
  return resources as Chat[];
}

export async function getChatById({ id }: { id: string }): Promise<Chat | undefined> {
  debug('db', 'Looking up chat by ID', { chatId: id });
  const { resource } = await containers.chats.item(id, id).read();
  debug('db', resource ? 'Chat found' : 'Chat not found', { chatId: id });
  return resource as Chat | undefined;
}

export async function saveMessages({ messages }: { messages: Array<Message> }): Promise<Message[]> {
  debug('db', 'Saving messages', { count: messages.length });
  const savedMessages: Message[] = [];
  for (const msg of messages) {
    const message: Message = {
      ...msg,
      type: 'message',
      createdAt: new Date().toISOString()
    };
    debug('db', 'Saving individual message', {
      messageId: message.id,
      chatId: message.chatId,
      role: message.role
    });
    const { resource } = await containers.messages.items.upsert(message);
    if (resource) {
      savedMessages.push({ ...message, ...resource as unknown as Partial<Message> });
    } else {
      savedMessages.push(message);
    }
  }
  debug('db', 'All messages saved successfully', { count: savedMessages.length });
  return savedMessages;
}

export async function getMessagesByChatId({ id }: { id: string }): Promise<Message[]> {
  debug('db', 'Fetching messages for chat', { chatId: id });
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId AND c.type = "message" ORDER BY c.createdAt ASC',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources } = await containers.messages.items.query(querySpec).fetchAll();
  debug('db', 'Messages retrieved', { chatId: id, count: resources.length });
  return resources as Message[];
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}): Promise<Vote> {
  const vote: Vote = {
    chatId,
    messageId,
    isUpvoted: type === 'up',
    type: 'vote' as const
  };
  const { resource } = await containers.votes.items.upsert(vote);
  return resource ? { ...vote, ...resource } : vote;
}

export async function getVotesByChatId({ id }: { id: string }): Promise<Vote[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources } = await containers.votes.items.query(querySpec).fetchAll();
  return resources as Vote[];
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: string;
  content: string;
  userId: string;
}): Promise<Document> {
  debug('document', 'Saving document', {
    id,
    title,
    kind,
    contentLength: content.length,
    userId
  });

  const document: Document = {
    id,
    title,
    kind,
    content,
    userId,
    createdAt: new Date().toISOString(),
    type: 'document'
  };

  try {
    const { resource } = await containers.documents.items.upsert(document);
    debug('document', 'Document saved successfully', {
      id: document.id,
      title: document.title,
      kind: document.kind
    });
    return resource ? { ...document, ...resource as Partial<Document> } : document;
  } catch (error) {
    debugError('document', 'Failed to save document', { error: String(error) });
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }): Promise<Document | undefined> {
  const { resource } = await containers.documents.item(id, id).read();
  return resource as Document | undefined;
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  const timestampStr = timestamp.toISOString();
  
  debug('document', 'Deleting documents after timestamp', {
    id,
    timestamp: timestampStr
  });

  try {
    // Delete suggestions for documents after timestamp
    const suggestionQuerySpec = {
      query: 'SELECT * FROM c WHERE c.documentId = @documentId AND c.documentCreatedAt > @timestamp',
      parameters: [
        { name: '@documentId', value: id },
        { name: '@timestamp', value: timestampStr }
      ]
    };
    const { resources: suggestions } = await containers.suggestions.items.query(suggestionQuerySpec).fetchAll();
    
    debug('document', 'Found suggestions to delete', {
      id,
      count: suggestions.length
    });

    for (const suggestion of suggestions) {
      await containers.suggestions.item(suggestion.id, suggestion.documentId).delete();
    }

    // Delete documents after timestamp
    const documentQuerySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id AND c.createdAt > @timestamp',
      parameters: [
        { name: '@id', value: id },
        { name: '@timestamp', value: timestampStr }
      ]
    };
    const { resources: documents } = await containers.documents.items.query(documentQuerySpec).fetchAll();
    
    debug('document', 'Found documents to delete', {
      id,
      count: documents.length,
      timestamps: documents.map(doc => doc.createdAt)
    });

    for (const document of documents) {
      await containers.documents.item(document.id, document.id).delete();
    }

    debug('document', 'Successfully deleted documents and suggestions', {
      id,
      deletedDocuments: documents.length,
      deletedSuggestions: suggestions.length
    });
  } catch (error) {
    debugError('document', 'Failed to delete documents', { error: String(error) });
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}): Promise<Suggestion[]> {
  const savedSuggestions: Suggestion[] = [];
  for (const sug of suggestions) {
    const suggestion: Suggestion = {
      ...sug,
      type: 'suggestion',
      createdAt: new Date().toISOString()
    };
    const { resource } = await containers.suggestions.items.create(suggestion);
    savedSuggestions.push(resource as Suggestion);
  }
  return savedSuggestions;
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}): Promise<Suggestion[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.documentId = @documentId',
    parameters: [{ name: '@documentId', value: documentId }]
  };
  const { resources } = await containers.suggestions.items.query(querySpec).fetchAll();
  return resources as Suggestion[];
}

export async function getMessageById({ id }: { id: string }): Promise<Message | undefined> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.id = @id AND c.type = "message"',
    parameters: [{ name: '@id', value: id }]
  };
  const { resources } = await containers.messages.items.query(querySpec).fetchAll();
  return resources[0] as Message | undefined;
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}): Promise<void> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId AND c.type = "message" AND c.createdAt > @timestamp',
    parameters: [
      { name: '@chatId', value: chatId },
      { name: '@timestamp', value: timestamp.toISOString() }
    ]
  };
  const { resources } = await containers.messages.items.query(querySpec).fetchAll();
  
  for (const message of resources) {
    await containers.messages.item(message.id, message.chatId).delete();
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}): Promise<Chat | undefined> {
  const { resource } = await containers.chats.item(chatId, chatId).read();
  if (resource) {
    resource.visibility = visibility;
    const { resource: updatedResource } = await containers.chats.item(chatId, chatId).replace(resource);
    return updatedResource as Chat;
  }
  return undefined;
}

export async function getDocumentsById({ id }: { id: string }): Promise<Document[]> {
  debug('document', 'Fetching documents by ID', { id });

  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id ORDER BY c.createdAt DESC',
      parameters: [{ name: '@id', value: id }]
    };
    const { resources } = await containers.documents.items.query(querySpec).fetchAll();
    
    debug('document', 'Documents retrieved successfully', {
      id,
      count: resources.length,
      timestamps: resources.map(doc => doc.createdAt)
    });

    return resources as Document[];
  } catch (error) {
    debugError('document', 'Failed to fetch documents', { error: String(error) });
    throw error;
  }
}

export async function getOrCreateUserByAzureSub(azureSub: string, email: string): Promise<User> {
  // First try to find the user by email
  const emailQuerySpec = {
    query: "SELECT * FROM c WHERE c.email = @email AND c.type = 'user'",
    parameters: [
      { name: "@email", value: email }
    ]
  };

  const { resources: emailResults } = await containers.users.items.query(emailQuerySpec).fetchAll();
  const existingUserByEmail = emailResults[0] as User | undefined;

  if (existingUserByEmail) {
    // Update the Azure sub if it's different
    if (existingUserByEmail.azureSub !== azureSub) {
      const updatedUser: User = {
        ...existingUserByEmail,
        azureSub,
        updatedAt: new Date().toISOString()
      };
      const { resource } = await containers.users.item(existingUserByEmail.id, existingUserByEmail.id).replace(updatedUser);
      return resource as User;
    }
    
    return existingUserByEmail;
  }

  // If no user found by email, try by Azure sub as fallback
  const subQuerySpec = {
    query: "SELECT * FROM c WHERE c.azureSub = @azureSub AND c.type = 'user'",
    parameters: [
      { name: "@azureSub", value: azureSub }
    ]
  };

  const { resources: subResults } = await containers.users.items.query(subQuerySpec).fetchAll();
  const existingUserBySub = subResults[0] as User | undefined;

  if (existingUserBySub) {
    return existingUserBySub;
  }

  // If user doesn't exist at all, create a new one
  const newUser: User = {
    id: uuidv4(),
    type: "user",
    email,
    azureSub,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const { resource } = await containers.users.items.create(newUser);
  
  if (!resource) {
    throw new Error("Failed to create user");
  }

  debug('db', 'New user created successfully', {
    userId: newUser.id,
    email: newUser.email
  } as Record<string, any>);
  return resource as User;
}

export async function cleanupDuplicateUsers(): Promise<void> {
  debug('db', 'Starting duplicate user cleanup');
  
  // Get all users
  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' ORDER BY c.email, c.updatedAt DESC"
  };
  
  const { resources } = await containers.users.items.query(querySpec).fetchAll();
  const users = resources as User[];
  
  // Group users by email
  const usersByEmail = new Map<string, User[]>();
  users.forEach(user => {
    const existing = usersByEmail.get(user.email) || [];
    usersByEmail.set(user.email, [...existing, user]);
  });
  
  // For each email with multiple users, keep only the most recent one
  for (const [email, emailUsers] of usersByEmail.entries()) {
    if (emailUsers.length > 1) {
      debug('db', `Found ${emailUsers.length} users for email ${email}`);
      
      // Sort by updatedAt in descending order
      const sortedUsers = emailUsers.sort((a, b) => {
        // Handle potentially undefined updatedAt values
        const dateA = a.updatedAt || a.createdAt || new Date(0).toISOString();
        const dateB = b.updatedAt || b.createdAt || new Date(0).toISOString();
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      // Keep the first one (most recent) and delete the rest
      const [keepUser, ...duplicates] = sortedUsers;
      
      debug('db', `Keeping user ${keepUser.id}, deleting ${duplicates.length} duplicates`);
      
      for (const dupUser of duplicates) {
        debug('db', `Deleting duplicate user`, { userId: dupUser.id, email: dupUser.email });
        await containers.users.item(dupUser.id, dupUser.id).delete();
      }
    }
  }
  
  debug('db', 'Duplicate user cleanup completed');
}
