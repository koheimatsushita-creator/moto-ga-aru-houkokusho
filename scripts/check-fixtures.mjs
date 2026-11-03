// fixtures の架空の組を機械で確かめる。
// - 下書きを分割した文の数と、正解の判定の数が同じか
// - 正解の引用が、指定した記録の本文に文字どおりあるか
// - 電話番号・郵便番号の形が紛れていないか
// 使い方: npm run check:fixtures
import { readFileSync, readdirSync } from "node:fs";
import { splitSentences } from "../lib/split.ts";

const dir = new URL("../fixtures/", import.meta.url);
const files = readdirSync(dir).filter((f) => /^case-\d+\.json$/.test(f)).sort();
const phoneLike = /0\d{1,4}-\d{1,4}-\d{3,4}|\d{3}-\d{4}(?!\d)/;
let problems = 0;
const fail = (file, msg) => {
  problems++;
  console.log(`NG ${file}: ${msg}`);
};

for (const file of files) {
  const c = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const sentences = splitSentences(c.draft);
  if (sentences.length !== c.expected.length) {
    fail(file, `文の数 ${sentences.length} と正解の数 ${c.expected.length} が違う`);
  }
  const byId = new Map(c.records.map((r) => [r.id, r.lines.join("\n")]));
  for (const j of c.expected) {
    if (!sentences.some((s) => s.id === j.sentenceId)) fail(file, `${j.sentenceId} が下書きに無い`);
    for (const id of j.evidenceIds) if (!byId.has(id)) fail(file, `${j.sentenceId} の記録番号 ${id} が無い`);
    if (j.evidenceQuote && !j.evidenceIds.some((id) => byId.get(id)?.includes(j.evidenceQuote))) {
      fail(file, `${j.sentenceId} の引用「${j.evidenceQuote}」が記録に無い`);
    }
    if ((j.verdict === "根拠なし") !== (j.evidenceIds.length === 0)) {
      fail(file, `${j.sentenceId} の判定と記録番号の有無が合わない`);
    }
  }
  const all = [c.draft, ...c.records.flatMap((r) => r.lines)].join("\n");
  if (phoneLike.test(all)) fail(file, "電話番号・郵便番号の形がある");
  const counts = {};
  for (const j of c.expected) counts[j.verdict] = (counts[j.verdict] ?? 0) + 1;
  console.log(`${file}: 文${sentences.length} 記録${c.records.length} ${JSON.stringify(counts)}`);
}

console.log(problems ? `問題 ${problems} 件` : `${files.length} 組すべて問題なし`);
process.exit(problems ? 1 : 0);
