"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { JudgementView, tagClass } from "@/components/JudgementView";
import { jumpTo, sentenceElementId } from "@/lib/jump";
import { ACTION_LABEL, actionsFor, finalReport, guard, isRed, judgementFor, needsDecision, processedText } from "@/lib/review";
import type { Decision, Judgement, JudgeRunMeta, Sentence, Verdict, VisitRecord } from "@/lib/types";

const VERDICTS: Verdict[] = ["一致", "言い換え", "根拠なし", "反する"];
const ROLES = ["管理者", "経営者"] as const;

// 選ぶ前から「選ぶとどうなるか」が分かるように、選択肢ごとに1行添える
function actionHint(action: Decision["action"], j: Judgement): string {
  if (action === "戻す") return `記録の文「${j.evidenceQuote.replace(/\s*\n\s*/g, "")}」に差し替えます`;
  if (action === "削る") return "この文を報告書から消します";
  return "理由を書いて、この文をそのまま残します（記録の書き漏れなら、先に記録を直す方が確実です）";
}

// 文の番号を押すと、その文へ移動する
function SentenceLinks({ ids }: { ids: string[] }) {
  return (
    <>
      （
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && "・"}
          <button type="button" className="link-button" onClick={() => jumpTo(sentenceElementId(id))}>{id}</button>
        </span>
      ))}
      ）
    </>
  );
}

