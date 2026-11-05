"use client";

import type { ReactNode } from "react";
import { jumpTo, recordElementId, sentenceElementId } from "@/lib/jump";
import type { Judgement, Sentence, Verdict, VisitRecord } from "@/lib/types";

const VERDICTS: Verdict[] = ["一致", "言い換え", "根拠なし", "反する"];

export const tagClass: Record<Verdict, string> = {
  一致: "tag",
  言い換え: "tag tag-yellow",
  根拠なし: "tag tag-red",
  反する: "tag tag-red tag-strike",
};

const MEANING: Record<Verdict, string> = {
  一致: "記録に同じ内容がある",
  言い換え: "記録の内容を別の言葉にした・まとめた",
  根拠なし: "記録のどこにも見当たらない（誤りという意味ではなく、確認が要るという印）",
  反する: "記録と食い違う",
};

// 照合の結果を表示する。左に訪問記録、右に文ごとの判定。見本モードと実行モードで共通。
export function JudgementView({
  records,
  sentences,
  judgements,
  renderExtra,
  isSample = false,
}: {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  renderExtra?: (s: Sentence, j: Judgement | undefined) => ReactNode; // 文の札の下に足す物（処理の選択など）
  isSample?: boolean;
}) {
  const verdictOf = (s: Sentence): Verdict => judgements.find((j) => j.sentenceId === s.id)?.verdict ?? "根拠なし";
  const counts = new Map<Verdict, number>();
  for (const s of sentences) counts.set(verdictOf(s), (counts.get(verdictOf(s)) ?? 0) + 1);
  const firstOf = (v: Verdict) => sentences.find((s) => verdictOf(s) === v);

  return (
    <>
      <div className="counts-box">
        <p className="counts">
          {VERDICTS.map((v) => {
            const first = firstOf(v);
            return (
              <button
                key={v}
                type="button"
                className="count-chip"
                disabled={!first}
                onClick={() => first && jumpTo(sentenceElementId(first.id))}
                aria-label={`${v} ${counts.get(v) ?? 0}件。押すと最初の文へ移動`}
              >
                <span className={tagClass[v]}>{v}</span> {counts.get(v) ?? 0}
              </button>
            );
          })}
        </p>
        <p className="legend-line">
          <span className="tag tag-red">赤</span>（根拠なし・反する）＝出す前に必ず選ぶ／<span className="tag tag-yellow">黄</span>（言い換え）＝任意（選ばなかった件数が記録に残る）／<span className="tag">一致</span>＝そのまま
        </p>
        <details className="legend-details">
          <summary>4つの印の意味</summary>
          <dl>
            {VERDICTS.map((v) => (
              <div key={v}>
                <dt><span className={tagClass[v]}>{v}</span></dt>
                <dd>{MEANING[v]}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <div className="check-grid">
        <section aria-labelledby="records-title" className="records-col">
          <h2 id="records-title">訪問記録</h2>
          <p className="col-note">
            現場では、記録ソフト（外のサービス）にある1か月分の訪問看護記録書Ⅱを、人がコピーして貼る欄です。記録ソフトとはつながっていません。
            {isSample && "見本は架空の記録を最初から入れてあります。"}
          </p>
          {records.map((r) => (
            <article key={r.id} id={recordElementId(r.id)} className="record">
              <h3><span className="rec-id">{r.id}</span>{[r.date, r.staffRole].filter(Boolean).join("・")}</h3>
              <ul>{r.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </article>
          ))}
        </section>

        <section aria-labelledby="draft-title">
          <h2 id="draft-title">下書きの文ごとの印</h2>
          <p className="col-note">
            下書きは、生成AIなどで別に書いた物を貼ります（この道具は下書きを書きません）。『。』と改行でプログラムが文に分け、S01から番号を付けます。
          </p>
          <ol className="sentences">
            {sentences.map((s) => {
              const j = judgements.find((x) => x.sentenceId === s.id);
              const verdict = verdictOf(s);
              return (
                <li key={s.id} id={sentenceElementId(s.id)} className={`sentence v-${verdict}`}>
                  <div className="sentence-head">
                    <span className="sid">{s.id}</span>
                    <span className={tagClass[verdict]}>{verdict}{j ? "" : "（AIの印なし）"}</span>
                    {j?.evidenceIds.map((id) => (
                      <a
                        key={id}
                        href={`#${recordElementId(id)}`}
                        className="rec-id"
                        title={`訪問記録 ${id} を見る`}
                        onClick={(e) => {
                          e.preventDefault();
                          jumpTo(recordElementId(id));
                        }}
                      >
                        {id}
                      </a>
                    ))}
                  </div>
                  <p className="sentence-text">{s.text}</p>
                  {j?.evidenceQuote && <p className="quote">記録：「{j.evidenceQuote}」</p>}
                  {j?.reason && <p className="muted"><span className="ai-note">AIの説明（参考）</span>{j.reason}</p>}
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
