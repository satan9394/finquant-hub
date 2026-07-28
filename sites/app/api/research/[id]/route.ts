import { authenticationRequired, ownerIdFromRequest } from "@/lib/auth";
import { deleteReport, getReport } from "@/lib/database";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerId = await ownerIdFromRequest(request);
  if (!ownerId) return authenticationRequired();
  const { id } = await context.params;
  const report = await getReport(ownerId, id);
  return report ? Response.json({ report }) : Response.json({ error: "报告不存在" }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerId = await ownerIdFromRequest(request);
  if (!ownerId) return authenticationRequired();
  const { id } = await context.params;
  return await deleteReport(ownerId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "报告不存在" }, { status: 404 });
}
