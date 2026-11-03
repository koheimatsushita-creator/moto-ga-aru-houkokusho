import type { VisitRecord } from "./types";

// 実行モードで貼られた訪問記録を、空行で区切って1件ずつに分け、R01 から番号を付ける。
// 各記録の1行目が「2026-10-02 看護師」のような形なら、日付と職種として読む。
export function parseRecords(text: string): VisitRecord[] {
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  return blocks.map((lines, i) => {
    const head = lines[0].match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*(\S{1,20})?$/);
    const body = head && lines.length > 1 ? lines.slice(1) : lines;
    return {
      id: `R${String(i + 1).padStart(2, "0")}`,
      date: head && lines.length > 1 ? head[1] : "",
      staffRole: head && lines.length > 1 ? (head[2] ?? "") : "",
      lines: body,
    };
  });
}
