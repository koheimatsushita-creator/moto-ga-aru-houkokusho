"use client";

import { useState, type ReactNode } from "react";
import { JudgementView, tagClass } from "@/components/JudgementView";
import { ACTION_LABEL, actionsFor, finalReport, guard, guardMessage, isRed, judgementFor, needsDecision, processedText } from "@/lib/review";
import type { Decision, Judgement, JudgeRunMeta, Sentence, Verdict, VisitRecord } from "@/lib/types";

const VERDICTS: Verdict[] = ["一致", "言い換え", "根拠なし", "反する"];
const ROLES = ["管理者", "経営者"] as const;

// 照合 → 文ごとの処理 → 出す（検査記録）。状態は画面の中だけに持ち、保存しない。
export function ReviewFlow({
  records,
  sentences,
  judgements,
  meta,
  isSample,
  title,
  header,
}: {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  meta: JudgeRunMeta | null; // null は人が付けた正解を表示している時
  isSample: boolean;
  title: string;
  header?: ReactNode; // 照合の画面でだけ出す見出し
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [view, setView] = useState<"check" | "issue">("check");
  const [creator, setCreator] = useState(isSample ? "架空の職員A" : "");
  const [reviewer, setReviewer] = useState(isSample ? "架空の職員B" : "");
  const [reviewerRole, setReviewerRole] = useState<(typeof ROLES)[number]>("管理者");
  const [issuedAt, setIssuedAt] = useState("");

  const g = guard(sentences, judgements, decisions);
  const report = finalReport(sentences, judgements, decisions);

  function choose(sentenceId: string, action: Decision["action"]) {
    setDecisions((prev) => ({ ...prev, [sentenceId]: { sentenceId, action, reason: prev[sentenceId]?.reason } }));
  }
  function setReason(sentenceId: string, reason: string) {
    setDecisions((prev) => ({ ...prev, [sentenceId]: { ...prev[sentenceId], reason } }));
  }
  function issue() {
    if (!g.canIssue) return;
    setIssuedAt(new Date().toLocaleString("ja-JP", { dateStyle: "long", timeStyle: "short" }));
    setView("issue");
    window.scrollTo(0, 0);
  }

  if (view === "issue") {
    return (
      <IssueRecord
        {...{ records, sentences, judgements, decisions, meta, isSample, title, report, issuedAt, creator, reviewer, reviewerRole }}
        yellowPending={g.yellowPending.length}
        onBack={() => setView("check")}
      />
    );
  }

  return (
    <>
      {header}
      <section className="howto-box" aria-labelledby="howto-review">
        <h2 id="howto-review">この画面の使い方</h2>
        <ol>
          <li>黄（言い換え）と赤（根拠なし・反する）の文ごとに、「記録の言葉に戻す」「削る」「確認して残す」から選びます。選んだ後でも選び直せます。</li>
          <li>「確認して残す」を選んだ時は、残す理由を書きます（例：記録の書き漏れ。別の記録で確認済み）。</li>
          <li>赤の文がすべて処理され、理由が埋まると「出す」を押せます。黄は未処理でも出せますが、件数が検査記録に残ります。</li>
          <li>「出す」を押すと検査記録が出ます。ブラウザの印刷で紙に出せます。入力した内容は保存しません。</li>
        </ol>
      </section>

      <JudgementView
        records={records}
        sentences={sentences}
        judgements={judgements}
        renderExtra={(s, raw) => {
          const j = raw ?? judgementFor(s.id, judgements);
          if (!needsDecision(j.verdict)) return null;
          const d = decisions[s.id];
          const after = processedText(s, j, d);
          return (
            <div className={`decision ${d ? "decided" : isRed(j.verdict) ? "pending-red" : "pending"}`}>
              <fieldset>
                <legend>この文の処理{isRed(j.verdict) ? "（必須）" : ""}</legend>
                {actionsFor(j).map((a) => (
                  <label key={a} className="choice">
                    <input type="radio" name={`d-${s.id}`} value={a} checked={d?.action === a} onChange={() => choose(s.id, a)} />
                    {ACTION_LABEL[a]}
                  </label>
                ))}
              </fieldset>
              {d?.action === "残す" && (
                <label className="reason">
                  <span>残す理由（必須）</span>
                  <input
                    type="text"
                    value={d.reason ?? ""}
                    onChange={(e) => setReason(s.id, e.target.value)}
                    placeholder="記録の書き漏れ。別の記録で確認済み"
                    aria-invalid={!d.reason?.trim()}
                  />
                </label>
              )}
              {d && (
                <p className="after">
                  処理後：{after === null ? <span className="removed">（この文を削ります）</span> : `「${after}」`}
                </p>
              )}
            </div>
          );
        }}
      />

      <section className="final-box" aria-labelledby="final-title">
        <h2 id="final-title">処理後の報告書</h2>
        <p className="final-text">{report || "（すべての文を削りました）"}</p>
      </section>

      <section className="names-box" aria-labelledby="names-title">
        <h2 id="names-title">検査記録に載せる名前</h2>
        <div className="names">
          <label><span>作成者</span><input type="text" value={creator} onChange={(e) => setCreator(e.target.value)} /></label>
          <label><span>確認者</span><input type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></label>
          <label>
            <span>確認者の役割</span>
            <select value={reviewerRole} onChange={(e) => setReviewerRole(e.target.value as (typeof ROLES)[number])}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <p className="muted">架空の名前だけを入れてください。</p>
      </section>

      <section className="issue-bar" aria-live="polite">
        <button type="button" className="button" onClick={issue} disabled={!g.canIssue}>出す</button>
        <div>
          {guardMessage(g).map((m) => <p key={m} className="guard">{m}</p>)}
          {g.canIssue && <p className="muted">赤の文はすべて処理されました。</p>}
          {g.yellowPending.length > 0 && <p className="muted">黄の未処理{g.yellowPending.length}件は、件数を検査記録に残します。</p>}
        </div>
      </section>
    </>
  );
}

function IssueRecord({
  records,
  sentences,
  judgements,
  decisions,
  meta,
  isSample,
  title,
  report,
  issuedAt,
  creator,
  reviewer,
  reviewerRole,
  yellowPending,
  onBack,
}: {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  decisions: Record<string, Decision>;
  meta: JudgeRunMeta | null;
  isSample: boolean;
  title: string;
  report: string;
  issuedAt: string;
  creator: string;
  reviewer: string;
  reviewerRole: string;
  yellowPending: number;
  onBack: () => void;
}) {
  const counts = new Map<Verdict, number>();
  for (const s of sentences) {
    const v = judgementFor(s.id, judgements).verdict;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const judgedAt = meta ? new Date(meta.judgedAt).toLocaleString("ja-JP", { dateStyle: "long", timeStyle: "short" }) : "";

  return (
    <article className="issue-record">
      <div className="no-print issue-actions">
        <button type="button" className="button button-sub" onClick={onBack}>照合の画面に戻る</button>
        <button type="button" className="button" onClick={() => window.print()}>印刷する</button>
        <p className="muted">戻ると、選んだ処理はそのまま残っています。この記録は保存しません。</p>
      </div>

      {isSample && <p className="sample-badge">架空の見本</p>}
      <h1>検査記録</h1>
      <p className="record-disclaimer">これは内容の正しさの証明ではなく、確認の記録です。</p>

      <dl className="record-meta">
        <dt>対象</dt><dd>{title}（訪問記録{records.length}件・下書き{sentences.length}文）</dd>
        <dt>作成者</dt><dd>{creator || "（未記入）"}</dd>
        <dt>確認者</dt><dd>{reviewer || "（未記入）"}（{reviewerRole}）</dd>
        <dt>日時</dt><dd>{issuedAt}</dd>
        <dt>判定</dt>
        <dd>{meta ? `AIの検査役（${meta.model}）が ${judgedAt} に判定` : "人が付けた正解の判定（AIの判定は未保存）"}</dd>
      </dl>

      <h2>判定ごとの件数</h2>
      <table className="record-counts">
        <thead><tr>{VERDICTS.map((v) => <th key={v}>{v}</th>)}</tr></thead>
        <tbody><tr>{VERDICTS.map((v) => <td key={v}>{counts.get(v) ?? 0}</td>)}</tr></tbody>
      </table>
      <p>黄（言い換え）の未処理：{yellowPending}件</p>

      <h2>文ごとの判定と処理</h2>
      <ol className="record-sentences">
        {sentences.map((s) => {
          const j = judgementFor(s.id, judgements);
          const d = decisions[s.id];
          return (
            <li key={s.id}>
              <p className="record-sentence-head">
                <span className="sid">{s.id}</span>
                <span className={tagClass[j.verdict]}>{j.verdict}</span>
                <span>根拠の記録番号：{j.evidenceIds.length ? j.evidenceIds.join("・") : "なし"}</span>
              </p>
              <p>文：{s.text}</p>
              <p>処理：{needsDecision(j.verdict) ? (d ? ACTION_LABEL[d.action] : "未処理") : "処理なし（一致）"}</p>
              {d?.action === "残す" && <p>理由：{d.reason}</p>}
            </li>
          );
        })}
      </ol>

      <h2>処理後の報告書</h2>
      <p className="final-text">{report || "（すべての文を削りました）"}</p>

      {isSample && <p className="sample-badge">架空の見本</p>}
    </article>
  );
}
