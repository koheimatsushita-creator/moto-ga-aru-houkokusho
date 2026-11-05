import type { Decision, Judgement, Sentence, Verdict } from "./types";

// 文ごとの処理と「出す」のガード。画面の状態だけで計算し、保存はしない。

export const ACTION_LABEL: Record<Decision["action"], string> = {
  戻す: "記録の言葉に戻す",
  削る: "削る",
  残す: "確認して残す",
};

export const isRed = (v: Verdict) => v === "根拠なし" || v === "反する";
export const needsDecision = (v: Verdict) => v !== "一致";

// 引用が無い文（根拠なし）には「記録の言葉に戻す」を出さない
export function actionsFor(j: Judgement): Decision["action"][] {
  if (!needsDecision(j.verdict)) return [];
  return j.evidenceQuote ? ["戻す", "削る", "残す"] : ["削る", "残す"];
}

// 判定が無い文は「根拠なし（未判定）」として扱う
export function judgementFor(sentenceId: string, judgements: Judgement[]): Judgement {
  return (
    judgements.find((j) => j.sentenceId === sentenceId) ?? {
      sentenceId,
      verdict: "根拠なし",
      evidenceIds: [],
      evidenceQuote: "",
      reason: "判定がありません。",
      machineNote: "未判定",
    }
  );
}

function asSentence(quote: string): string {
  const t = quote.replace(/\s*\n\s*/g, "").trim();
  return /[。．！？]$/.test(t) ? t : `${t}。`;
}

// 処理を当てた後の文。null は削った文
export function processedText(s: Sentence, j: Judgement, d: Decision | undefined): string | null {
  if (d?.action === "削る") return null;
  if (d?.action === "戻す" && j.evidenceQuote) return asSentence(j.evidenceQuote);
  return s.text;
}

export function finalReport(sentences: Sentence[], judgements: Judgement[], decisions: Record<string, Decision>): string {
  return sentences
    .map((s) => processedText(s, judgementFor(s.id, judgements), decisions[s.id]))
    .filter((t): t is string => t !== null)
    .join("");
}

export type Guard = {
  redPending: string[]; // 未処理の赤の文
  reasonMissing: string[]; // 「確認して残す」なのに理由が空の文
  yellowPending: string[]; // 未処理の黄の文（出せるが記録に残す）
  canIssue: boolean;
};

export function guard(sentences: Sentence[], judgements: Judgement[], decisions: Record<string, Decision>): Guard {
  const redPending: string[] = [];
  const reasonMissing: string[] = [];
  const yellowPending: string[] = [];
  for (const s of sentences) {
    const j = judgementFor(s.id, judgements);
    const d = decisions[s.id];
    if (!needsDecision(j.verdict)) continue;
    if (!d) (isRed(j.verdict) ? redPending : yellowPending).push(s.id);
    else if (d.action === "残す" && !d.reason?.trim()) reasonMissing.push(s.id);
  }
  return { redPending, reasonMissing, yellowPending, canIssue: redPending.length === 0 && reasonMissing.length === 0 };
}
