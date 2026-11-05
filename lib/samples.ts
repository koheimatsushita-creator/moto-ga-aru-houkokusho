import type { FixtureCase, VisitRecord } from "./types";

// 見本の文と貼られた文の照らし合わせ。公開版（実行モードを閉じている時）は、
// 見本の文と同じ物が貼られた時だけ、保存済みの判定を返す（AIは呼ばない）。

// 貼り付けの書式：記録ごとに「1行目 日付 職種」「本文の行」、記録の間は空行
export function serializeRecords(records: VisitRecord[]): string {
  return records
    .map((r) => {
      const head = [r.date, r.staffRole].filter(Boolean).join(" ");
      return [...(head ? [head] : []), ...r.lines].join("\n");
    })
    .join("\n\n");
}

// 改行（CRLF→LF）、各行の前後の空白、前後の空行を揃える
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const recordKey = (r: Pick<VisitRecord, "id" | "date" | "staffRole" | "lines">) =>
  JSON.stringify([r.id, r.date, r.staffRole, r.lines.map((l) => l.trim()).filter(Boolean)]);

export type SavedSample = Pick<FixtureCase, "id" | "records" | "draft" | "savedJudgements" | "savedMeta">;

// 貼られた記録と下書きが、どれかの見本と同じなら、その見本を返す
export function matchSample(records: VisitRecord[], draft: string, samples: SavedSample[]): SavedSample | null {
  const d = normalizeText(draft);
  const keys = records.map(recordKey).join("\n");
  return (
    samples.find(
      (c) => c.savedJudgements.length > 0 && normalizeText(c.draft) === d && c.records.map(recordKey).join("\n") === keys,
    ) ?? null
  );
}
