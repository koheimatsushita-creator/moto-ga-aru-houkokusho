// 見ていない架空の組（fixtures-holdout/）を、検査役に通す前に機械で確かめる（APIは呼ばない）。
// この組は検査役への指示（lib/judge/prompt.ts）を作る時に一度も見ていない。画面には出さない。
// - 下書きを分割した文の数・番号と、正解の判定の数・番号が合うか
// - 正解の記録番号が存在し、引用が指定した記録の本文に文字どおりあるか
// - 根拠なし ⇔ 記録番号が空、の対応
// - 個人情報の形の検査（lib/pii.ts）に引っかからないか、利用者の呼び名が「利用者A」〜「利用者E」か
// - サーバーが受ける入力の形と上限（lib/judge/schema.ts）に収まるか
// - 見本の5組（fixtures/）と同じ文が無いか
// 最後に、4種類の数と【境目】の文の割合を出す。
// 使い方: npm run check:holdout
import { readFileSync, readdirSync } from "node:fs";
import { splitSentences } from "../lib/split.ts";
import { findPii } from "../lib/pii.ts";
import { judgeRequestSchema, INPUT_LIMITS } from "../lib/judge/schema.ts";

const dir = new URL("../fixtures-holdout/", import.meta.url);
const shownDir = new URL("../fixtures/", import.meta.url);
const listCases = (d) => readdirSync(d).filter((f) => /^case-\d+\.json$/.test(f)).sort();
const files = listCases(dir);
const shownSentences = new Set(
  listCases(shownDir).flatMap((f) => splitSentences(JSON.parse(readFileSync(new URL(f, shownDir), "utf8")).draft).map((s) => s.text)),
);
const VERDICTS = ["一致", "言い換え", "根拠なし", "反する"];
let problems = 0;
const fail = (file, msg) => {
  problems++;
  console.log(`NG ${file}: ${msg}`);
};
const totals = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
let sentencesAll = 0;
let border = 0;
const borderBy = Object.fromEntries(VERDICTS.map((v) => [v, 0]));

for (const file of files) {
  const c = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  if (file !== `case-${c.id}.json`) fail(file, `id ${c.id} がファイル名と合わない`);
  if (!/^利用者[A-E]$/.test(c.subject)) fail(file, `subject「${c.subject}」は利用者A〜Eではない`);
  if (!Array.isArray(c.savedJudgements) || c.savedJudgements.length) fail(file, "savedJudgements は空にする");

  const sentences = splitSentences(c.draft);
  if (sentences.length !== c.expected.length) fail(file, `文の数 ${sentences.length} と正解の数 ${c.expected.length} が違う`);
  sentences.forEach((s, i) => {
    if (c.expected[i]?.sentenceId !== s.id) fail(file, `${i + 1}番目の正解の番号が ${s.id} ではない`);
    if (shownSentences.has(s.text)) fail(file, `${s.id} は見本の5組と同じ文`);
  });

  const byId = new Map(c.records.map((r) => [r.id, r.lines.join("\n")]));
  c.records.forEach((r, i) => {
    if (r.id !== `R${String(i + 1).padStart(2, "0")}`) fail(file, `記録の番号 ${r.id} が順番でない`);
  });
  for (const j of c.expected) {
    if (!VERDICTS.includes(j.verdict)) fail(file, `${j.sentenceId} の判定「${j.verdict}」が4種類に無い`);
    for (const id of j.evidenceIds) if (!byId.has(id)) fail(file, `${j.sentenceId} の記録番号 ${id} が無い`);
    if ((j.verdict === "根拠なし") !== (j.evidenceIds.length === 0)) fail(file, `${j.sentenceId} の判定と記録番号の有無が合わない`);
    if ((j.verdict === "根拠なし") !== (j.evidenceQuote === "")) fail(file, `${j.sentenceId} の判定と引用の有無が合わない`);
    if (j.evidenceQuote && !j.evidenceIds.some((id) => byId.get(id)?.includes(j.evidenceQuote))) {
      fail(file, `${j.sentenceId} の引用「${j.evidenceQuote}」が記録に無い`);
    }
    if (!j.reason) fail(file, `${j.sentenceId} の理由が空`);
    totals[j.verdict]++;
    sentencesAll++;
    if (j.reason.startsWith("【境目】")) {
      border++;
      borderBy[j.verdict]++;
    }
  }

  const hits = [
    ...findPii([c.title, c.subject, c.period].join("\n")),
    ...c.records.flatMap((r) => findPii([r.date, r.staffRole, ...r.lines].join("\n"))),
    ...findPii(c.draft),
  ];
  if (hits.length) fail(file, `個人情報の形の検査に引っかかった（${[...new Set(hits.map((h) => h.label))].join("・")}）`);

  const parsed = judgeRequestSchema.safeParse({ records: c.records, draft: c.draft });
  if (!parsed.success) fail(file, "サーバーが受ける入力の形に合わない");
  const chars = c.records.reduce((n, r) => n + r.lines.join("").length, 0) + c.draft.length;
  if (chars > INPUT_LIMITS.totalChars) fail(file, `記録と下書きの合計 ${chars} 字が上限を超える`);
}

const pct = (n) => `${((n / sentencesAll) * 100).toFixed(0)}%`;
console.log(`${files.length} 組・${sentencesAll} 文`);
console.log(`4種類の数：${VERDICTS.map((v) => `${v} ${totals[v]}（${pct(totals[v])}）`).join("、")}`);
console.log(`【境目】の文：${border}（${pct(border)}）。内訳 ${VERDICTS.map((v) => `${v} ${borderBy[v]}`).join("、")}`);
console.log(`正解が赤（根拠なし・反する）の文：${totals["根拠なし"] + totals["反する"]}`);
console.log(problems ? `問題 ${problems} 件` : `${files.length} 組すべて問題なし`);
process.exit(problems ? 1 : 0);
