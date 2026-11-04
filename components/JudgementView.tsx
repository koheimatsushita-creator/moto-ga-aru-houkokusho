import type { ReactNode } from "react";
import type { Judgement, Sentence, Verdict, VisitRecord } from "@/lib/types";

const VERDICTS: Verdict[] = ["一致", "言い換え", "根拠なし", "反する"];

export const tagClass: Record<Verdict, string> = {
  一致: "tag",
  言い換え: "tag tag-yellow",
  根拠なし: "tag tag-red",
  反する: "tag tag-red tag-strike",
};

// 照合の結果を表示する。左に訪問記録、右に文ごとの判定。見本モードと実行モードで共通。
export function JudgementView({
  records,
  sentences,
  judgements,
  renderExtra,
}: {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  renderExtra?: (s: Sentence, j: Judgement | undefined) => ReactNode; // 文の札の下に足す物（処理の選択など）
}) {
  const counts = new Map<Verdict, number>();
  for (const s of sentences) {
    const v = judgements.find((j) => j.sentenceId === s.id)?.verdict ?? "根拠なし";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  return (
    <>
      <p className="counts">
        {VERDICTS.map((v) => (
          <span key={v}><span className={tagClass[v]}>{v}</span> {counts.get(v) ?? 0}</span>
        ))}
      </p>

      <div className="check-grid">
        <section aria-labelledby="records-title">
          <h2 id="records-title">訪問記録</h2>
          {records.map((r) => (
            <article key={r.id} id={r.id} className="record">
              <h3><span className="rec-id">{r.id}</span>{[r.date, r.staffRole].filter(Boolean).join("・")}</h3>
              <ul>{r.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </article>
          ))}
        </section>

        <section aria-labelledby="draft-title">
          <h2 id="draft-title">下書きの文ごとの判定</h2>
          <ol className="sentences">
            {sentences.map((s) => {
              const j = judgements.find((x) => x.sentenceId === s.id);
              const verdict: Verdict = j?.verdict ?? "根拠なし";
              return (
                <li key={s.id} className={`sentence v-${verdict}`}>
                  <div className="sentence-head">
                    <span className="sid">{s.id}</span>
                    <span className={tagClass[verdict]}>{verdict}{j ? "" : "（未判定）"}</span>
                    {j?.evidenceIds.map((id) => <a key={id} href={`#${id}`} className="rec-id">{id}</a>)}
                  </div>
                  <p className="sentence-text">{s.text}</p>
                  {j?.evidenceQuote && <p className="quote">記録：「{j.evidenceQuote}」</p>}
                  {j?.reason && <p className="muted">{j.reason}</p>}
                  {j?.machineNote && <p className="machine-note">サーバー側の検査：{j.machineNote}</p>}
                  {renderExtra?.(s, j)}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
