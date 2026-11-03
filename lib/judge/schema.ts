import { z } from "zod";

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

// POST /api/judge の入力。記録は画面側で R01… の番号を付けてから送る。
export const judgeRequestSchema = z.object({
  records: z
    .array(
      z.object({
        id: z.string().regex(/^R\d{2}$/),
        date: z.string().max(20),
        staffRole: z.string().max(20),
        lines: z.array(z.string()).min(1),
      }),
    )
    .min(1)
    .max(40),
  draft: z.string().min(1),
});

export type JudgeRequest = z.infer<typeof judgeRequestSchema>;
