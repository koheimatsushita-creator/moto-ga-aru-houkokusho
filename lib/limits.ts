// 実行モード（POST /api/judge）の回数の上限。見本モードには掛けない。
// - 同じ接続元から1分3回：Workers の Rate Limiting（wrangler.jsonc の ratelimits）
// - 全体で1日30回：KV に日本時間の日付ごとの回数を持つ。照合に失敗した回は数えない
// 手元（npm run dev）で仕組みが無い時は、上限を掛けずに通す。

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

const countKey = (now: Date) => `judge-count:${jstDate(now)}`;

export type LimitResult = { ok: true } | { ok: false; code: "rate_limited_minute" | "rate_limited_daily"; message: string };

// 照合を呼ぶ前に確かめる
export async function checkLimits(opts: { ip: string; now: Date; limiter?: RateLimiter; store?: CountStore }): Promise<LimitResult> {
  if (opts.store) {
    const used = Number((await opts.store.get(countKey(opts.now))) ?? 0);
    if (used >= DAILY_LIMIT) return { ok: false, code: "rate_limited_daily", message: DAILY_MESSAGE };
  }
  if (opts.limiter) {
    const { success } = await opts.limiter.limit({ key: opts.ip });
    if (!success) return { ok: false, code: "rate_limited_minute", message: MINUTE_MESSAGE };
  }
  return { ok: true };
}

// 照合に成功した時だけ数える（同時に来た時は数え漏れがありうるが、上限の目安としては足りる）
export async function countSuccess(opts: { now: Date; store?: CountStore }): Promise<void> {
  if (!opts.store) return;
  const key = countKey(opts.now);
  const used = Number((await opts.store.get(key)) ?? 0);
  await opts.store.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
}
