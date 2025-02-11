# AI Chatbot

A modern, feature-rich AI chatbot built with Next.js 14, leveraging multiple AI models including Azure OpenAI 4o and 4o-mini. This application provides an interactive chat interface with support for multiple AI models, file uploads, and real-time conversations.

## Features

- 🤖 Multi-model support
- 📁 File upload and processing capabilities
- 🔒 Secure authentication system
- 💾 Persistent chat history using Cosmos DB
- 🎨 Modern and responsive UI
- 🚀 Built with Next.js 14 and TypeScript
- 📱 Mobile-friendly design

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Database**: Azure Cosmos DB
- **Authentication**: Built-in auth system
- **AI Integration**: Azure OpenAI, Fireworks AI
- **Storage**: Azure Blob Storage
- **UI Components**: Radix UI
- **Styling**: Tailwind CSS

## Getting Started

1. Clone the repository:
   ```bash
   git clone [your-repo-url]
   cd ai-chatbot
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required environment variables

4. Run the development server:
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

Make sure to set up the following environment variables in your `.env` file:

- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint
- `COSMOS_CONNECTION_STRING` - Azure Cosmos DB connection string
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Blob Storage connection string
- Additional environment variables as specified in `.env.example`

## Deployment

This project is configured for deployment on Vercel:

1. Push your code to GitHub
2. Import your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using Vercel, Next.js, and Azure
