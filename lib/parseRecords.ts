import { STAFF_ROLES } from "./roles.ts";
import type { VisitRecord } from "./types";

// 実行モードで貼られた訪問記録を、空行で区切って1件ずつに分け、R01 から番号を付ける。
// 各記録の1行目が「2026-10-02 看護師」のような形なら、日付と職種として読む。
// 職種が決めた一覧に無い時は、その行を本文のまま残す（サーバーは一覧の職種だけを受けるため）。
export function parseRecords(text: string): VisitRecord[] {
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  return blocks.map((lines, i) => {
    const id = `R${String(i + 1).padStart(2, "0")}`;
    const head = lines[0].normalize("NFKC").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\S{1,20}))?$/);
    const role = head?.[4] ?? "";
    const roleOk = role === "" || (STAFF_ROLES as readonly string[]).includes(role);
    if (!head || lines.length < 2 || !roleOk) return { id, date: "", staffRole: "", lines };
    return {
      id,
      date: `${head[1]}-${head[2].padStart(2, "0")}-${head[3].padStart(2, "0")}`,
      staffRole: role,
      lines: lines.slice(1),
    };
  });
}
