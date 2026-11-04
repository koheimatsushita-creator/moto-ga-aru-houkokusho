// 文ごとの処理と「出す」のガードを、見本5組の保存済み判定で機械的に確かめる（APIは呼ばない）。
// 使い方: npm run check:review
import { readFileSync, readdirSync } from "node:fs";
import { splitSentences } from "../lib/split.ts";
import { actionsFor, finalReport, guard, isRed, judgementFor, needsDecision } from "../lib/review.ts";

const dir = new URL("../fixtures/", import.meta.url);
let problems = 0;
const expect = (ok, msg) => {
  if (!ok) {
    problems++;
    console.log(`  NG ${msg}`);
  }
};

for (const file of readdirSync(dir).filter((f) => /^case-\d+\.json$/.test(f)).sort()) {
  const c = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const sentences = splitSentences(c.draft);
  const judgements = c.savedJudgements.length ? c.savedJudgements : c.expected;
  const js = sentences.map((s) => judgementFor(s.id, judgements));
  const reds = js.filter((j) => isRed(j.verdict));
  const yellows = js.filter((j) => j.verdict === "言い換え");

  // 何も処理していない時は出せない（赤があれば）
  let g = guard(sentences, judgements, {});
  expect(g.canIssue === (reds.length === 0), `${file}: 未処理で出せる状態になっている`);
  expect(g.redPending.length === reds.length, `${file}: 未処理の赤の数が合わない`);

  // 引用が無い文には「戻す」を出さない
  for (const j of js) {
    if (needsDecision(j.verdict) && !j.evidenceQuote) expect(!actionsFor(j).includes("戻す"), `${file} ${j.sentenceId}: 引用が無いのに戻すがある`);
  }

  // 赤を1件だけ残すと出せない
  const decisions = {};
  for (const j of reds.slice(1)) decisions[j.sentenceId] = { sentenceId: j.sentenceId, action: "削る" };
  if (reds.length) expect(!guard(sentences, judgements, decisions).canIssue, `${file}: 赤が1件残っても出せる`);

  // 残りの赤を「確認して残す」・理由なし → 出せない。理由を入れる → 出せる
  if (reds.length) {
    const first = reds[0].sentenceId;
    decisions[first] = { sentenceId: first, action: "残す", reason: "  " };
    g = guard(sentences, judgements, decisions);
    expect(!g.canIssue && g.reasonMissing.includes(first), `${file}: 理由が空でも出せる`);
    decisions[first].reason = "別の記録で確認済み（架空）";
    g = guard(sentences, judgements, decisions);
    expect(g.canIssue, `${file}: 赤をすべて処理しても出せない`);
  }
  expect(g.yellowPending.length === yellows.length, `${file}: 黄の未処理の数が合わない`);

  // 黄を「戻す」にすると、本文はその引用に置き換わる。削った赤は本文から消える
  for (const j of yellows) if (j.evidenceQuote) decisions[j.sentenceId] = { sentenceId: j.sentenceId, action: "戻す" };
  const text = finalReport(sentences, judgements, decisions);
  for (const j of yellows) if (j.evidenceQuote) expect(text.includes(j.evidenceQuote.replace(/\s*\n\s*/g, "").replace(/。$/, "")), `${file} ${j.sentenceId}: 戻した引用が本文に無い`);
  for (const j of reds.slice(1)) expect(!text.includes(sentences.find((s) => s.id === j.sentenceId).text), `${file} ${j.sentenceId}: 削った文が本文に残っている`);
  expect(guard(sentences, judgements, decisions).yellowPending.length === yellows.filter((j) => !j.evidenceQuote).length, `${file}: 黄を処理した後の未処理数が合わない`);

  console.log(`${file}: 文${sentences.length}・赤${reds.length}・黄${yellows.length} 確認済み`);
}

console.log(problems ? `問題 ${problems} 件` : "5組すべて、ガードと処理の結果は期待どおり");
process.exit(problems ? 1 : 0);
