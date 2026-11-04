// 実行モード（誰でも文を貼ってAIに照合させる）の開け閉め。
// 公開版（本番の書き出し）では wrangler.jsonc の vars の RUN_MODE が "open" の時だけ開く（既定は "closed"）。
// 手元の npm run dev では既定で開く（wrangler.jsonc の vars は手元でも読まれるため、手元では値を見ない）。
// 閉じる理由：誰でも貼れる形は実データが入る可能性があり、認証なしで公開しないため（2026-11-04 オーナー決定）。

export const RUN_MODE_CLOSED_MESSAGE = "公開版では見本だけを動かせます。AIでの照合は、手元で動かした様子を動画で見られます。";

export function isRunModeOpen(env: { RUN_MODE?: string }, production: boolean): boolean {
  return production ? env.RUN_MODE === "open" : true;
}
