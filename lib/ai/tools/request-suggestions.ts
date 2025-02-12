import { type DataStreamWriter, streamObject, tool } from 'ai';
import type { Session } from 'next-auth';
import { z } from 'zod';
import { generateUUID } from '@/lib/utils';
import { getDocumentById, saveSuggestions } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/models';
import type { Suggestion } from '@/lib/db/schema';

interface RequestSuggestionsProps {
  session: Session;
  dataStream: DataStreamWriter;
}

interface SuggestionElement {
  originalSentence: string;
  suggestedSentence: string;
  description: string;
}

const SUGGESTION_PROMPT = 'You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions.';

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps) =>
  tool({
    description:
      'Request suggestions for a document. This tool will call other functions that will generate suggestions based on the document content.',
    parameters: z.object({
      id: z.string().describe('The ID of the document to get suggestions for'),
      description: z
        .string()
        .describe('The description of the changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      const document = await getDocumentById({ id });

      if (!document) {
        return {
          error: 'Document not found',
        };
      }

      if (!session.user?.id) {
        return {
          error: 'Unauthorized',
        };
      }

      const userId = session.user.id;
      const model = myProvider.languageModel('block-model');
      const suggestionSchema = z.object({
        originalSentence: z.string().describe('The original sentence'),
        suggestedSentence: z.string().describe('The suggested sentence'),
        description: z.string().describe('The description of the suggestion'),
      });

      const { fullStream } = streamObject({
        model,
        system: SUGGESTION_PROMPT,
        prompt: description,
        schema: suggestionSchema,
      });

      const elements: SuggestionElement[] = [];
      for await (const chunk of fullStream) {
        if (chunk.type === 'object') {
          const element = chunk.object as SuggestionElement;
          elements.push(element);
          dataStream.writeData({
            type: 'suggestion',
            content: {
              id: generateUUID(),
              documentId: document.id,
              originalText: element.originalSentence,
              suggestedText: element.suggestedSentence,
              description: element.description,
              isResolved: false,
              type: 'suggestion' as const,
              userId,
              createdAt: new Date().toISOString(),
              documentCreatedAt: document.createdAt
            },
          });
        }
      }

      const suggestions: Suggestion[] = elements.map((element) => ({
        id: generateUUID(),
        documentId: document.id,
        originalText: element.originalSentence,
        suggestedText: element.suggestedSentence,
        description: element.description,
        isResolved: false,
        type: 'suggestion' as const,
        userId,
        createdAt: new Date().toISOString(),
        documentCreatedAt: document.createdAt
      }));

      await saveSuggestions({ suggestions });

      dataStream.writeData({ type: 'finish', content: '' });

      return {
        id,
        content: 'Suggestions have been generated and saved.',
      };
    },
  });

async function streamToArray<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of stream) {
    result.push(item);
  }
  return result;
}
