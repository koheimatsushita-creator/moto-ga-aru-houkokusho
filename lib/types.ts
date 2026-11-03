// docs/design.md「データの型」と同じ形。fixtures もこの型で書く。

export type VisitRecord = {
  id: string; // "R01"
  date: string; // "2026-10-02"
  staffRole: string; // "看護師" など
  lines: string[];
};

export type Sentence = {
  id: string; // "S01"
  text: string;
};

export type Verdict = "一致" | "言い換え" | "根拠なし" | "反する";

export type Judgement = {
  sentenceId: string;
  verdict: Verdict;
  evidenceIds: string[];
  evidenceQuote: string;
  reason: string;
};

export type Decision = {
  sentenceId: string;
  action: "戻す" | "削る" | "残す";
  reason?: string;
};

export type FixtureCase = {
  id: string; // "01"
  title: string;
  subject: string; // 「利用者A」〜「利用者E」だけを使う
  period: string;
  records: VisitRecord[];
  draft: string;
  expected: Judgement[]; // 正解の判定（人が付けた）
  savedJudgements: Judgement[]; // 検査役を実際に回した結果。回すまでは空
};
