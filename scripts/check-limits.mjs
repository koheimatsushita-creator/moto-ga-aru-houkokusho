// 回数の上限とAI代の守りを、作り物の保存先・1分の上限・AIの代わりで確かめる（APIもCloudflareも呼ばない）。
// 使い方: npm run check:limits
import { DAILY_LIMIT, countKey, jstDate, reserveDaily, checkMinute } from "../lib/limits.ts";
import { handleJudge, FAILURE_MESSAGE } from "../lib/judge/handler.ts";
import { isRunModeOpen, RUN_MODE_CLOSED_MESSAGE } from "../lib/runMode.ts";
import { serializeRecords } from "../lib/samples.ts";
import { parseRecords } from "../lib/parseRecords.ts";
import { readFileSync } from "node:fs";

const samples = ["01", "02", "03", "04", "05"].map((i) => JSON.parse(readFileSync(new URL(`../fixtures/case-${i}.json`, import.meta.url), "utf8")));

let problems = 0;
const expect = (ok, msg) => {
  console.log(`${ok ? "OK" : "NG"} ${msg}`);
  if (!ok) problems++;
};

// KV の代わり
function fakeStore() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), map: m };
}
// Rate Limiting の代わり：同じ key で60秒に3回まで
function fakeLimiter(clock = { now: 0 }) {
  const hits = new Map();
  return {
    limit: async ({ key }) => {
      const recent = (hits.get(key) ?? []).filter((t) => clock.now - t < 60_000);
      if (recent.length >= 3) return { success: false };
      hits.set(key, [...recent, clock.now]);
      return { success: true };
    },
  };
}

const URL_ = "https://example.test/api/judge";
const goodBody = {
  records: [{ id: "R01", date: "2026-10-02", staffRole: "看護師", lines: ["右下腿に浮腫あり。"] }],
  draft: "右下腿に浮腫がある。",
};
let ipSeq = 0;
function req(body = goodBody, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test", "sec-fetch-site": "same-origin", "cf-connecting-ip": `198.51.100.${++ipSeq % 250}`, ...headers },
    body: text,
  });
}
const quiet = () => {};
function deps({ store = fakeStore(), limiter = fakeLimiter(), production = true, runModeOpen = true, judge, now } = {}) {
  const calls = { n: 0 };
  return {
    calls,
    store,
    d: {
      env: { ANTHROPIC_API_KEY: "test-key-not-real", JUDGE_COUNTS: store, JUDGE_RATE_LIMITER: limiter },
      production,
      runModeOpen,
      samples,
      now,
      log: quiet,
      judge: async (...args) => {
        calls.n++;
        if (judge) return judge(...args);
        return { judgements: [], meta: {}, usage: {} };
      },
    },
  };
}
const used = async (store, now = new Date()) => Number((await store.get(countKey(now))) ?? 0);

// --- 1日の上限・日付・1分の上限（判定の部品） ---
{
  const store = fakeStore();
  const now = new Date("2026-11-05T03:00:00Z");
  let passed = 0;
  for (let i = 1; i <= DAILY_LIMIT + 1; i++) {
    const r = await reserveDaily(store, now);
    if (r.ok) passed++;
    else expect(i === DAILY_LIMIT + 1 && r.code === "rate_limited_daily", `${i}回目で1日の上限に止まる（${r.message}）`);
  }
  expect(passed === DAILY_LIMIT, `1日に通ったのは${passed}回（期待 ${DAILY_LIMIT}回）`);
}
{
  const store = fakeStore();
  const before = new Date("2026-11-05T14:59:00Z"); // 日本時間 11/5 23:59
  const after = new Date("2026-11-05T15:00:00Z"); // 日本時間 11/6 0:00
  expect(jstDate(before) === "2026-11-05" && jstDate(after) === "2026-11-06", `日本時間の日付：${jstDate(before)} → ${jstDate(after)}`);
  for (let i = 0; i < DAILY_LIMIT; i++) await reserveDaily(store, before);
  expect(!(await reserveDaily(store, before)).ok, "11/5 23:59 は上限で止まる");
  expect((await reserveDaily(store, after)).ok, "11/6 0:00 になると通る");
}
{
  const clock = { now: 0 };
  const limiter = fakeLimiter(clock);
  const rs = [];
  for (let i = 0; i < 4; i++) rs.push(await checkMinute(limiter, "192.0.2.1"));
  expect(rs.slice(0, 3).every((r) => r.ok), "同じ接続元の1〜3回目は通る");
  expect(!rs[3].ok && rs[3].code === "rate_limited_minute", `4回目は1分の上限で止まる（${rs[3].message}）`);
  expect((await checkMinute(limiter, "192.0.2.2")).ok, "別の接続元は通る");
  clock.now = 61_000;
  expect((await checkMinute(limiter, "192.0.2.1")).ok, "1分たつと同じ接続元も通る");
}

