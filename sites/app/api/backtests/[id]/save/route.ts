import { authenticationRequired, ownerIdFromRequest } from "@/lib/auth";
import { markBacktestSaved } from "@/lib/database";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await ownerIdFromRequest(request);
    if (!ownerId) return authenticationRequired();
    const { id } = await context.params;
    const run = await markBacktestSaved(ownerId, id);
    return run ? Response.json({ run }) : Response.json({ error: "回测记录不存在" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存回测失败" }, { status: 500 });
  }
}
