import { getCloudflareContext } from "@opennextjs/cloudflare";
import { findPii, piiMessage } from "@/lib/pii";
import { JudgeFailure, runJudge } from "@/lib/judge/run";
import { judgeRequestSchema } from "@/lib/judge/schema";
import { checkLimits, countSuccess, type CountStore, type RateLimiter } from "@/lib/limits";

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
  const bindings = env as { ANTHROPIC_API_KEY?: string; JUDGE_RATE_LIMITER?: RateLimiter; JUDGE_COUNTS?: CountStore };
  const apiKey = bindings.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return reply(503, {
      code: "no_key",
      message: "実行モードはまだ使えません（照合に使う鍵がサーバーに設定されていません）。見本モードは使えます。",
    });
  }

  // 回数の上限は公開した物（本番の書き出し）にだけ掛ける。手元の npm run dev では掛けない（見本の判定の保存や揺れの測定で続けて呼ぶため）
  const limited = process.env.NODE_ENV === "production";
  const limiter = limited ? bindings.JUDGE_RATE_LIMITER : undefined;
  const store = limited ? bindings.JUDGE_COUNTS : undefined;
  const now = new Date();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const limit = await checkLimits({ ip, now, limiter, store });
  if (!limit.ok) return reply(429, { code: limit.code, message: limit.message });

  try {
    const result = await runJudge(apiKey, records, draft);
    await countSuccess({ now, store });
    return reply(200, result);
  } catch (error) {
    const detail = error instanceof JudgeFailure ? error.message : "予期しないエラー";
    const usage = error instanceof JudgeFailure ? error.usage : undefined;
    console.error("judge failed:", detail);
    return reply(502, { code: "judge_failed", message: FAILURE, detail, usage });
  }
}
