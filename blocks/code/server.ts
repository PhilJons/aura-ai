import { streamObject } from 'ai';
import { z } from 'zod';

import { myProvider } from '@/lib/ai/models';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/blocks/server';

export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({ title, dataStream }) => {
    const { fullStream } = streamObject({
      model: myProvider.languageModel('block-model'),
      system: `You are a code generator. You will generate code based on the title provided.
      The code should be well-documented and follow best practices.
      Include any necessary imports and dependencies.`,
      prompt: title,
      schema: z.object({
        code: z.string(),
        language: z.string(),
      }),
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'object') {
        const { code } = chunk.object;
        if (code) {
          draftContent = code;
          dataStream.writeData({
            type: 'code-delta',
            content: code,
          });
        }
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    const { fullStream } = streamObject({
      model: myProvider.languageModel('block-model'),
      system: updateDocumentPrompt(document.content || '', 'code'),
      prompt: description,
      schema: z.object({
        code: z.string(),
        language: z.string(),
      }),
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'object') {
        const { code } = chunk.object;
        if (code) {
          draftContent = code;
          dataStream.writeData({
            type: 'code-delta',
            content: code,
          });
        }
      }
    }

    return draftContent;
  },
});
