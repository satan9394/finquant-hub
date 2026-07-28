import { deleteReport, getReport } from "@/lib/database";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const report = await getReport(id);
  return report ? Response.json({ report }) : Response.json({ error: "报告不存在" }, { status: 404 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return await deleteReport(id)
    ? Response.json({ ok: true })
    : Response.json({ error: "报告不存在" }, { status: 404 });
}
