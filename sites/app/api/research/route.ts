import { listGroups, listReports, saveReport } from "@/lib/database";
import { runResearch } from "@/lib/research";

export async function GET(request: Request) {
  try {
    const groupId = new URL(request.url).searchParams.get("group");
    return groupId
      ? Response.json({ reports: await listReports(groupId) })
      : Response.json({ groups: await listGroups() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "历史加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { symbol?: string; query?: string };
    const symbol = body.symbol?.trim() ?? "";
    if (!symbol) return Response.json({ error: "请输入股票代码" }, { status: 400 });
    if (symbol.length > 80) return Response.json({ error: "股票代码或公司名称过长" }, { status: 400 });
    const query = body.query?.trim() ?? "综合研究";
    if (query.length > 2_000) return Response.json({ error: "研究问题不能超过 2000 个字符" }, { status: 400 });
    const report = await runResearch(symbol, query);
    await saveReport(report);
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "研究失败" }, { status: 500 });
  }
}
