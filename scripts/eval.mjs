// 判定の揺れの測定。架空の組を同じ条件で何回か検査役に通し、回ごとの違いと正解との一致を数える。
// fixtures は読むだけで書き換えない。各回の結果と集計は docs/kensho-data/eval-<日時>.json に保存する。
// 使い方: 別の画面で npm run dev を動かしたまま、npm run eval（回数を変えるなら npm run eval -- 4）
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const base = "http://localhost:3000";
const rounds = Number(process.argv[2] ?? 4);
const COST_LIMIT = 2; // ドル。超えそうなら止める
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 }; // claude-opus-5-5、https://platform.claude.com/docs/en/about-claude/pricing
const dir = new URL("../fixtures/", import.meta.url);
const outDir = new URL("../docs/kensho-data/", import.meta.url);
const cases = readdirSync(dir)
  .filter((f) => /^case-\d+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

const isRed = (v) => v === "根拠なし" || v === "反する";
const cost = (u) => u.inputTokens * PRICE.input + u.outputTokens * PRICE.output;

const calls = [];
let spent = 0;
let stopped = null;
outer: for (let round = 1; round <= rounds; round++) {
  for (const c of cases) {
    const done = calls.filter((x) => x.usage).length;
    const remaining = rounds * cases.length - calls.length;
    if (done > 0 && spent + (spent / done) * remaining > COST_LIMIT) {
      stopped = `費用の見込みが $${COST_LIMIT} を超えるため ${round}回目・${c.id} の前で止めた（ここまで $${spent.toFixed(4)}）`;
      break outer;
    }
    const res = await fetch(`${base}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: c.records, draft: c.draft }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.usage) spent += cost(body.usage);
    calls.push({ round, case: c.id, ok: res.ok, detail: body.detail, usage: body.usage, judgements: body.judgements ?? [] });
    const u = body.usage;
    console.log(
      `${round}回目 ${c.id}: ${res.ok ? "OK" : `NG ${body.detail ?? body.code}`}` +
        (u ? `（${u.seconds.toFixed(1)}秒、入力${u.inputTokens}・出力${u.outputTokens}、$${cost(u).toFixed(4)}、${u.stopReason}）` : ""),
    );
    if (body.code === "no_key") process.exit(1);
  }
}

// 集計
const sentences = cases.flatMap((c) => c.expected.map((e) => ({ case: c.id, expected: e })));
const perSentence = sentences.map(({ case: id, expected }) => {
  const got = calls
    .filter((x) => x.case === id && x.ok)
    .map((x) => ({ round: x.round, j: x.judgements.find((j) => j.sentenceId === expected.sentenceId) }));
  const verdicts = got.map((g) => g.j?.verdict ?? "（無し）");
  const ids = got.map((g) => [...(g.j?.evidenceIds ?? [])].sort().join(","));
  return {
    case: id,
    sentenceId: expected.sentenceId,
    expected: expected.verdict,
    verdicts,
    allSame: new Set(verdicts).size === 1,
    redFlip: new Set(verdicts.map(isRed)).size > 1,
    idsChanged: new Set(ids).size > 1,
    evidenceIds: ids,
    reasons: got.map((g) => g.j?.reason ?? ""),
  };
});

const perRound = [];
for (let round = 1; round <= rounds; round++) {
  let agree = 0, total = 0, miss = 0, iikaeToKonkyo = 0;
  for (const c of cases) {
    const call = calls.find((x) => x.round === round && x.case === c.id && x.ok);
    if (!call) continue;
    for (const e of c.expected) {
      const v = call.judgements.find((j) => j.sentenceId === e.sentenceId)?.verdict;
      total++;
      if (v === e.verdict) agree++;
      if (isRed(e.verdict) && !isRed(v)) miss++;
      if (e.verdict === "言い換え" && v === "根拠なし") iikaeToKonkyo++;
    }
  }
  perRound.push({ round, agree, total, miss, iikaeToKonkyo });
}

const usages = calls.filter((x) => x.usage).map((x) => x.usage);
const summary = {
  date: new Date().toISOString(),
  model: calls.find((x) => x.ok) ? "claude-opus-5-5" : null,
  rounds,
  cases: cases.map((c) => c.id),
  calls: calls.length,
  failed: calls.filter((x) => !x.ok).length,
  stopped,
  sentences: perSentence.length,
  allSame: perSentence.filter((s) => s.allSame).length,
  redFlips: perSentence.filter((s) => s.redFlip),
  idsChanged: perSentence.filter((s) => s.idsChanged).length,
  perRound,
  usage: {
    secondsAvg: usages.reduce((a, u) => a + u.seconds, 0) / usages.length,
    secondsMax: Math.max(...usages.map((u) => u.seconds)),
    inputAvg: usages.reduce((a, u) => a + u.inputTokens, 0) / usages.length,
    outputAvg: usages.reduce((a, u) => a + u.outputTokens, 0) / usages.length,
    outputMax: Math.max(...usages.map((u) => u.outputTokens)),
    costAvg: spent / usages.length,
    costTotal: spent,
    cutOff: usages.filter((u) => u.stopReason === "max_tokens").length,
  },
};

console.log(`\n文の判定が${rounds}回とも同じ：${summary.allSame}/${summary.sentences}`);
console.log(`赤かどうかが入れ替わった文：${summary.redFlips.length}`);
for (const s of summary.redFlips) console.log(`  ${s.case}・${s.sentenceId}: ${s.verdicts.join(" / ")}`);
for (const r of perRound) console.log(`${r.round}回目：正解と一致 ${r.agree}/${r.total}、見逃し ${r.miss}、言い換え→根拠なし ${r.iikaeToKonkyo}`);
console.log(`根拠の記録番号が回によって変わった文：${summary.idsChanged}`);
console.log(`揺れた文：`);
for (const s of perSentence.filter((s) => !s.allSame)) console.log(`  ${s.case}・${s.sentenceId}（正解 ${s.expected}）: ${s.verdicts.join(" / ")}`);
console.log(`合計 $${spent.toFixed(4)}（1回平均 $${summary.usage.costAvg.toFixed(4)}）${stopped ? `\n${stopped}` : ""}`);

mkdirSync(outDir, { recursive: true });
const stamp = summary.date.replace(/[:.]/g, "-");
writeFileSync(new URL(`eval-${stamp}.json`, outDir), JSON.stringify({ summary, perSentence, calls }, null, 2) + "\n");
console.log(`docs/kensho-data/eval-${stamp}.json に保存しました`);