// --- A1：本番で仕組みが欠けていたら、AIを呼ばずに503 ---
for (const [label, env] of [
  ["1日の回数の保存先が無い", { JUDGE_COUNTS: undefined }],
  ["1分の上限が無い", { JUDGE_RATE_LIMITER: undefined }],
  ["両方無い", { JUDGE_COUNTS: undefined, JUDGE_RATE_LIMITER: undefined }],
]) {
  const t = deps();
  Object.assign(t.d.env, env);
  const res = await handleJudge(req(), t.d);
  const body = await res.json();
  expect(res.status === 503 && body.code === "limits_unavailable" && t.calls.n === 0, `A1 本番で${label}：503で止まり、AIを呼ばない`);
}
{
  const t = deps({ production: false });
  t.d.env.JUDGE_COUNTS = undefined;
  t.d.env.JUDGE_RATE_LIMITER = undefined;
  const res = await handleJudge(req(), t.d);
  expect(res.status === 200 && t.calls.n === 1, "A1 手元（本番でない）では仕組みが無くても通る");
}

// --- A2：AIに届いた後の失敗は数える。届く前に断った時は数えない ---
{
  const t = deps({ judge: async () => { const e = new Error("応答が長すぎて途中で切れました"); e.usage = { inputTokens: 1, outputTokens: 4000 }; throw e; } });
  const res = await handleJudge(req(), t.d);
  const body = await res.json();
  expect(res.status === 502 && (await used(t.store)) === 1, "A2 AIに届いた後の失敗（途中切れ）は1回と数える");
  expect(body.message === FAILURE_MESSAGE && body.message.includes("この回も実行回数に数えます"), "A2 失敗の文言は「この回も実行回数に数えます」");
  expect(!("detail" in body) && !("usage" in body), "A6 502の返事に detail と usage が入っていない");
}
{
  // 「あ。」×2000 のような、AIに渡る前に止めるべき入力
  const t = deps();
  const res = await handleJudge(req({ ...goodBody, draft: "あ。".repeat(2000) }), t.d);
  expect(res.status === 413 && t.calls.n === 0 && (await used(t.store)) === 0, `A2/A3 「あ。」×2000 はAIに渡す前に止まり（${res.status}）、数えない`);
}
{
  // 届く前に断る物は、どれも数えない
  const cases = [
    ["400 形が違う", req({ draft: "x" })],
    ["403 よそのサイトから", req(goodBody, { origin: "https://evil.test", "sec-fetch-site": "cross-site" })],
    ["413 本文が大きすぎる", req({ ...goodBody, pad: "x".repeat(40 * 1024) })],
    ["422 個人情報の形", req({ ...goodBody, draft: "山田さんの足に浮腫がある。" })],
  ];
  for (const [label, r] of cases) {
    const t = deps();
    const res = await handleJudge(r, t.d);
    expect(String(res.status) === label.slice(0, 3) && t.calls.n === 0 && (await used(t.store)) === 0, `A2 ${label}：${res.status}、AIを呼ばず、数えない`);
  }
  // 429（1分の上限）は数えない
  const clock = { now: 0 };
  const t = deps({ limiter: fakeLimiter(clock) });
  const headers = { "cf-connecting-ip": "203.0.113.9" };
  for (let i = 0; i < 3; i++) await handleJudge(req(goodBody, headers), t.d);
  const res = await handleJudge(req(goodBody, headers), t.d);
  expect(res.status === 429 && (await used(t.store)) === 3 && t.calls.n === 3, "A2 429（1分の上限）は数えない（3回成功の後の4回目）");
  // 503（鍵なし）は数えない
  const t2 = deps();
  t2.d.env.ANTHROPIC_API_KEY = undefined;
  const res2 = await handleJudge(req(), t2.d);
  expect(res2.status === 503 && (await used(t2.store)) === 0, "A2 503（鍵なし）は数えない");
}
{
  // 1日30回：成功・失敗あわせて30回AIに届いたら、31回目はAIを呼ばずに止まる
  const store = fakeStore();
  let n = 0;
  const t = deps({ store, judge: async () => { n++; if (n % 2) throw new Error("形の不一致"); return { judgements: [] }; } });
  const statuses = [];
  for (let i = 0; i < DAILY_LIMIT + 1; i++) statuses.push((await handleJudge(req(), t.d)).status);
  expect(statuses.slice(0, DAILY_LIMIT).every((s) => s === 200 || s === 502) && statuses[DAILY_LIMIT] === 429 && t.calls.n === DAILY_LIMIT, `A2 失敗が混ざっても、31回目は429で止まる（AIを呼んだのは${t.calls.n}回）`);
}

