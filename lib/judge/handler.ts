// POST /api/judge の中身。AIの呼び出しは外から渡す（試験ではAIを呼ばずに確かめるため）。
// 断る順番が大事：AIに届く前に断る物（400・403・413・422・429・503）は、1日の回数を確保する前にすべて済ませる。
// 確保した後は、AIに届いた後の失敗（打ち切り・途中切れ・形の不一致など）も回数に数える（AI代が掛かるため）。
import { findPii, piiMessage, type PiiHit } from "../pii.ts";
import { checkMinute, reserveDaily, type CountStore, type RateLimiter } from "../limits.ts";
import { splitSentences } from "../split.ts";
import { RUN_MODE_CLOSED_MESSAGE } from "../runMode.ts";
import { matchSample, type SavedSample } from "../samples.ts";
import { INPUT_LIMITS, judgeRequestSchema, type JudgeRequest } from "./schema.ts";

export const FAILURE_MESSAGE = "照合できませんでした。入力を短くするか、見本モードをお試しください。AIに届いた後の失敗のため、この回も実行回数に数えます。";

export type JudgeBindings = { ANTHROPIC_API_KEY?: string; JUDGE_RATE_LIMITER?: RateLimiter; JUDGE_COUNTS?: CountStore; RUN_MODE?: string };
export type JudgeFn = (apiKey: string, records: JudgeRequest["records"], draft: string) => Promise<unknown>;

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

export async function handleJudge(
  request: Request,
  deps: {
    env: JudgeBindings;
    production: boolean;
    runModeOpen: boolean;
    samples: SavedSample[]; // 閉じている時に照らし合わせる見本（保存済みの判定つき）
    judge: JudgeFn;
    now?: Date;
    log?: (msg: string, data?: unknown) => void;
  },
): Promise<Response> {
  const log = deps.log ?? ((msg, data) => console.error(msg, data ?? ""));

  // よそのサイトから訪問者のブラウザを使って叩かれないように
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(403, { code: "forbidden", message: "この形の送信は受け付けていません。" });
  }
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || (site && site !== "same-origin")) {
    return reply(403, { code: "forbidden", message: "この画面以外からの送信は受け付けていません。" });
  }

  // 本文の大きさ：JSONを読む前に見る
  const tooLarge = () => reply(413, { code: "too_large", message: "入力が大きすぎます。訪問記録と下書きを短くしてください。" });
  if (Number(request.headers.get("content-length") ?? 0) > INPUT_LIMITS.bodyBytes) return tooLarge();
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > INPUT_LIMITS.bodyBytes) return tooLarge();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply(400, { code: "bad_input", message: "入力の形が正しく読み取れませんでした。" });
  }
  const parsed = judgeRequestSchema.safeParse(json);
  if (!parsed.success) {
    return reply(400, { code: "bad_input", message: "入力の形が正しく読み取れませんでした（記録の番号・日付・職種・行の長さを確かめてください）。" });
  }
  const { records, draft } = parsed.data;

  // 実行モードが閉じている時：見本の文と同じなら保存済みの判定を返し、違えば止める。
  // どちらも、鍵・回数の仕組み（KV・1分の上限）に触れず、AIも呼ばない
  if (!deps.runModeOpen) {
    const sample = matchSample(records, draft, deps.samples);
    if (sample) return reply(200, { judgements: sample.savedJudgements, meta: sample.savedMeta, source: "saved", sampleId: sample.id });
    return reply(503, { code: "run_mode_closed", message: RUN_MODE_CLOSED_MESSAGE });
  }

  const recordChars = records.reduce((n, r) => n + r.lines.join("").length, 0);
  if (recordChars + draft.length > INPUT_LIMITS.totalChars) {
    return reply(413, { code: "too_long", message: `訪問記録と下書きは合わせて${INPUT_LIMITS.totalChars.toLocaleString()}字までです。` });
  }
  if (splitSentences(draft).length > INPUT_LIMITS.sentences) {
    return reply(413, { code: "too_many_sentences", message: `下書きは${INPUT_LIMITS.sentences}文までです。` });
  }

  // サーバー側の検査：全部の欄を見る。画面での検査をすり抜けた入力もここで止める
  const found: string[] = [];
  const check = (hits: PiiHit[], where: string) => hits.length && found.push(piiMessage(hits, where));
  for (const r of records) check(findPii([r.date, r.staffRole, ...r.lines].join("\n")), `訪問記録 ${r.id}`);
  check(findPii(draft), "下書き");
  if (found.length) return reply(422, { code: "pii", message: found.join(" ") });

  const apiKey = deps.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 鍵が無い手元でも、見本の文なら保存済みの判定で試せるようにする（AIはどのみち呼べない）
    const sample = matchSample(records, draft, deps.samples);
    if (sample) return reply(200, { judgements: sample.savedJudgements, meta: sample.savedMeta, source: "saved", sampleId: sample.id });
    return reply(503, { code: "no_key", message: "実行モードはまだ使えません（照合に使う鍵がサーバーに設定されていません）。見本モードは使えます。" });
  }

  // 回数の上限：公開した物では必ず掛ける。仕組みが欠けていたらAIを呼ばずに止める
  if (deps.production) {
    const limiter = deps.env.JUDGE_RATE_LIMITER;
    const store = deps.env.JUDGE_COUNTS;
    if (!limiter || !store) {
      log("judge limits unavailable", { limiter: Boolean(limiter), store: Boolean(store) });
      return reply(503, { code: "limits_unavailable", message: "実行モードはいま使えません（回数の上限の仕組みが準備できていません）。見本モードは使えます。" });
    }
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const minute = await checkMinute(limiter, ip);
    if (!minute.ok) return reply(429, { code: minute.code, message: minute.message });
    const daily = await reserveDaily(store, deps.now ?? new Date()); // ここで1回分を数える
    if (!daily.ok) return reply(429, { code: daily.code, message: daily.message });
  }

  try {
    const result = await deps.judge(apiKey, records, draft);
    return reply(200, { ...(result as Record<string, unknown>), source: "live" });
  } catch (error) {
    // 中身（失敗の理由・トークン数）はログだけに残し、返事には入れない
    const e = error as { message?: string; usage?: unknown };
    log("judge failed", { detail: e?.message ?? "予期しないエラー", usage: e?.usage });
    return reply(502, { code: "judge_failed", message: FAILURE_MESSAGE });
  }
}
