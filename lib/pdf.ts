type PdfLine = {
  text: string;
  size: number;
  leading: number;
  gapBefore: number;
  color: string;
};

type PositionedLine = PdfLine & { y: number };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const TOP = 782;
const BOTTOM = 58;
const TEXT_WIDTH = PAGE_WIDTH - LEFT * 2;

function utf16BeHex(value: string): string {
  let output = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0x3f;
    if (codePoint <= 0xffff) {
      output += codePoint.toString(16).padStart(4, "0");
      continue;
    }
    const adjusted = codePoint - 0x10000;
    output += (0xd800 + (adjusted >> 10)).toString(16).padStart(4, "0");
    output += (0xdc00 + (adjusted & 0x3ff)).toString(16).padStart(4, "0");
  }
  return output.toUpperCase();
}

function characterWidth(char: string): number {
  return /^[\x00-\x7f]$/.test(char) ? (/\s/.test(char) ? 0.32 : 0.56) : 1;
}

function wrapText(text: string, maxUnits: number): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (const char of text) {
    const width = characterWidth(char);
    if (current && units + width > maxUnits) {
      lines.push(current.trimEnd());
      current = "";
      units = 0;
    }
    current += char;
    units += width;
  }
  if (current) lines.push(current.trimEnd());
  return lines;
}

function markdownLines(markdown: string): PdfLine[] {
  return markdown.replace(/\r\n?/g, "\n").split("\n").flatMap((rawLine) => {
    const line = rawLine.trimEnd();
    let text = line;
    let size = 10;
    let leading = 14;
    let gapBefore = 2;
    let color = "0.09 0.13 0.20";

    if (line.startsWith("# ")) {
      text = line.slice(2);
      size = 18;
      leading = 24;
      gapBefore = 10;
      color = "0.04 0.29 0.27";
    } else if (line.startsWith("## ")) {
      text = line.slice(3);
      size = 13;
      leading = 19;
      gapBefore = 12;
      color = "0.04 0.29 0.27";
    } else if (line.startsWith("> ")) {
      text = `｜ ${line.slice(2)}`;
      size = 9.5;
      leading = 14;
      gapBefore = 5;
      color = "0.25 0.32 0.39";
    } else if (line.startsWith("- ")) {
      text = `• ${line.slice(2)}`;
    } else if (/^\d+\. /.test(line)) {
      text = line;
    } else if (line.startsWith("|")) {
      size = 8;
      leading = 12;
      color = "0.20 0.27 0.35";
    } else if (!line) {
      return [{ text: "", size, leading: 8, gapBefore: 0, color }];
    }

    const maxUnits = TEXT_WIDTH / size;
    return wrapText(text, maxUnits).map((wrapped, index) => ({
      text: wrapped,
      size,
      leading,
      gapBefore: index === 0 ? gapBefore : 0,
      color,
    }));
  });
}

function paginate(lines: PdfLine[]): PositionedLine[][] {
  const pages: PositionedLine[][] = [[]];
  let y = TOP;

  for (const line of lines) {
    if (y - line.gapBefore - line.leading < BOTTOM) {
      pages.push([]);
      y = TOP;
    }
    y -= line.gapBefore;
    pages.at(-1)!.push({ ...line, y });
    y -= line.leading;
  }
  return pages;
}

function contentStream(lines: PositionedLine[], pageNumber: number, pageCount: number): string {
  const commands = [
    "BT",
    "/F1 8 Tf",
    "0.38 0.44 0.51 rg",
    `1 0 0 1 ${LEFT} 816 Tm <${utf16BeHex("FINQUANT HUB RESEARCH")}> Tj`,
    `1 0 0 1 500 816 Tm <${utf16BeHex(`${pageNumber}/${pageCount}`)}> Tj`,
    "ET",
    `0.86 0.89 0.91 RG ${LEFT} 805 m ${PAGE_WIDTH - LEFT} 805 l S`,
  ];

  for (const line of lines) {
    if (!line.text) continue;
    commands.push(
      "BT",
      `/F1 ${line.size} Tf`,
      `${line.color} rg`,
      `1 0 0 1 ${LEFT} ${line.y} Tm <${utf16BeHex(line.text)}> Tj`,
      "ET",
    );
  }
  return commands.join("\n");
}

function pdfDate(date: Date): string {
  return `D:${date.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
}

export function createResearchPdf(title: string, markdown: string): Uint8Array {
  const pages = paginate(markdownLines(markdown));
  const objects: string[] = [""];
  const addObject = (body = "") => {
    objects.push(body);
    return objects.length - 1;
  };

  const catalogId = addObject();
  const pagesId = addObject();
  const type0FontId = addObject();
  const cidFontId = addObject();
  const descriptorId = addObject();
  const infoId = addObject();
  const pageIds: number[] = [];

  objects[type0FontId] = `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cidFontId} 0 R] >>`;
  objects[cidFontId] = `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 >>`;
  objects[descriptorId] = "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>";
  objects[infoId] = `<< /Title <FEFF${utf16BeHex(title)}> /Producer (FinQuant Hub) /CreationDate (${pdfDate(new Date())}) >>`;

  pages.forEach((page, index) => {
    const stream = contentStream(page, index + 1, pages.length);
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${type0FontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}
