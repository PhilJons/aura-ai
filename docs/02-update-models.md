# Update Models

The AI chat supports [multiple providers](https://sdk.vercel.ai/providers/ai-sdk-providers) out of the box, with the current implementation using Azure OpenAI Services.

To update the models, you will need to update the custom provider called `myProvider` at `/lib/ai/models.ts` shown below.

```ts
import { customProvider } from "ai";
import { azure } from "@ai-sdk/azure";

export const myProvider = customProvider({
  languageModels: {
    "chat-model-small": azure("gpt-4"),
    "chat-model-large": azure("gpt-4-turbo"),
    "title-model": azure("gpt-4"),
    "block-model": azure("gpt-4"),
  },
  imageModels: {
    "small-model": azure.image("dall-e-3"),
  },
});
```

You can replace the `azure` models with any other provider of your choice. You will need to install the provider library and switch the models accordingly.

For example, if you want to use OpenAI's direct API with `gpt-4-turbo` model for `chat-model-large`, you can replace the `azure` model with the `openai` model as shown below.

```ts
import { customProvider } from "ai";
import { openai } from "@ai-sdk/openai";

export const myProvider = customProvider({
  languageModels: {
    "chat-model-small": azure("gpt-4"),
    "chat-model-large": openai("gpt-4-turbo"), // Replace azure with openai
    "title-model": azure("gpt-4"),
    "block-model": azure("gpt-4"),
  },
  imageModels: {
    "small-model": azure.image("dall-e-3"),
  },
});
```

You can find the provider library and model names in the [provider](https://sdk.vercel.ai/providers/ai-sdk-providers)'s documentation. Once you have updated the models, you should be able to use the new models in your chatbot.

To use Azure OpenAI Services, make sure you have the following environment variables set in your `.env.local` file:

```env
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_RESOURCE_NAME=your-resource-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```
