import { getAuth, accountFailure } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ available: Boolean(process.env.DATABASE_URL) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    return Response.json({ user: session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountFailure(error); }
}
