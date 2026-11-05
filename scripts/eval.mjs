// 判定の揺れの測定。架空の組を同じ条件で何回か検査役に通し、回ごとの違いと正解との一致を数える。
// 組は読むだけで書き換えない。各回の結果と集計は docs/kensho-data/eval-<日時>.json に保存する
// （途中で止まっても、それまでの回は同じファイルに残る）。
// 使い方: 別の画面で npm run dev を動かしたまま
//   npm run eval                       … fixtures の5組 × 4回、費用の上限 $2（これまでと同じ）
//   npm run eval -- 4                  … 回数だけ変える（これまでと同じ書き方）
//   npm run eval -- --dirs fixtures,fixtures-holdout --rounds 3 --limit 8
//                                      … 読むフォルダ・回数・費用の上限（ドル）を変える
//   npm run eval -- --resume docs/kensho-data/eval-<日時>.json
//                                      … 途中で止まった測定を、同じ条件で続きから回す（済んだ回は呼ばない。同じファイルに書き足す）
//   npm run eval -- --rescore docs/kensho-data/eval-<日時>.json
//                                      … AIは呼ばず、保存済みの判定を今の正解で数え直す（eval-<日時>-rescored-<今の日時>.json に保存）
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { splitSentences } from "../lib/split.ts";

const base = "http://localhost:3000";
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const rescore = args.includes("--rescore");
const resumePath = flag("resume") ?? flag("rescore");
const prior = resumePath ? JSON.parse(readFileSync(resumePath, "utf8")) : null;
if (prior && (!prior.conditions || !resumePath.startsWith("docs/kensho-data/eval-"))) {
  console.error("続きから回せるのは、条件を書いた docs/kensho-data/eval-*.json だけです");
  process.exit(1);
}
const rounds = prior ? prior.conditions.rounds : Number(flag("rounds") ?? positional ?? 4);
const COST_LIMIT = prior ? prior.conditions.costLimit : Number(flag("limit") ?? 2); // ドル。超えそうなら止める
const dirs = prior ? prior.conditions.dirs : (flag("dirs") ?? "fixtures").split(",").filter(Boolean);
if (!(rounds >= 1) || !(COST_LIMIT > 0) || dirs.some((d) => !/^[\w-]+$/.test(d))) {
  console.error("引数が読めません。例：npm run eval -- --dirs fixtures,fixtures-holdout --rounds 3 --limit 8");
  process.exit(1);
}
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 }; // claude-opus-5-5、https://platform.claude.com/docs/en/about-claude/pricing
const outDir = new URL("../docs/kensho-data/", import.meta.url);
const cases = dirs.flatMap((group) => {
  const dir = new URL(`../${group}/`, import.meta.url);
  return readdirSync(dir)
    .filter((f) => /^case-\d+\.json$/.test(f))
    .sort()
    .map((f) => ({ ...JSON.parse(readFileSync(new URL(f, dir), "utf8")), group }));
});
const keyOf = (c) => `${c.group}/${c.id}`;
if (new Set(cases.map(keyOf)).size !== cases.length) {
  console.error("同じフォルダに同じ番号の組があります");
  process.exit(1);
}

const isRed = (v) => v === "根拠なし" || v === "反する";
const cost = (u) => u.inputTokens * PRICE.input + u.outputTokens * PRICE.output;
const startedAt = prior?.conditions.startedAt ?? new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, "-");
const outFile = rescore
  ? new URL(`eval-${stamp}-rescored-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, outDir)
  : new URL(`eval-${stamp}.json`, outDir);
mkdirSync(outDir, { recursive: true });
const conditions = { startedAt, dirs, rounds, costLimit: COST_LIMIT, cases: cases.map(keyOf), resumedAt: [...(prior?.conditions.resumedAt ?? []), ...(prior && !rescore ? [new Date().toISOString()] : [])], ...(rescore ? { rescoredAt: new Date().toISOString(), rescoredFrom: resumePath } : {}) };
if (prior && JSON.stringify(prior.conditions.cases) !== JSON.stringify(conditions.cases)) {
  console.error("組の並びが前回と違うため、続きから回せません");
  process.exit(1);
}

// 続きからの時は、成功した回だけを引き継ぐ（失敗した回は呼び直す）
const calls = (prior?.calls ?? []).filter((x) => x.ok);
let spent = calls.reduce((a, x) => a + (x.usage ? cost(x.usage) : 0), 0);
let stopped = null;
outer: for (let round = 1; round <= rounds && !rescore; round++) {
  for (const c of cases) {
    if (calls.some((x) => x.round === round && x.group === c.group && x.case === c.id)) continue;
    const done = calls.filter((x) => x.usage).length;
    const remaining = rounds * cases.length - calls.length;
    if (done > 0 && spent + (spent / done) * remaining > COST_LIMIT) {
      stopped = `費用の見込みが $${COST_LIMIT} を超えるため ${round}回目・${keyOf(c)} の前で止めた（ここまで $${spent.toFixed(4)}）`;
      break outer;
    }
    const res = await fetch(`${base}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: c.records, draft: c.draft }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.usage) spent += cost(body.usage);
    calls.push({ round, group: c.group, case: c.id, ok: res.ok, source: body.source, detail: body.detail ?? body.code, usage: body.usage, judgements: body.judgements ?? [] });
    const u = body.usage;
    console.log(
      `${round}回目 ${keyOf(c)}: ${res.ok ? "OK" : `NG ${body.detail ?? body.code}`}` +
        (u ? `（${u.seconds.toFixed(1)}秒、入力${u.inputTokens}・出力${u.outputTokens}、$${cost(u).toFixed(4)}、${u.stopReason}）` : ""),
    );
    writeFileSync(outFile, JSON.stringify({ conditions, summary: null, calls }, null, 2) + "\n"); // 途中経過
    if (body.code === "no_key") process.exit(1);
  }
}

