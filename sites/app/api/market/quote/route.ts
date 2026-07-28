import { getSnapshot } from "@/lib/market";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return Response.json({ error: "请输入股票代码" }, { status: 400 });
  if (symbol.length > 80) return Response.json({ error: "股票代码或公司名称过长" }, { status: 400 });
  try {
    return Response.json({ snapshot: await getSnapshot(symbol) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "行情查询失败" }, { status: 502 });
  }
}
