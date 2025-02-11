import { auth } from '@/app/(auth)/auth';
import { getChatsByUserId } from '@/lib/db/queries';
import { containers } from '@/lib/db/cosmos';

export async function GET() {
  const session = await auth();

  // For unauthenticated users, get only public chats
  if (!session?.user?.id) {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.visibility = 'public' ORDER BY c.createdAt DESC",
      parameters: []
    };
    const { resources } = await containers.chats.items.query(querySpec).fetchAll();
    return Response.json(resources);
  }

  // For authenticated users, get their chats and public chats
  const chats = await getChatsByUserId({ id: session.user.id });
  return Response.json(chats);
}
