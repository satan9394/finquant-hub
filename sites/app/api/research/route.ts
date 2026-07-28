import { ownerIdFromRequest } from "@/lib/auth";
import { listGroups, listReports, saveReport } from "@/lib/database";
import { runResearch } from "@/lib/research";

export async function GET(request: Request) {
  try {
    const ownerId = await ownerIdFromRequest(request);
    if (!ownerId) {
      return Response.json({ groups: [], reports: [], authenticated: false, persistence: "ephemeral" });
    }
    const groupId = new URL(request.url).searchParams.get("group");
    return groupId
      ? Response.json({ reports: await listReports(ownerId, groupId), authenticated: true, persistence: "account" })
      : Response.json({ groups: await listGroups(ownerId), authenticated: true, persistence: "account" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "历史加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await ownerIdFromRequest(request);
    const body = await request.json() as { symbol?: string; query?: string };
    const symbol = body.symbol?.trim() ?? "";
    if (!symbol) return Response.json({ error: "请输入股票代码" }, { status: 400 });
    if (symbol.length > 80) return Response.json({ error: "股票代码或公司名称过长" }, { status: 400 });
    const query = body.query?.trim() ?? "综合研究";
    if (query.length > 2_000) return Response.json({ error: "研究问题不能超过 2000 个字符" }, { status: 400 });
    let report = await runResearch(symbol, query);
    if (ownerId) report = await saveReport(report, ownerId);
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "研究失败" }, { status: 500 });
  }
}
