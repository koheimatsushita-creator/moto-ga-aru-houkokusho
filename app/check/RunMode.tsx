"use client";

import Link from "next/link";
import { useState } from "react";
import { ReviewFlow } from "@/components/ReviewFlow";
import { parseRecords } from "@/lib/parseRecords";
import { findPii, piiMessage } from "@/lib/pii";
import { splitSentences } from "@/lib/split";
import type { Judgement, JudgeRunMeta, Sentence, VisitRecord } from "@/lib/types";

const MAX_CHARS = 4000;

type Result = { records: VisitRecord[]; sentences: Sentence[]; judgements: Judgement[]; meta: JudgeRunMeta };

export function RunMode() {
  const [recordText, setRecordText] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; toSample?: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const total = recordText.length + draft.length;

  async function submit() {
    setError(null);
    setResult(null);
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
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({
          message: body.message ?? "照合できませんでした。入力を短くするか、見本モードをお試しください。回数には数えません。",
          toSample: body.code === "no_key" || body.code === "rate_limited_daily" || body.code === "judge_failed",
        });
        return;
      }
      setResult({ records, sentences, judgements: body.judgements, meta: body.meta });
    } catch {
      setError({ message: "照合できませんでした。入力を短くするか、見本モードをお試しください。回数には数えません。", toSample: true });
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <>
        <p className="no-print">
          <button type="button" className="button button-sub" onClick={() => setResult(null)}>貼り付けた内容に戻る（入力は残っています）</button>
        </p>
        <ReviewFlow
          records={result.records}
          sentences={result.sentences}
          judgements={result.judgements}
          meta={result.meta}
          isSample={false}
          title="実行モードで貼った内容"
          header={
            <p className="source-note">
              AIの検査役（{result.meta.model}）が判定した結果です。記録に無い＝誤りではなく、確認が要るという印です。
            </p>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="notice">
        <p><strong>利用者さんの情報は入力しないでください。</strong>架空の内容だけを使ってください。入力した内容は保存しません。</p>
      </div>

      <div className="run-form">
        <label>
          <span>訪問記録（記録ごとに空行で区切る。1行目に「2026-10-02 看護師」のように書くと日付と職種として読みます）</span>
          <textarea value={recordText} onChange={(e) => setRecordText(e.target.value)} rows={12} />
        </label>
        <label>
          <span>報告書の下書き（「。」と改行で文に分けます）</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} />
        </label>
        <p className={total > MAX_CHARS ? "over" : "muted"}>
          合わせて {total.toLocaleString()} / {MAX_CHARS.toLocaleString()} 字
        </p>
        <p>
          <button className="button" onClick={submit} disabled={busy || total === 0 || total > MAX_CHARS}>
            {busy ? "照合しています（1分ほどかかることがあります）" : "照合する"}
          </button>
        </p>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error.message}</p>
          {error.toSample && <p><Link href="/check?case=01" className="button">見本モードへ</Link></p>}
        </div>
      )}

    </>
  );
}
