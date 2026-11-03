// 架空の組を検査役に通し、結果を fixtures の savedJudgements / savedMeta に保存する。
// 見本モードはこの保存した結果を表示する（見本モードではClaudeを呼ばない）。
// 使い方: 別の画面で npm run dev を動かしたまま、npm run judge:fixtures（1組だけなら npm run judge:fixtures -- 03）
// 鍵は .dev.vars からサーバーが読む。このスクリプトは鍵を扱わない。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const base = "http://localhost:3000";
const dir = new URL("../fixtures/", import.meta.url);
const only = process.argv[2];
const files = readdirSync(dir)
  .filter((f) => /^case-\d+\.json$/.test(f))
  .filter((f) => !only || f === `case-${only}.json`)
  .sort();

for (const file of files) {
  const url = new URL(file, dir);
  const c = JSON.parse(readFileSync(url, "utf8"));
  const started = Date.now();
  const res = await fetch(`${base}/api/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: c.records, draft: c.draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`NG ${file}: ${res.status} ${body.code ?? ""} ${body.message ?? ""} ${body.detail ?? ""}`);
    if (body.code === "no_key") process.exit(1);
    continue;
  }
  c.savedJudgements = body.judgements;
  c.savedMeta = body.meta;
  writeFileSync(url, JSON.stringify(c, null, 2) + "\n");

  const agree = body.judgements.filter((j) => c.expected.find((e) => e.sentenceId === j.sentenceId)?.verdict === j.verdict).length;
  console.log(`${file}: 保存しました（${((Date.now() - started) / 1000).toFixed(1)}秒、正解と同じ判定 ${agree}/${c.expected.length}）`);
}
