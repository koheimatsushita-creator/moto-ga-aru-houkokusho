// 実行モード（POST /api/judge）の回数の上限。見本モードには掛けない。
// - 同じ接続元から1分3回：Workers の Rate Limiting（wrangler.jsonc の ratelimits）
// - 全体で1日30回：KV に日本時間の日付ごとの回数を持つ
// 1日の回数は、AIを呼ぶ前に1回分を確保して数える。AIに届いた後の失敗（打ち切り・途中切れ・形の不一致）も数える。
// 数えないのは、AIに届く前に断った時だけ（確保より前に断るので、戻す処理は要らない）。
// KV は読んでから書くので、同時に来た分は数え漏らすことがある（docs/design.md）。

export const DAILY_LIMIT = 30;
export const PER_MINUTE_LIMIT = 3; // wrangler.jsonc の ratelimits と同じ値にする

export const DAILY_MESSAGE = `本日の実行回数の上限（${DAILY_LIMIT}回）に達しました。見本モードは引き続き使えます。`;
export const MINUTE_MESSAGE = `1分あたりの実行回数の上限（${PER_MINUTE_LIMIT}回）に達しました。少し時間をおいてから、もう一度お試しください。`;

// 使う部分だけの形（Cloudflare の型を足さないため）
export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type CountStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

// 日本時間の日付（YYYY-MM-DD）。日本時間で日付が変わると回数が戻る
export function jstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const countKey = (now: Date) => `judge-count:${jstDate(now)}`;

export type LimitResult = { ok: true } | { ok: false; code: "rate_limited_minute" | "rate_limited_daily"; message: string };

// 同じ接続元から1分の上限
export async function checkMinute(limiter: RateLimiter, ip: string): Promise<LimitResult> {
  const { success } = await limiter.limit({ key: ip });
  return success ? { ok: true } : { ok: false, code: "rate_limited_minute", message: MINUTE_MESSAGE };
}

// 1日の上限：空きがあれば1回分を確保して数える。AIを呼ぶ直前に1度だけ呼ぶ
export async function reserveDaily(store: CountStore, now: Date): Promise<LimitResult> {
  const key = countKey(now);
  const used = Number((await store.get(key)) ?? 0);
  if (used >= DAILY_LIMIT) return { ok: false, code: "rate_limited_daily", message: DAILY_MESSAGE };
  await store.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  return { ok: true };
}
