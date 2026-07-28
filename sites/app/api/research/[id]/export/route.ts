import { getReport } from "@/lib/database";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function markdownToHtml(markdown: string): string {
  return markdown.split("\n").map((line) => {
    if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith("> ")) return `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`;
    if (line.startsWith("- ")) return `<p class="bullet">• ${escapeHtml(line.slice(2))}</p>`;
    if (/^\d+\. /.test(line)) return `<p>${escapeHtml(line)}</p>`;
    if (line.startsWith("|")) return `<pre>${escapeHtml(line)}</pre>`;
    return line ? `<p>${escapeHtml(line)}</p>` : "";
  }).join("\n");
}

function documentHtml(title: string, markdown: string, print = false): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  body{font-family:Arial,"Microsoft YaHei",sans-serif;max-width:860px;margin:40px auto;padding:0 28px;color:#172033;line-height:1.7}h1{font-size:30px}h2{margin-top:32px;border-bottom:1px solid #d9e1ec;padding-bottom:8px}blockquote{background:#f2f6fa;border-left:4px solid #0f766e;padding:12px 16px}pre{white-space:pre-wrap}.bullet{margin:4px 0}@media print{body{margin:0;max-width:none}}
  </style></head><body>${markdownToHtml(markdown)}${print ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}</body></html>`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) return Response.json({ error: "报告不存在" }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") ?? "html";
  const safeName = report.symbol.replace(/[^a-zA-Z0-9.-]/g, "-");
  if (format === "md") {
    return new Response(report.contentMd, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}-research.md"` } });
  }
  const print = format === "pdf";
  const html = documentHtml(report.title, report.contentMd, print);
  if (format === "doc") {
    return new Response(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}-research.doc"` } });
  }
  return new Response(html, { headers: print ? { "Content-Type": "text/html; charset=utf-8" } : { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}-research.html"` } });
}