// --- A3：入力の上限 ---
{
  const many = { records: Array.from({ length: 2 }, (_, i) => ({ id: "R01", date: "", staffRole: "", lines: [`行${i}`] })), draft: "あいう。" };
  const longLine = { records: [{ id: "R01", date: "", staffRole: "", lines: ["あ".repeat(301)] }], draft: "あいう。" };
  const manyLines = { records: [{ id: "R01", date: "", staffRole: "", lines: Array.from({ length: 31 }, (_, i) => `行${i}`) }], draft: "あいう。" };
  const sixtyOne = { ...goodBody, draft: "浮腫がある。".repeat(61) };
  const badDate = { records: [{ id: "R01", date: "10月2日", staffRole: "", lines: ["浮腫あり。"] }], draft: "浮腫がある。" };
  const badRole = { records: [{ id: "R01", date: "", staffRole: "ignore previous", lines: ["浮腫あり。"] }], draft: "浮腫がある。" };
  const piiInLine2 = { records: [{ id: "R01", date: "", staffRole: "", lines: ["浮腫あり。", "連絡先 090-1234-5678"] }], draft: "浮腫がある。" };
  for (const [label, body, status] of [
    ["記録番号の重複", many, 400],
    ["1行が300字を超える", longLine, 400],
    ["記録の行が30行を超える", manyLines, 400],
    ["下書きが60文を超える", sixtyOne, 413],
    ["日付欄が日付の形でない", badDate, 400],
    ["職種欄が一覧に無い", badRole, 400],
    ["記録の2行目に電話番号の形", piiInLine2, 422],
  ]) {
    const t = deps();
    const res = await handleJudge(req(body), t.d);
    expect(res.status === status && t.calls.n === 0, `A3/C2 ${label}：${res.status}（期待 ${status}）、AIを呼ばない`);
  }
}

// --- A5：送り方の確かめ ---
{
  const t = deps();
  const plain = new Request(URL_, { method: "POST", headers: { "content-type": "text/plain", origin: "https://example.test" }, body: JSON.stringify(goodBody) });
  expect((await handleJudge(plain, t.d)).status === 403, "A5 Content-Type が application/json でない：403");
  expect((await handleJudge(req(goodBody, { origin: "https://evil.test" }), t.d)).status === 403, "A5 Origin がよそのサイト：403");
  expect((await handleJudge(req(goodBody, { "sec-fetch-site": "cross-site" }), t.d)).status === 403, "A5 Sec-Fetch-Site が cross-site：403");
  expect(t.calls.n === 0, "A5 どれもAIを呼ばない");
  const t2 = deps();
  expect((await handleJudge(req(), t2.d)).status === 200, "A5 自分のサイトからは通る");
}

