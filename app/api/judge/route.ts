import { getCloudflareContext } from "@opennextjs/cloudflare";
import { findPii, piiMessage } from "@/lib/pii";
import { JudgeFailure, runJudge } from "@/lib/judge/run";
import { judgeRequestSchema } from "@/lib/judge/schema";

const MAX_CHARS = 4000;
const FAILURE = "照合できませんでした。入力を短くするか、見本モードをお試しください。回数には数えません。";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const parsed = judgeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(400, { code: "bad_input", message: "入力の形が正しく読み取れませんでした。" });
  const { records, draft } = parsed.data;

  const recordText = records.map((r) => r.lines.join("\n")).join("\n");
  if (recordText.length + draft.length > MAX_CHARS) {
    return reply(413, { code: "too_long", message: `訪問記録と下書きは合わせて${MAX_CHARS.toLocaleString()}字までです。` });
  }

  // サーバー側の検査：画面での検査をすり抜けた入力もここで止める
  const recordHits = findPii(recordText);
  const draftHits = findPii(draft);
  if (recordHits.length || draftHits.length) {
    const message = [recordHits.length && piiMessage(recordHits, "訪問記録"), draftHits.length && piiMessage(draftHits, "下書き")]
      .filter(Boolean)
      .join(" ");
    return reply(422, { code: "pii", message });
  }

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = (env as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY;
  if (!apiKey) {
    return reply(503, {
      code: "no_key",
      message: "実行モードはまだ使えません（照合に使う鍵がサーバーに設定されていません）。見本モードは使えます。",
    });
  }

  try {
    const result = await runJudge(apiKey, records, draft);
    return reply(200, result);
  } catch (error) {
    const detail = error instanceof JudgeFailure ? error.message : "予期しないエラー";
    console.error("judge failed:", detail);
    return reply(502, { code: "judge_failed", message: FAILURE, detail });
  }
}
