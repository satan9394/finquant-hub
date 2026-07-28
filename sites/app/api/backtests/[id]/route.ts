import { authenticationRequired, ownerIdFromRequest } from "@/lib/auth";
import { getBacktest } from "@/lib/database";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await ownerIdFromRequest(request);
    if (!ownerId) return authenticationRequired();
    const { id } = await context.params;
    const run = await getBacktest(ownerId, id);
    return run ? Response.json({ run }) : Response.json({ error: "回测记录不存在" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "回测记录加载失败" }, { status: 500 });
  }
}
