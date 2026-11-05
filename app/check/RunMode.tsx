"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReviewFlow } from "@/components/ReviewFlow";
import { parseRecords } from "@/lib/parseRecords";
import { findPii, piiMessage } from "@/lib/pii";
import { normalizeText } from "@/lib/samples";
import { splitSentences } from "@/lib/split";
import type { Judgement, JudgeRunMeta, Sentence, VisitRecord } from "@/lib/types";

const MAX_CHARS = 4000;
const STEPS = ["訪問記録を貼る", "下書きを貼る", "照合する", "赤い文を処理する", "出す"];
const PROGRESS = ["文に分けています", "Claude（検査役）に渡しています", "引用を確かめています"];

type Result = {
  records: VisitRecord[];
  sentences: Sentence[];
  judgements: Judgement[];
  meta: JudgeRunMeta;
  source: "saved" | "live";
  seconds: number;
  isSample: boolean;
};

export type SampleText = { id: string; title: string; recordText: string; draft: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });

// 手順の帯：① 訪問記録を貼る → ② 下書きを貼る → ③ 照合する → ④ 赤い文を処理する → ⑤ 出す
function StepBar({ current }: { current: number }) {
  return (
    <ol className="step-bar" aria-label="手順">
      {STEPS.map((label, i) => (
        <li key={label} className={i === current ? "now" : i < current ? "done" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="step-no">{"①②③④⑤"[i]}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

// 照合する画面。見本では、記録ソフトからコピーして貼った想定の架空の文が最初から入っている。
// 公開版（実行モードを閉じている時）は、見本の文と同じなら保存済みの判定が返る（AIは呼ばない）。
export function RunMode({ sample, runOpen }: { sample?: SampleText; runOpen: boolean }) {
  const [recordText, setRecordText] = useState(sample?.recordText ?? "");
  const [draft, setDraft] = useState(sample?.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(-1);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [issued, setIssued] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const total = recordText.length + draft.length;
  const current = result ? (issued ? 4 : 3) : !recordText.trim() ? 0 : !draft.trim() ? 1 : 2;

  useEffect(() => {
    if (result) topRef.current?.scrollIntoView({ block: "start" });
  }, [result]);

  function resetToSample() {
    if (!sample) return;
    setRecordText(sample.recordText);
    setDraft(sample.draft);
    setError(null);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    // 送信前の検査。見つけたら送らない（入力は消さない）
    const recordHits = findPii(recordText);
    const draftHits = findPii(draft);
    if (recordHits.length || draftHits.length) {
      setError({
        message: [recordHits.length && piiMessage(recordHits, "訪問記録"), draftHits.length && piiMessage(draftHits, "下書き")]
          .filter(Boolean)
          .join(" "),
      });
      return;
    }
    const records = parseRecords(recordText);
    const sentences = splitSentences(draft);
    if (!records.length || !sentences.length) {
      setError({ message: "訪問記録と下書きの両方を入れてください。" });
      return;
    }

    setBusy(true);
    setProgress(0);
    const started = Date.now();
    const step2 = setTimeout(() => setProgress(1), 600);
    try {
      // 進み具合を見せる：保存済みの時も合わせて1.5〜2秒。AIを呼ぶ時は、答えが来るまで2つ目のまま
      const [res] = await Promise.all([
        fetch("/api/judge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records, draft }) }),
        wait(1200),
      ]);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: body.message ?? "照合できませんでした。入力を短くするか、見本の文でお試しください。", code: body.code });
        return;
      }
      setProgress(2);
      await wait(600);
      const unchanged = Boolean(sample) && normalizeText(recordText) === normalizeText(sample!.recordText) && normalizeText(draft) === normalizeText(sample!.draft);
      setIssued(false);
      setResult({
        records,
        sentences,
        judgements: body.judgements,
        meta: body.meta,
        source: body.source === "saved" ? "saved" : "live",
        seconds: Math.round((Date.now() - started) / 100) / 10,
        isSample: body.source === "saved" || unchanged,
      });
    } catch {
      setError({ message: "照合できませんでした。通信が切れた可能性があります。少し時間をおいてから、もう一度お試しください。" });
    } finally {
      clearTimeout(step2);
      setBusy(false);
      setProgress(-1);
    }
  }

  if (result) {
    const { meta } = result;
    return (
      <div ref={topRef}>
        <StepBar current={current} />
        {!issued && (
          <p className="no-print">
            <button type="button" className="button button-sub" onClick={() => setResult(null)}>①②の欄に戻る（入力は残っています）</button>
          </p>
        )}
        <ReviewFlow
          records={result.records}
          sentences={result.sentences}
          judgements={result.judgements}
          meta={meta}
          isSample={result.isSample}
          title={sample && result.isSample ? `見本${sample.id}：${sample.title}` : "貼った内容"}
          onViewChange={(v) => setIssued(v === "issue")}
          header={
            <>
              <p className={`result-banner ${result.source}`}>
                {result.source === "saved"
                  ? `この判定は、同じ文に対して Claude（${meta.model}）が${longDate(meta.judgedAt)}に付けた結果を保存した物です。公開版ではAIを呼びません。手元で動かすと、変えた文もその場で照合できます。`
                  : `いま Claude が判定しました（${result.seconds}秒）。`}
              </p>
              <p className="muted">記録に無い＝誤りではなく、確認が要るという印です。</p>
              <details className="claude-did no-print">
                <summary>Claudeがしたこと／していないこと</summary>
                <p>
                  <strong>したこと：</strong>訪問記録と番号つきの文だけを受け取り（下書きを書いたやり取りは渡さない）、文ごとに判定・根拠の記録番号・記録からの引用・理由を、決めた形で返した（{meta.model}、
                  {result.source === "saved" ? longDate(meta.judgedAt) : "いま"}）。
                </p>
                <p>
                  <strong>していないこと：</strong>文を分ける（プログラム）／引用が記録に一字一句あるかの確かめ（サーバー側の検査）／出すかどうかの判断（人）。
                </p>
              </details>
            </>
          }
        />
      </div>
    );
  }

  return (
    <>
      <StepBar current={current} />

      <div className="notice">
        <p><strong>利用者さんの情報は入力しないでください。</strong>架空の内容だけを使ってください。この道具は入力を保存しません。</p>
        {runOpen ? (
          <>
            <p>照合のため、Anthropic社のAPIへ送ります。</p>
            <p className="muted">送る前に、氏名・電話・住所などの形を見つけたら送信を止めます。これは形で見分ける目印で、全部は止められません。</p>
          </>
        ) : (
          <p>公開版ではAIを呼びません。見本の文で「照合する」を押すと、同じ文に対して前もって付けた判定が出ます。</p>
        )}
      </div>

      <div className="run-form">
        {sample && (
          <div className="sample-tools">
            <p>記録ソフトの画面からコピーして貼った想定の文が入っています（架空）。消して貼り直すこともできます。</p>
            <p className="tool-buttons">
              <button type="button" className="button button-sub" onClick={resetToSample} disabled={busy}>見本の文を入れ直す</button>
              <button type="button" className="button button-sub" onClick={() => { setRecordText(""); setDraft(""); setError(null); }} disabled={busy}>空にする</button>
            </p>
          </div>
        )}
        <label>
          <span>① 訪問記録（記録ごとに空行で区切る。1行目に「2026-10-02 看護師」のように書くと日付と職種として読みます）</span>
          <textarea value={recordText} onChange={(e) => setRecordText(e.target.value)} rows={12} disabled={busy} />
        </label>
        <label>
          <span>② 報告書の下書き（生成AIなどで別に書いた物。「。」と改行で文に分けます）</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} disabled={busy} />
        </label>
        <p className={total > MAX_CHARS ? "over" : "muted"}>
          合わせて {total.toLocaleString()} / {MAX_CHARS.toLocaleString()} 字
        </p>
        <p className="submit-row">
          <button className="button button-big" onClick={submit} disabled={busy || !recordText.trim() || !draft.trim() || total > MAX_CHARS}>
            ③ 照合する
          </button>
        </p>
        {busy && (
          <ol className="progress" aria-live="polite">
            {PROGRESS.map((p, i) => (
              <li key={p} className={i === progress ? "now" : i < progress ? "done" : ""}>{p}{i === progress && "…"}</li>
            ))}
          </ol>
        )}
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error.message}</p>
          {sample && error.code === "run_mode_closed" && (
            <p><button type="button" className="button" onClick={resetToSample}>見本の文を入れ直す</button></p>
          )}
          {!sample && ["no_key", "limits_unavailable", "run_mode_closed", "rate_limited_daily", "judge_failed"].includes(error.code ?? "") && (
            <p><Link href="/check?case=01" className="button">見本01を開く</Link></p>
          )}
        </div>
      )}
    </>
  );
}
