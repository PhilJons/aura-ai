import type { NextRequest } from "next/server";
import { getDocumentsById, saveDocument, deleteDocumentsByIdAfterTimestamp } from "@/lib/db/queries";
import { debug, debugError } from "@/lib/utils/debug";
import { auth } from "@/app/(auth)/auth";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  debug('api', 'Document GET request received', { id });

  if (!id) {
    debugError('api', 'Missing document ID', null);
    return new Response("Missing document ID", { status: 400 });
  }

  try {
    const documents = await getDocumentsById({ id });
    debug('api', 'Documents retrieved successfully', { 
      id,
      count: documents.length 
    });
    return Response.json(documents);
  } catch (error) {
    debugError('api', 'Failed to get documents', error);
    return new Response("Failed to get documents", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  debug('api', 'Document POST request received', { id });

  if (!id) {
    debugError('api', 'Missing document ID', null);
    return new Response("Missing document ID", { status: 400 });
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    debug('api', 'Document update payload', { 
      id,
      title: body.title,
      contentLength: body.content?.length,
      kind: body.kind
    });

    const document = await saveDocument({
      id,
      title: body.title,
      content: body.content || '',
      kind: body.kind,
      userId: session.user.id
    });

    debug('api', 'Document saved successfully', { 
      id: document.id,
      title: document.title
    });

    return Response.json(document);
  } catch (error) {
    debugError('api', 'Failed to save document', error);
    return new Response("Failed to save document", { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const timestamp = request.nextUrl.searchParams.get("timestamp");
  
  debug('api', 'Document DELETE request received', { id, timestamp });

  if (!id || !timestamp) {
    debugError('api', 'Missing required parameters', { id, timestamp });
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    await deleteDocumentsByIdAfterTimestamp({
      id,
      timestamp: new Date(timestamp)
    });
    debug('api', 'Documents deleted after timestamp', { id, timestamp });
    return new Response(null, { status: 204 });
  } catch (error) {
    debugError('api', 'Failed to delete documents', error);
    return new Response("Failed to delete documents", { status: 500 });
  }
} 