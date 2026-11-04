import { z } from "zod";
import { STAFF_ROLES } from "../roles.ts";

// 検査役（Claude）に返させる形。構造化出力で受け取り、zod で検証する。
export const verdictSchema = z.enum(["一致", "言い換え", "根拠なし", "反する"]);

export const judgeOutputSchema = z.object({
  judgements: z.array(
    z.object({
      sentenceId: z.string().describe("文の番号（S01 など）"),
      verdict: verdictSchema,
      evidenceIds: z.array(z.string()).describe("根拠にした記録の番号（R01 など）。根拠なしなら空"),
      evidenceQuote: z.string().describe("根拠の記録から一字一句そのまま写した部分。根拠なしなら空文字"),
      reason: z.string().describe("判定の理由を1文で"),
    }),
  ),
});

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

// サーバーで受ける入力の上限（AI代を守るため、AIを呼ぶ前に止める）
export const INPUT_LIMITS = {
  bodyBytes: 32 * 1024, // 本文の大きさ。JSONを読む前に見る
  totalChars: 4000, // 訪問記録と下書きの合計
  draftChars: 4000, // 下書きだけの上限
  sentences: 60, // 下書きを分けた文の数
  records: 40,
  linesPerRecord: 30,
  lineChars: 300,
} as const;

// POST /api/judge の入力。記録は画面側で R01… の番号を付けてから送る。
// 日付欄は日付の形だけ、職種欄は決めた一覧だけを受ける（どちらも空欄は可）
export const judgeRequestSchema = z.object({
  records: z
    .array(
      z.object({
        id: z.string().regex(/^R\d{2}$/),
        date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
        staffRole: z.union([z.enum(STAFF_ROLES), z.literal("")]),
        lines: z.array(z.string().min(1).max(INPUT_LIMITS.lineChars)).min(1).max(INPUT_LIMITS.linesPerRecord),
      }),
    )
    .min(1)
    .max(INPUT_LIMITS.records)
    .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, { message: "記録番号が重なっています" }),
  draft: z.string().min(1).max(INPUT_LIMITS.draftChars),
});

export type JudgeRequest = z.infer<typeof judgeRequestSchema>;
