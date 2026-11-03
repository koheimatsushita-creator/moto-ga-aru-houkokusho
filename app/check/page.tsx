import Link from "next/link";
import { fixtureCases } from "@/lib/fixtures";
import { splitSentences } from "@/lib/split";
import type { Verdict } from "@/lib/types";

const tagClass: Record<Verdict, string> = {
  一致: "tag",
  言い換え: "tag tag-yellow",
  根拠なし: "tag tag-red",
  反する: "tag tag-red tag-strike",
};

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { case: caseId } = await searchParams;
  const c = fixtureCases.find((f) => f.id === caseId);

  if (!c) {
    return (
      <main className="page">
        <p><Link href="/">← 入口へ戻る</Link></p>
        <h1>照合</h1>
        <p>実行モード（貼り付けて照合）は準備中です。入口から見本を選んでください。</p>
      </main>
    );
  }

  // 検査役を回した結果があればそれを、無ければ人が付けた正解を表示する（どちらかを画面に明記する）。
  const fromSaved = c.savedJudgements.length > 0;
  const judgements = fromSaved ? c.savedJudgements : c.expected;
  const sentences = splitSentences(c.draft);
  const counts = new Map<Verdict, number>();
  for (const j of judgements) counts.set(j.verdict, (counts.get(j.verdict) ?? 0) + 1);

  return (
    <main className="page page-wide">
      <p><Link href="/">← 入口へ戻る</Link></p>
      <p className="sample-badge">架空の見本</p>
      <h1>見本{c.id}：{c.title}</h1>
      <p className="muted">
        {c.subject}・{c.period}・訪問記録{c.records.length}件・下書き{sentences.length}文
      </p>
      <p className="source-note">
        {fromSaved
          ? "AIの検査役が実際に判定し、保存しておいた結果です。"
          : "AIの検査役の結果はまだ保存していません。いまは人が付けた正解の判定を表示しています。"}
        記録に無い＝誤りではなく、確認が要るという印です。
      </p>
      <p className="counts">
        {(["一致", "言い換え", "根拠なし", "反する"] as Verdict[]).map((v) => (
          <span key={v}><span className={tagClass[v]}>{v}</span> {counts.get(v) ?? 0}</span>
        ))}
      </p>

      <div className="check-grid">
        <section aria-labelledby="records-title">
          <h2 id="records-title">訪問記録</h2>
          {c.records.map((r) => (
            <article key={r.id} id={r.id} className="record">
              <h3><span className="rec-id">{r.id}</span>{r.date}・{r.staffRole}</h3>
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
                </li>
              );
            })}
          </ol>
          <p><span className="button disabled" aria-disabled="true">処理を選んで出す（準備中）</span></p>
        </section>
      </div>
    </main>
  );
}
