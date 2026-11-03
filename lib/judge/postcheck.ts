import type { Judgement, Sentence, VisitRecord } from "../types";
import type { JudgeOutput } from "./schema";

// 言い切りの語。理由にこれがあれば伏せる（判定そのものは変えない）。
const ASSERTIVE = ["安全です", "安全", "問題ありません", "問題ない", "問題なし", "正しい", "間違いない", "確実"];

// 機械の検査（Claudeに判定させない）。
// - 文の数が入力と同じか。足りない文は「根拠なし（未判定）」にする
// - evidenceQuote が、指定された記録の本文に文字どおりあるか。無ければ「根拠なし（引用が記録に無い）」に下げる
// - reason に言い切りの語が無いか
export function postcheck(output: JudgeOutput, sentences: Sentence[], records: VisitRecord[]): Judgement[] {
  const recordText = new Map(records.map((r) => [r.id, r.lines.join("\n")]));

  return sentences.map((s) => {
    const raw = output.judgements.find((j) => j.sentenceId === s.id);
    if (!raw) {
      return {
        sentenceId: s.id,
        verdict: "根拠なし",
        evidenceIds: [],
        evidenceQuote: "",
        reason: "検査役が判定を返さなかった文です。",
        machineNote: "未判定",
      };
    }

    const notes: string[] = [];
    const evidenceIds = raw.evidenceIds.filter((id) => recordText.has(id));
    if (evidenceIds.length !== raw.evidenceIds.length) notes.push("存在しない記録番号を外した");

    let reason = raw.reason;
    for (const word of ASSERTIVE) {
      if (reason.includes(word)) {
        reason = reason.split(word).join("〔言い切りの語を伏せた〕");
        notes.push("理由の言い切りの語を伏せた");
      }
    }

    if (raw.verdict === "根拠なし") {
      return { sentenceId: s.id, verdict: "根拠なし", evidenceIds: [], evidenceQuote: "", reason, ...note(notes) };
    }

    const quoteFound =
      raw.evidenceQuote.length > 0 && evidenceIds.some((id) => recordText.get(id)!.includes(raw.evidenceQuote));
    if (!quoteFound) {
      return {
        sentenceId: s.id,
        verdict: "根拠なし",
        evidenceIds: [],
        evidenceQuote: "",
        reason: `検査役は「${raw.verdict}」としたが、示した引用が記録に文字どおり見当たらない。${reason}`,
        machineNote: ["引用が記録に無い", ...notes].join("・"),
      };
    }

    return { sentenceId: s.id, verdict: raw.verdict, evidenceIds, evidenceQuote: raw.evidenceQuote, reason, ...note(notes) };
  });
}

function note(notes: string[]) {
  return notes.length ? { machineNote: [...new Set(notes)].join("・") } : {};
}
