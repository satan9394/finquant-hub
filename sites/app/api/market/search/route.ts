import { searchSymbols } from "@/lib/market";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return Response.json({ error: "请输入股票代码或公司名称" }, { status: 400 });
  if (query.length > 80) return Response.json({ error: "股票代码或公司名称过长" }, { status: 400 });
  try {
    return Response.json({ results: await searchSymbols(query) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "搜索失败" }, { status: 502 });
  }
}