// 照合 → 文ごとの処理 → 出す（検査記録）。状態は画面の中だけに持ち、保存しない。
export function ReviewFlow({
  records,
  sentences,
  judgements,
  meta,
  isSample,
  title,
  header,
  onViewChange,
}: {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  meta: JudgeRunMeta | null; // null は正解（expected）を表示している時
  isSample: boolean;
  title: string;
  header?: ReactNode; // 照合の画面でだけ出す見出し
  onViewChange?: (view: "check" | "issue") => void; // 手順の帯に「いまの段」を知らせる
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [view, setView] = useState<"check" | "issue">("check");
  const [creator, setCreator] = useState(isSample ? "架空の職員A" : "");
  const [reviewer, setReviewer] = useState(isSample ? "架空の職員B" : "");
  const [reviewerRole, setReviewerRole] = useState<(typeof ROLES)[number]>("管理者");
  const [issuedAt, setIssuedAt] = useState("");

  const g = guard(sentences, judgements, decisions);
  // 実行モードでは確認者の名前が要る（見本モードは例の名前が入っている）
  const reviewerMissing = !isSample && !reviewer.trim();
  const canIssue = g.canIssue && !reviewerMissing;
  const report = finalReport(sentences, judgements, decisions);
  const redCount = sentences.filter((s) => isRed(judgementFor(s.id, judgements).verdict)).length;
  const firstRedPending = g.redPending[0] ?? g.reasonMissing[0];

  function choose(sentenceId: string, action: Decision["action"]) {
    setDecisions((prev) => ({ ...prev, [sentenceId]: { sentenceId, action, reason: prev[sentenceId]?.reason } }));
  }
  function setReason(sentenceId: string, reason: string) {
    setDecisions((prev) => ({ ...prev, [sentenceId]: { ...prev[sentenceId], reason } }));
  }
  function issue() {
    if (!canIssue) return;
    setIssuedAt(new Date().toLocaleString("ja-JP", { dateStyle: "long", timeStyle: "short" }));
    setView("issue");
    onViewChange?.("issue");
    window.scrollTo(0, 0);
  }

  if (view === "issue") {
    return (
      <IssueRecord
        {...{ records, sentences, judgements, decisions, meta, isSample, title, report, issuedAt, creator, reviewer, reviewerRole }}
        yellowPending={g.yellowPending.length}
        onBack={() => {
          setView("check");
          onViewChange?.("check");
        }}
      />
    );
  }

  return (
    <>
      {header}
      <section className="todo-box" aria-labelledby="todo-title">
        <div>
          <h2 id="todo-title">この画面ですること</h2>
          <ul>
            <li>
              {redCount > 0
                ? `赤い印の文（${isSample ? "この見本" : "今回"}では${redCount}件）は、出す前に必ず『どうするか』を3つから選びます。黄は任意です。`
                : `赤い印の文は${isSample ? "この見本" : "今回"}にはありません。黄は任意です。`}
            </li>
            <li>各文の下で「記録の言葉に戻す／削る／確認して残す」を選びます。選び直せます。</li>
            <li>赤が0になったら、下の『出す』で検査記録ができます。</li>
          </ul>
        </div>
        {redCount > 0 && (
          <button
            type="button"
            className="button"
            onClick={() => jumpTo(sentenceElementId(firstRedPending ?? sentences.find((s) => isRed(judgementFor(s.id, judgements).verdict))!.id))}
          >
            {firstRedPending ? "最初の赤い文へ" : "赤い文へ（処理済み）"}
          </button>
        )}
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
                <legend>この文をどうしますか{isRed(j.verdict) ? "（赤：必須）" : "（黄：任意）"}</legend>
                {actionsFor(j).map((a) => (
                  <label key={a} className="choice">
                    <input type="radio" name={`d-${s.id}`} value={a} checked={d?.action === a} onChange={() => choose(s.id, a)} />
                    <span>
                      <span className="choice-label">{ACTION_LABEL[a]}</span>
                      <span className="choice-hint">{actionHint(a, j)}</span>
                    </span>
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
        <p className="muted">選ぶたびに書き換わります。赤の文が残っている間は、まだ出せません。</p>
        <p className="final-text">{report || "（すべての文を削りました）"}</p>
        <CopyButton text={report} />
      </section>

      <section className="names-box" aria-labelledby="names-title">
        <h2 id="names-title">検査記録に載せる名前</h2>
        <p className="muted">
          誰が確認したかを検査記録に残します（{isSample ? "架空の名前のまま進めて構いません" : "架空の名前だけを入れてください"}）。
        </p>
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
      </section>

      <section className="issue-bar" aria-live="polite">
        <button type="button" className="button" onClick={issue} disabled={!canIssue}>出す</button>
        <div>
          {g.redPending.length > 0 && (
            <p className="guard">赤の文 あと{g.redPending.length}件<SentenceLinks ids={g.redPending} /></p>
          )}
          {g.reasonMissing.length > 0 && (
            <p className="guard">「確認して残す」の理由が空 あと{g.reasonMissing.length}件<SentenceLinks ids={g.reasonMissing} /></p>
          )}
          {reviewerMissing && <p className="guard">確認者の名前が空です。</p>}
          {g.canIssue && redCount > 0 && <p className="done">赤の文は処理済みです。出せます</p>}
          {g.yellowPending.length > 0 && (
            <p className="muted">黄色の文は処理しなくても出せます。処理しなかった件数は、検査記録に『そのまま残した言い換え：{g.yellowPending.length}件』と残ります。</p>
          )}
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
  const machineFixed = sentences.filter((s) => judgementFor(s.id, judgements).machineNote).length;
  const judgedAt = meta ? new Date(meta.judgedAt).toLocaleString("ja-JP", { dateStyle: "long", timeStyle: "short" }) : "";

  return (
    <article className="issue-record">
      <NextSteps onBack={onBack} lead />

      {isSample && <p className="sample-badge">架空の見本</p>}
      <h1>検査記録</h1>
      <p className="record-disclaimer">これは内容の正しさの証明ではなく、確認の記録です。</p>

      <dl className="record-meta">
        <dt>対象</dt><dd>{title}（訪問記録{records.length}件・下書き{sentences.length}文）</dd>
        <dt>作成者</dt><dd>{creator || "（未記入）"}</dd>
        <dt>確認者</dt><dd>{reviewer || "（未記入）"}（{reviewerRole}）</dd>
        <dt>日時</dt><dd>{issuedAt}</dd>
        <dt>判定</dt>
        <dd>{meta ? `AIの検査役（${meta.model}）が ${judgedAt} に判定` : "開発に使ったClaudeが付けた正解（AIの検査役の判定は未保存）"}</dd>
        <dt>サーバー側の検査で直した文</dt>
        <dd>
          {machineFixed}件{machineFixed === 0 && meta && "（引用はすべて記録に一字一句ありました）"}
        </dd>
      </dl>

      <h2>判定ごとの件数</h2>
      <table className="record-counts">
        <thead><tr>{VERDICTS.map((v) => <th key={v}>{v}</th>)}</tr></thead>
        <tbody><tr>{VERDICTS.map((v) => <td key={v}>{counts.get(v) ?? 0}</td>)}</tr></tbody>
      </table>
      <p>黄（言い換え）をそのまま残した数：{yellowPending}件</p>

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
              <p>
                処理：{needsDecision(j.verdict) ? (d ? ACTION_LABEL[d.action] : "そのまま") : "処理なし（一致）"}
                {d?.action === "戻す" && `（戻した後の文：「${processedText(s, j, d)}」）`}
              </p>
              {d?.action === "残す" && <p>理由：{d.reason}</p>}
            </li>
          );
        })}
      </ol>

      <h2>処理後の報告書</h2>
      <p className="final-text">{report || "（すべての文を削りました）"}</p>
      <CopyButton text={report} />

      {isSample && <p className="sample-badge">架空の見本</p>}

      <NextSteps onBack={onBack} />
    </article>
  );
}

// 出した後にできること。検査記録の先頭と末尾に同じ物を置く（印刷には出さない）
function NextSteps({ onBack, lead = false }: { onBack: () => void; lead?: boolean }) {
  return (
    <div className="no-print next-steps">
      {lead && <p className="done-line">確認が終わりました。</p>}
      {lead && <p>主治医への提出はまだです。直した本文は、記録ソフトの報告書の欄に貼って出します。</p>}
      <div className="next-buttons">
        <button type="button" className="button" onClick={() => window.print()}>印刷する</button>
        <button type="button" className="button button-sub" onClick={onBack}>さっきの画面に戻る（選んだ内容は残っています）</button>
        <Link href="/" className="button button-sub">別の見本を試す（入口へ。この記録は消えます）</Link>
      </div>
      {lead && <p className="muted">この記録は保存しません。</p>}
    </div>
  );
}