// 集計
const okCalls = calls.filter((x) => x.ok);
const callOf = (c, round) => okCalls.find((x) => x.round === round && x.group === c.group && x.case === c.id);
const sentences = cases.flatMap((c) => {
  const texts = new Map(splitSentences(c.draft).map((s) => [s.id, s.text]));
  return c.expected.map((expected) => ({ c, text: texts.get(expected.sentenceId) ?? "", expected }));
});

const perSentence = sentences.map(({ c, text, expected }) => {
  const got = [];
  for (let round = 1; round <= rounds; round++) {
    const call = callOf(c, round);
    if (call) got.push({ round, j: call.judgements.find((j) => j.sentenceId === expected.sentenceId) });
  }
  const verdicts = got.map((g) => g.j?.verdict ?? "（無し）");
  const ids = got.map((g) => [...(g.j?.evidenceIds ?? [])].sort().join(","));
  return {
    group: c.group,
    case: c.id,
    sentenceId: expected.sentenceId,
    text,
    expected: expected.verdict,
    border: expected.reason.startsWith("【境目】"),
    expectedReason: expected.reason,
    rounds: got.map((g) => g.round),
    verdicts,
    allSame: new Set(verdicts).size === 1,
    redFlip: new Set(verdicts.map(isRed)).size > 1,
    idsChanged: new Set(ids).size > 1,
    evidenceIds: ids,
    reasons: got.map((g) => g.j?.reason ?? ""),
    machineNotes: got.map((g) => g.j?.machineNote ?? ""),
  };
});

// 1文×1回ごとの突き合わせ
const pairs = perSentence.flatMap((s) =>
  s.verdicts.map((v, i) => ({ ...s, round: s.rounds[i], got: v, gotReason: s.reasons[i], gotIds: s.evidenceIds[i], gotNote: s.machineNotes[i] })),
);
const MISS = (p) => isRed(p.expected) && !isRed(p.got); // 赤の見逃し
const IIKAE_TO_KONKYO = (p) => p.expected === "言い換え" && p.got === "根拠なし";
const brief = (p) => ({ group: p.group, case: p.case, sentenceId: p.sentenceId, round: p.round, text: p.text, expected: p.expected, got: p.got, border: p.border, reason: p.gotReason, evidenceIds: p.gotIds });

function measure(filter) {
  const ss = perSentence.filter(filter);
  const ps = pairs.filter(filter);
  const groupCases = new Set(ss.map((s) => `${s.group}/${s.case}`));
  const groupCalls = okCalls.filter((x) => groupCases.has(`${x.group}/${x.case}`));
  const usages = calls.filter((x) => x.usage && groupCases.has(`${x.group}/${x.case}`)).map((x) => x.usage);
  const sum = (f) => usages.reduce((a, u) => a + f(u), 0);
  const perRound = [];
  for (let round = 1; round <= rounds; round++) {
    const r = ps.filter((p) => p.round === round);
    perRound.push({
      round,
      total: r.length,
      agree: r.filter((p) => p.got === p.expected).length,
      redAgree: r.filter((p) => isRed(p.got) === isRed(p.expected)).length,
      miss: r.filter(MISS).length,
      iikaeToKonkyo: r.filter(IIKAE_TO_KONKYO).length,
    });
  }
  const red = ps.filter((p) => isRed(p.expected));
  const confusion = {};
  for (const p of ps) confusion[`${p.expected}→${p.got}`] = (confusion[`${p.expected}→${p.got}`] ?? 0) + 1;
  return {
    cases: groupCases.size,
    sentences: ss.length,
    redSentences: ss.filter((s) => isRed(s.expected)).length,
    borderSentences: ss.filter((s) => s.border).length,
    calls: groupCalls.length,
    pairs: ps.length,
    agree: ps.filter((p) => p.got === p.expected).length,
    redAgree: ps.filter((p) => isRed(p.got) === isRed(p.expected)).length,
    redPairs: red.length,
    miss: ps.filter(MISS).length,
    missList: ps.filter(MISS).map(brief),
    nonRedToRed: ps.filter((p) => !isRed(p.expected) && isRed(p.got)).length,
    iikaeToKonkyo: ps.filter(IIKAE_TO_KONKYO).length,
    iikaeToKonkyoList: ps.filter(IIKAE_TO_KONKYO).map(brief),
    borderAgree: ps.filter((p) => p.border && p.got === p.expected).length,
    borderPairs: ps.filter((p) => p.border).length,
    allSame: ss.filter((s) => s.allSame).length,
    redFlips: ss.filter((s) => s.redFlip).map((s) => ({ group: s.group, case: s.case, sentenceId: s.sentenceId, text: s.text, expected: s.expected, verdicts: s.verdicts, reasons: s.reasons })),
    idsChanged: ss.filter((s) => s.idsChanged).length,
    perRound,
    confusion,
    usage: usages.length
      ? {
          n: usages.length,
          secondsAvg: sum((u) => u.seconds) / usages.length,
          secondsMax: Math.max(...usages.map((u) => u.seconds)),
          inputAvg: sum((u) => u.inputTokens) / usages.length,
          outputAvg: sum((u) => u.outputTokens) / usages.length,
          outputMax: Math.max(...usages.map((u) => u.outputTokens)),
          costAvg: sum(cost) / usages.length,
          costTotal: sum(cost),
          cutOff: usages.filter((u) => u.stopReason === "max_tokens").length,
        }
      : null,
  };
}

