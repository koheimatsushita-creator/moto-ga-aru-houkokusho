// 回数の上限の判定を、作り物の保存先と1分の上限で確かめる（APIもCloudflareも呼ばない）。
// 使い方: npm run check:limits
import { DAILY_LIMIT, checkLimits, countSuccess, jstDate } from "../lib/limits.ts";

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
function fakeLimiter(clock) {
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

// 1. 1日30回：成功を30回数えたら、31回目は止まる
{
  const store = fakeStore();
  const now = new Date("2026-11-05T03:00:00Z"); // 日本時間 11/5 12:00
  let passed = 0;
  for (let i = 1; i <= DAILY_LIMIT + 1; i++) {
    const r = await checkLimits({ ip: `10.0.0.${i}`, now, store });
    if (r.ok) {
      passed++;
      await countSuccess({ now, store });
    } else {
      expect(i === DAILY_LIMIT + 1 && r.code === "rate_limited_daily", `${i}回目で1日の上限に止まる（${r.message}）`);
    }
  }
  expect(passed === DAILY_LIMIT, `1日に通ったのは${passed}回（期待 ${DAILY_LIMIT}回）`);
}

// 2. 失敗した回は数えない：29回成功＋失敗10回のあとでも、30回目は通る
{
  const store = fakeStore();
  const now = new Date("2026-11-05T03:00:00Z");
  for (let i = 0; i < 29; i++) await countSuccess({ now, store });
  for (let i = 0; i < 10; i++) expect((await checkLimits({ ip: "x", now, store })).ok, `失敗の${i + 1}回目：確かめるだけでは数えない`);
  expect((await checkLimits({ ip: "x", now, store })).ok, "29回成功＋失敗10回のあと、30回目は通る");
  await countSuccess({ now, store });
  expect(!(await checkLimits({ ip: "x", now, store })).ok, "30回成功したら止まる");
}

// 3. 日本時間で日付が変わると戻る（UTCの15時が日本時間の0時）
{
  const store = fakeStore();
  const before = new Date("2026-11-05T14:59:00Z"); // 日本時間 11/5 23:59
  const after = new Date("2026-11-05T15:00:00Z"); // 日本時間 11/6 0:00
  expect(jstDate(before) === "2026-11-05" && jstDate(after) === "2026-11-06", `日本時間の日付：${jstDate(before)} → ${jstDate(after)}`);
  for (let i = 0; i < DAILY_LIMIT; i++) await countSuccess({ now: before, store });
  expect(!(await checkLimits({ ip: "x", now: before, store })).ok, "11/5 23:59 は上限で止まる");
  expect((await checkLimits({ ip: "x", now: after, store })).ok, "11/6 0:00 になると通る");
}

// 4. 同じ接続元から1分3回：4回目は止まり、別の接続元は通る。1分たつと通る
{
  const clock = { now: 0 };
  const limiter = fakeLimiter(clock);
  const now = new Date("2026-11-05T03:00:00Z");
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await checkLimits({ ip: "192.0.2.1", now, limiter }));
  expect(results.slice(0, 3).every((r) => r.ok), "同じ接続元の1〜3回目は通る");
  expect(!results[3].ok && results[3].code === "rate_limited_minute", `4回目は1分の上限で止まる（${results[3].message}）`);
  expect((await checkLimits({ ip: "192.0.2.2", now, limiter })).ok, "別の接続元は通る");
  clock.now = 61_000;
  expect((await checkLimits({ ip: "192.0.2.1", now, limiter })).ok, "1分たつと同じ接続元も通る");
}

// 5. 仕組みが無い時（手元）は上限を掛けない
expect((await checkLimits({ ip: "x", now: new Date() })).ok, "保存先も1分の上限も無い時は通る");

console.log(problems ? `問題 ${problems} 件` : "上限の判定はすべて期待どおり");
process.exit(problems ? 1 : 0);
