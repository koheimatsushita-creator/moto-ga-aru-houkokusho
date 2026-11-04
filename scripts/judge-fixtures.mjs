// 架空の組を検査役に通し、結果を fixtures の savedJudgements / savedMeta に保存する。
// 見本モードはこの保存した結果を表示する（見本モードではClaudeを呼ばない）。
// あわせて、正解との突き合わせと1回ごとの実測（秒数・トークン数）を docs/kensho-data/ に残す。
// 使い方: 別の画面で npm run dev を動かしたまま、npm run judge:fixtures（1組だけなら npm run judge:fixtures -- 03）
// 鍵は .dev.vars からサーバーが読む。このスクリプトは鍵を扱わない。
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const base = "http://localhost:3000";
const dir = new URL("../fixtures/", import.meta.url);
const outDir = new URL("../docs/kensho-data/", import.meta.url);
const only = process.argv[2];
const files = readdirSync(dir)
  .filter((f) => /^case-\d+\.json$/.test(f))
  .filter((f) => !only || f === `case-${only}.json`)
  .sort();

const runs = [];
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
  const wallSeconds = (Date.now() - started) / 1000;
  if (!res.ok) {
    console.log(`NG ${file}: ${res.status} ${body.code ?? ""} ${body.message ?? ""} ${body.detail ?? ""}`);
    runs.push({ case: c.id, ok: false, status: res.status, detail: body.detail ?? body.code, usage: body.usage, wallSeconds });
    if (body.code === "no_key") process.exit(1);
    continue;
  }
  c.savedJudgements = body.judgements;
  c.savedMeta = body.meta;
  writeFileSync(url, JSON.stringify(c, null, 2) + "\n");

  const mismatches = [];
  for (const e of c.expected) {
    const j = body.judgements.find((x) => x.sentenceId === e.sentenceId);
    if (j?.verdict !== e.verdict) {
      mismatches.push({ sentenceId: e.sentenceId, expected: e.verdict, got: j?.verdict ?? "（無し）", reason: j?.reason ?? "", machineNote: j?.machineNote });
    }
  }
  const agree = c.expected.length - mismatches.length;
  runs.push({ case: c.id, ok: true, agree, total: c.expected.length, mismatches, usage: body.usage, wallSeconds, meta: body.meta });
  console.log(
    `${file}: 保存しました（${wallSeconds.toFixed(1)}秒、入力${body.usage.inputTokens}・出力${body.usage.outputTokens}トークン、正解と同じ判定 ${agree}/${c.expected.length}）`,
  );
  for (const m of mismatches) console.log(`  ${m.sentenceId}: 正解=${m.expected} 検査役=${m.got}`);
}

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`judge-run-${stamp}.json`, outDir), JSON.stringify(runs, null, 2) + "\n");
console.log(`実測を docs/kensho-data/judge-run-${stamp}.json に保存しました`);