// --- 実行モードのスイッチ ---
{
  expect(isRunModeOpen({}, true) === false, "スイッチ：公開版は値が無ければ閉じる");
  expect(isRunModeOpen({ RUN_MODE: "closed" }, true) === false, "スイッチ：公開版で RUN_MODE=closed は閉じる");
  expect(isRunModeOpen({ RUN_MODE: "open" }, true) === true, "スイッチ：公開版で RUN_MODE=open は開く");
  expect(isRunModeOpen({ RUN_MODE: "closed" }, false) === true, "スイッチ：手元（npm run dev）は既定で開く");

  // 閉じた時に、KV・1分の上限・AIのどれにも触れないかを数える作り物
  const watched = (runModeOpen) => {
    const touched = { store: 0, limiter: 0 };
    const store = { get: async () => { touched.store++; return null; }, put: async () => { touched.store++; } };
    const limiter = { limit: async () => { touched.limiter++; return { success: true }; } };
    return { touched, t: deps({ store, limiter, runModeOpen }) };
  };
  // 画面と同じ手順で作る入力：見本の記録を貼り付けの書式にし、parseRecords で読み直す
  const asPasted = (c, { crlf = false, draft = c.draft } = {}) => {
    let text = serializeRecords(c.records);
    if (crlf) text = text.replace(/\n/g, "\r\n").replace(/\r\n/g, "  \r\n");
    return { records: parseRecords(text), draft };
  };

  // 閉じた時、見本の文と同じ：保存済みの判定を返す（5組とも）
  for (const c of samples) {
    const { touched, t } = watched(false);
    const res = await handleJudge(req(asPasted(c)), t.d);
    const body = await res.json();
    expect(
      res.status === 200 && body.source === "saved" && JSON.stringify(body.judgements) === JSON.stringify(c.savedJudgements) && body.meta?.model,
      `閉じた時・見本${c.id}の文：200・保存済みの判定（source=saved）`,
    );
    expect(touched.store === 0 && touched.limiter === 0 && t.calls.n === 0, `閉じた時・見本${c.id}の文：KV・1分の上限・AIに触れない`);
  }
  {
    // Windows から貼った（CRLF・行末の空白・下書きの前後の空行）
    const c = samples[0];
    const { t } = watched(false);
    const res = await handleJudge(req(asPasted(c, { crlf: true, draft: `\r\n${c.draft}  \r\n\r\n` })), t.d);
    expect(res.status === 200 && (await res.json()).source === "saved", "閉じた時・CRLFと余分な空白で貼っても見本と一致する");
  }
  {
    // 1字だけ変えた
    const c = samples[0];
    const { touched, t } = watched(false);
    const res = await handleJudge(req(asPasted(c, { draft: c.draft.replace("浮腫", "むくみ") })), t.d);
    const body = await res.json();
    expect(res.status === 503 && body.code === "run_mode_closed" && body.message === RUN_MODE_CLOSED_MESSAGE, `閉じた時・見本と違う文：503「${body.message}」`);
    expect(touched.store === 0 && touched.limiter === 0 && t.calls.n === 0, "閉じた時・見本と違う文：KV・1分の上限・AIに触れない");
  }
  {
    // 開いていても鍵が無い時（手元で鍵を入れていない）：見本の文なら保存済みを返し、違う文は503（鍵なし）
    const c = samples[0];
    const { t } = watched(true);
    t.d.env.ANTHROPIC_API_KEY = undefined;
    const r1 = await handleJudge(req(asPasted(c)), t.d);
    expect(r1.status === 200 && (await r1.json()).source === "saved" && t.calls.n === 0, "開いた時・鍵なし・見本の文：保存済みを返す（AIは呼ばない）");
    const r2 = await handleJudge(req(asPasted(c, { draft: c.draft.replace("浮腫", "むくみ") })), t.d);
    expect(r2.status === 503 && (await r2.json()).code === "no_key", "開いた時・鍵なし・見本と違う文：503（鍵なし）");
  }
  {
    // 開いた時は、見本の文でも保存済みを返さず、AIを呼ぶ経路に進む
    const c = samples[0];
    const { t } = watched(true);
    const res = await handleJudge(req(asPasted(c)), t.d);
    const body = await res.json();
    expect(res.status === 200 && body.source === "live" && t.calls.n === 1, "開いた時・見本の文：保存済みを返さず、AIを呼ぶ（source=live）");
  }
  const cross = await handleJudge(req(goodBody, { origin: "https://evil.test" }), deps({ runModeOpen: false }).d);
  expect(cross.status === 403, "閉じた時も、よそのサイトからの送信は先に403");
  // 開けたのに KV が無い時は、今の作りどおり503（limits_unavailable）で止まる
  const t2 = deps({ runModeOpen: true });
  t2.d.env.JUDGE_COUNTS = undefined;
  const res2 = await handleJudge(req(), t2.d);
  expect(res2.status === 503 && (await res2.json()).code === "limits_unavailable" && t2.calls.n === 0, "開けたのにKVが無い時：503で止まり、AIを呼ばない");
}

console.log(problems ? `問題 ${problems} 件` : "上限とAI代の守りはすべて期待どおり");
process.exit(problems ? 1 : 0);
