import { JSONValue } from "ai"

// Define the Attachment type directly here instead of importing it
export interface Attachment {
  name: string
  type: string
  size: number
  url: string
  content?: string
}

// Define ToolInvocation interface directly
export interface ToolInvocation {
  id: string
  type: string
  input: Record<string, any>
}

export interface Message {
  id: string
  chatId: string
  createdAt?: Date
  content: string
  reasoning?: string
  experimental_attachments?: Attachment[]
  role: 'system' | 'user' | 'assistant' | 'data'
  data?: JSONValue
  annotations?: JSONValue[]
  toolInvocations?: ToolInvocation[]
  isDocumentPreview?: boolean
} 