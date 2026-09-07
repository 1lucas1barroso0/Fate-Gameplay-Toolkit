import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { roomCodeSchema, roomFileUploadSchema } from "@/lib/room-contracts";
import { MAX_ROOM_FILE_BYTES } from "@/lib/room-contracts";
import {
  authorizeRoomFileUpload,
  completeRoomFileUpload,
  RoomHttpError,
} from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

function errorMessage(error: unknown) {
  if (error instanceof RoomHttpError) return error.message;
  if (error && typeof error === "object" && "issues" in error) return "Arquivo inválido. Tente novamente.";
  return error instanceof Error ? error.message : "O arquivo não foi publicado. Tente novamente.";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const roomCode = roomCodeSchema.parse(code);
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const input = roomFileUploadSchema.parse(JSON.parse(clientPayload || "{}"));
        return {
          addRandomSuffix: false,
          maximumSizeInBytes: MAX_ROOM_FILE_BYTES,
          tokenPayload: await authorizeRoomFileUpload(roomCode, pathname, input),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await completeRoomFileUpload(blob, tokenPayload);
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("room-file-upload-failed", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: error instanceof RoomHttpError ? error.status : 400 });
  }
}