const groups = { all: measure(() => true) };
if (dirs.length > 1) for (const d of dirs) groups[d] = measure((x) => x.group === d);
const machineFixed = pairs.filter((p) => p.gotNote).length;

const summary = {
  date: new Date().toISOString(),
  model: okCalls.length ? "claude-opus-5-5" : null,
  rounds,
  dirs,
  costLimit: COST_LIMIT,
  cases: cases.map(keyOf),
  calls: calls.length,
  failed: calls.filter((x) => !x.ok).length,
  notLive: okCalls.filter((x) => x.source !== "live").length, // 保存済みの判定が返った回（AIを呼んでいない）
  stopped,
  machineFixedPairs: machineFixed,
  // これまでの形（all と同じ値）
  sentences: groups.all.sentences,
  allSame: groups.all.allSame,
  redFlips: groups.all.redFlips,
  idsChanged: groups.all.idsChanged,
  perRound: groups.all.perRound,
  usage: groups.all.usage,
  groups,
};

const pc = (a, b) => (b ? `${a}/${b}（${((a / b) * 100).toFixed(1)}%）` : "—");
for (const [name, g] of Object.entries(groups)) {
  console.log(`\n=== ${name === "all" ? "全体" : name}（${g.cases}組・${g.sentences}文・赤${g.redSentences}文・境目${g.borderSentences}文）===`);
  console.log(`4段階の一致：${pc(g.agree, g.pairs)}　赤か赤でないかの一致：${pc(g.redAgree, g.pairs)}`);
  console.log(`赤の見逃し：${g.miss}/${g.redPairs}　赤でない文を赤にした：${g.nonRedToRed}　言い換え→根拠なし：${g.iikaeToKonkyo}`);
  console.log(`境目の文の4段階の一致：${pc(g.borderAgree, g.borderPairs)}`);
  console.log(`${rounds}回とも同じ判定の文：${pc(g.allSame, g.sentences)}　赤かどうかが入れ替わった文：${g.redFlips.length}　根拠の記録番号が変わった文：${g.idsChanged}`);
  for (const r of g.perRound) console.log(`  ${r.round}回目：一致 ${r.agree}/${r.total}、赤か否か ${r.redAgree}/${r.total}、見逃し ${r.miss}、言い換え→根拠なし ${r.iikaeToKonkyo}`);
  for (const m of g.missList) console.log(`  見逃し ${m.group}/${m.case}・${m.sentenceId}（${m.round}回目、正解 ${m.expected}→${m.got}）${m.text}｜${m.reason}`);
  for (const s of g.redFlips) console.log(`  赤の入れ替わり ${s.group}/${s.case}・${s.sentenceId}（正解 ${s.expected}）: ${s.verdicts.join(" / ")}`);
  if (g.usage) console.log(`秒数 平均${g.usage.secondsAvg.toFixed(1)}・最大${g.usage.secondsMax.toFixed(1)}、入力平均${g.usage.inputAvg.toFixed(0)}・出力平均${g.usage.outputAvg.toFixed(0)}、1回平均 $${g.usage.costAvg.toFixed(4)}、計 $${g.usage.costTotal.toFixed(4)}`);
}
console.log(`\n失敗 ${summary.failed}回、AIを呼ばずに保存済みが返った回 ${summary.notLive}、サーバー側の検査で直した判定 ${machineFixed}`);
console.log(`合計 $${spent.toFixed(4)}${stopped ? `\n${stopped}` : ""}`);

writeFileSync(outFile, JSON.stringify({ conditions, summary, perSentence, calls }, null, 2) + "\n");
console.log(`docs/kensho-data/${outFile.pathname.split("/").pop()} に保存しました`);
