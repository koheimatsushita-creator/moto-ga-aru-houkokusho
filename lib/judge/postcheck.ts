import type { Judgement, Sentence, VisitRecord } from "../types";
import type { JudgeOutput } from "./schema";
import { neutralize } from "./sanitize.ts";

// 言い切りの語。理由にこれがあれば伏せる（判定そのものは変えない）。
const ASSERTIVE = ["安全です", "安全", "問題ありません", "問題ない", "問題なし", "正しい", "間違いない", "確実"];
export const MIN_QUOTE_CHARS = 4; // これより短い引用は根拠として扱わない（見本と過去の判定380件の最短は7字）
export const MIN_SHARED_PAIRS = 2; // 一致・言い換えの時、文と引用が共有する2文字の組の最小（過去の判定の最小は2）
export const MAX_REASON_CHARS = 120;
const URL_PATTERN = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|jp|io|dev|ai)\b/i;

// 記号と空白を除いて字形を揃える
const plain = (s: string) => s.normalize("NFKC").replace(/[\s。、，．,.!?！？「」『』（）()・:：%\/]/g, "");

function sharedPairs(a: string, b: string): number {
  const pairs = (s: string) => {
    const t = plain(s);
    const set = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const pb = pairs(b);
  let n = 0;
  for (const p of pairs(a)) if (pb.has(p)) n++;
  return n;
}

function cleanReason(reason: string, notes: string[]): string {
  if (URL_PATTERN.test(reason)) {
    notes.push("理由にURLがあったため差し替えた");
    return "（理由にURLの形が含まれていたため、表示しません。）";
  }
  let r = reason;
  for (const word of ASSERTIVE) {
    if (r.includes(word)) {
      r = r.split(word).join("〔言い切りの語を伏せた〕");
      notes.push("理由の言い切りの語を伏せた");
    }
  }
  if (r.length > MAX_REASON_CHARS) {
    r = `${r.slice(0, MAX_REASON_CHARS)}…`;
    notes.push("理由が長いため途中までにした");
  }
  return r;
}

// 機械の確かめ直し（Claudeに判定させない）。万一の時の備えで、AIの答えをそのまま信じないためのもの。
// - 文の数が入力と同じか。足りない文は「根拠なし（未判定）」にする
// - evidenceQuote が、指定された記録の本文に文字どおりあるか、短すぎないか。満たさなければ「根拠なし」に下げる
// - 一致・言い換えなのに、文と引用がほとんど重ならなければ「根拠なし」に下げる（記録に紛れ込ませた指示の行を引用した場合など）
// - reason の言い切りの語・URL・長さ
export function postcheck(output: JudgeOutput, sentences: Sentence[], records: VisitRecord[]): Judgement[] {
  const recordText = new Map(records.map((r) => [r.id, neutralize(r.lines.join("\n"))]));

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
    const reason = cleanReason(raw.reason, notes);

    if (raw.verdict === "根拠なし") {
      return { sentenceId: s.id, verdict: "根拠なし", evidenceIds: [], evidenceQuote: "", reason, ...note(notes) };
    }

    const downgrade = (why: string) => ({
      sentenceId: s.id,
      verdict: "根拠なし" as const,
      evidenceIds: [],
      evidenceQuote: "",
      reason: `検査役は「${raw.verdict}」としたが、${why}。${reason}`,
      machineNote: [why, ...notes].join("・"),
    });

    const quote = neutralize(raw.evidenceQuote);
    if (plain(quote).length < MIN_QUOTE_CHARS) return downgrade("示した引用が短すぎる");
    if (!evidenceIds.some((id) => recordText.get(id)!.includes(quote))) return downgrade("示した引用が記録に文字どおり見当たらない");
    if ((raw.verdict === "一致" || raw.verdict === "言い換え") && sharedPairs(s.text, quote) < MIN_SHARED_PAIRS) {
      return downgrade("文と示した引用がほとんど重ならない");
    }

    return { sentenceId: s.id, verdict: raw.verdict, evidenceIds, evidenceQuote: raw.evidenceQuote, reason, ...note(notes) };
  });
}

function note(notes: string[]) {
  return notes.length ? { machineNote: [...new Set(notes)].join("・") } : {};
}
