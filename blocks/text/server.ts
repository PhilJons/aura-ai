import { streamText, smoothStream } from 'ai';
import { myProvider } from '@/lib/ai/models';
import { createDocumentHandler } from '@/lib/blocks/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts';

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({ title, dataStream }) => {
    const { fullStream } = streamText({
      model: myProvider.languageModel('block-model'),
      system: `You are a text generator. You will generate text content based on the title provided.
      The content should be well-structured and engaging.
      Use appropriate formatting and style.`,
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: title,
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'text-delta') {
        draftContent += chunk.textDelta;
        dataStream.writeData({
          type: 'text-delta',
          content: chunk.textDelta,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    const { fullStream } = streamText({
      model: myProvider.languageModel('block-model'),
      system: updateDocumentPrompt(document.content || '', 'text'),
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: description,
    });

    let draftContent = '';

    for await (const chunk of fullStream) {
      if (chunk.type === 'text-delta') {
        draftContent += chunk.textDelta;
        dataStream.writeData({
          type: 'text-delta',
          content: chunk.textDelta,
        });
      }
    }

    return draftContent;
  },
});
