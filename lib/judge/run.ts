import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { splitSentences } from "../split";
import type { Judgement, JudgeRunMeta, VisitRecord } from "../types";
import iikae from "../../fixtures/iikae-rei.json";
import { postcheck } from "./postcheck";
import { buildJudgeUserMessage, JUDGE_MODEL, JUDGE_SYSTEM } from "./prompt";
import { judgeOutputSchema } from "./schema";

const EFFORT = "medium";

export class JudgeFailure extends Error {}

// 検査役を1回呼ぶ。1回の呼び出しは60秒以内に収め、再試行はしない（回数と費用を読めるようにするため）。
export async function runJudge(
  apiKey: string,
  records: VisitRecord[],
  draft: string,
): Promise<{ judgements: Judgement[]; meta: JudgeRunMeta }> {
  const sentences = splitSentences(draft);
  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });

  let response;
  try {
    response = await client.messages.parse({
      model: JUDGE_MODEL,
      max_tokens: 4000,
      output_config: { effort: EFFORT, format: zodOutputFormat(judgeOutputSchema) },
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: buildJudgeUserMessage(records, sentences) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new JudgeFailure("APIキーが受け付けられませんでした");
    if (error instanceof Anthropic.RateLimitError) throw new JudgeFailure("呼び出しの上限に達しました");
    if (error instanceof Anthropic.APIError) throw new JudgeFailure(`APIの応答が失敗しました（${error.status ?? "接続"}）`);
    throw error;
  }

  if (response.stop_reason === "refusal") throw new JudgeFailure("検査役が応答を断りました");
  if (response.stop_reason === "max_tokens") throw new JudgeFailure("応答が長すぎて途中で切れました");
  if (!response.parsed_output) throw new JudgeFailure("応答の形が決めた形と合いませんでした");

  return {
    judgements: postcheck(response.parsed_output, sentences, records),
    meta: {
      model: JUDGE_MODEL,
      effort: EFFORT,
      judgedAt: new Date().toISOString(),
      promptNote: `言い換えの例：${iikae.status === "仮" ? "仮の例" : "依頼者の例"}`,
    },
  };
}
