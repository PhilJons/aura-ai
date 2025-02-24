// Cosmos DB interfaces
export interface User {
  id: string;
  email: string;
  password?: string;
  type: 'user';
}

export interface Chat {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  visibility: 'public' | 'private';
  type: 'chat';
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'data' | 'tool';

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: any;
  createdAt: string;
  type: 'message';
}

export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
  type: 'vote';
}

export interface Document {
  id: string;
  createdAt: string;
  title: string;
  content?: string;
  kind: string;
  userId: string;
  type: 'document';
}

export interface Suggestion {
  id: string;
  documentId: string;
  documentCreatedAt: string;
  originalText: string;
  suggestedText: string;
  description?: string;
  isResolved: boolean;
  userId: string;
  createdAt: string;
  type: 'suggestion';
}
