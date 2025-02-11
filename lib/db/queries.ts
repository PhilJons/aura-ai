import 'server-only';
import { BlockKind } from '@/components/block';
import { containers } from './cosmos';
import type { User, Chat, Message, Vote, Document, Suggestion } from './schema';
import { v4 as uuidv4 } from 'uuid';

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
    email,
    password,
    type: 'user'
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
  const chat: Chat = {
    id,
    createdAt: new Date().toISOString(),
    title,
    userId,
    visibility,
    type: 'chat'
  };
  console.log('Saving chat:', chat);
  const { resource } = await containers.chats.items.create(chat);
  console.log('Saved chat result:', resource);
  return resource as Chat;
}

export async function deleteChatById({ id }: { id: string }) {
  // Delete votes for this chat
  const voteQuerySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources: votes } = await containers.votes.items.query(voteQuerySpec).fetchAll();
  for (const vote of votes) {
    await containers.votes.item(vote.id, vote.chatId).delete();
  }

  // Delete messages for this chat
  const messageQuerySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId',
    parameters: [{ name: '@chatId', value: id }]
  };
  const { resources: messages } = await containers.messages.items.query(messageQuerySpec).fetchAll();
  for (const message of messages) {
    await containers.messages.item(message.id, message.chatId).delete();
  }

  // Delete the chat itself
  await containers.chats.item(id, id).delete();
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
  const { resource } = await containers.chats.item(id, id).read();
  return resource as Chat | undefined;
}

export async function saveMessages({ messages }: { messages: Array<Message> }): Promise<Message[]> {
  console.log('Saving messages:', messages);
  const savedMessages: Message[] = [];
  for (const msg of messages) {
    const message: Message = {
      ...msg,
      type: 'message',
      createdAt: new Date().toISOString()
    };
    const { resource } = await containers.messages.items.upsert(message);
    console.log('Saved message result:', resource);
    if (resource) {
      savedMessages.push({ ...message, ...resource as unknown as Partial<Message> });
    } else {
      savedMessages.push(message);
    }
  }
  return savedMessages;
}

export async function getMessagesByChatId({ id }: { id: string }): Promise<Message[]> {
  console.log('Getting messages for chat:', id);
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId AND c.type = "message" ORDER BY c.createdAt ASC',
    parameters: [{ name: '@chatId', value: id }]
  };
  console.log('Query spec:', querySpec);
  const { resources } = await containers.messages.items.query(querySpec).fetchAll();
  console.log('Retrieved messages:', resources);
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
  kind: BlockKind;
  content: string;
  userId: string;
}): Promise<Document> {
  const document: Document = {
    id,
    title,
    kind,
    content,
    userId,
    createdAt: new Date().toISOString(),
    type: 'document'
  };
  const { resource } = await containers.documents.items.create(document);
  return resource as Document;
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
  
  // Delete suggestions for documents after timestamp
  const suggestionQuerySpec = {
    query: 'SELECT * FROM c WHERE c.documentId = @documentId AND c.documentCreatedAt > @timestamp',
    parameters: [
      { name: '@documentId', value: id },
      { name: '@timestamp', value: timestampStr }
    ]
  };
  const { resources: suggestions } = await containers.suggestions.items.query(suggestionQuerySpec).fetchAll();
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
  for (const document of documents) {
    await containers.documents.item(document.id, document.id).delete();
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
  const { resource } = await containers.messages.item(id, id).read();
  return resource as Message | undefined;
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  const timestampStr = timestamp.toISOString();

  // Get messages to delete
  const messageQuerySpec = {
    query: 'SELECT * FROM c WHERE c.chatId = @chatId AND c.createdAt >= @timestamp',
    parameters: [
      { name: '@chatId', value: chatId },
      { name: '@timestamp', value: timestampStr }
    ]
  };
  const { resources: messages } = await containers.messages.items.query(messageQuerySpec).fetchAll();
  
  // Delete votes for these messages
  for (const msg of messages) {
    const voteQuerySpec = {
      query: 'SELECT * FROM c WHERE c.chatId = @chatId AND c.messageId = @messageId',
      parameters: [
        { name: '@chatId', value: chatId },
        { name: '@messageId', value: msg.id }
      ]
    };
    const { resources: votes } = await containers.votes.items.query(voteQuerySpec).fetchAll();
    for (const vote of votes) {
      await containers.votes.item(vote.id, vote.chatId).delete();
    }
    
    // Delete the message
    await containers.messages.item(msg.id, msg.chatId).delete();
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
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.id = @id ORDER BY c.createdAt DESC',
    parameters: [{ name: '@id', value: id }]
  };
  const { resources } = await containers.documents.items.query(querySpec).fetchAll();
  return resources as Document[];
}
