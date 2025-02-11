import { streamObject } from 'ai';
import { z } from 'zod';

import { myProvider } from '@/lib/ai/models';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/blocks/server';

export const sheetDocumentHandler = createDocumentHandler<'sheet'>({
  kind: 'sheet',
  onCreateDocument: async ({ title, dataStream }) => {
    const { fullStream } = streamObject({
      model: myProvider.languageModel('block-model'),
      system: `You are a spreadsheet generator. You will generate CSV data based on the title provided.
      The data should be well-structured and follow best practices.
      Include headers and appropriate data types.`,
      prompt: title,
      schema: z.object({
        csv: z.string(),
      }),
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'object') {
        const { csv } = chunk.object;
        if (csv) {
          draftContent = csv;
          dataStream.writeData({
            type: 'sheet-delta',
            content: csv,
          });
        }
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    const { fullStream } = streamObject({
      model: myProvider.languageModel('block-model'),
      system: updateDocumentPrompt(document.content || '', 'sheet'),
      prompt: description,
      schema: z.object({
        csv: z.string(),
      }),
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'object') {
        const { csv } = chunk.object;
        if (csv) {
          draftContent = csv;
          dataStream.writeData({
            type: 'sheet-delta',
            content: csv,
          });
        }
      }
    }

    return draftContent;
  },
});
