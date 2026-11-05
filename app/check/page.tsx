import Link from "next/link";
import { ReviewFlow } from "@/components/ReviewFlow";
import { RunModeClosed } from "@/components/RunModeClosed";
import { fixtureCases } from "@/lib/fixtures";
import { runModeOpenNow } from "@/lib/runModeServer";
import { splitSentences } from "@/lib/split";
import { RunMode } from "./RunMode";

// 「2026年11月4日」の形（日本時間）
const judgedDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { case: caseId } = await searchParams;
  const c = fixtureCases.find((f) => f.id === caseId);

  if (!c && !(await runModeOpenNow())) {
    return (
      <main className="page">
        <p><Link href="/">← 入口へ戻る</Link></p>
        <h1>照合（実行モード）</h1>
        <RunModeClosed />
      </main>
    );
  }

  if (!c) {
    return (
      <main className="page page-wide">
        <p className="no-print"><Link href="/">← 入口へ戻る</Link></p>
        <h1 className="no-print">照合（実行モード）</h1>
        <p className="muted no-print">
          架空の訪問記録と下書きを貼ると、AIの検査役が文ごとに判定します。入力は合わせて4,000字まで、全体で1日30回まで、同じ接続元からは1分に3回までです。
        </p>
        <RunMode />
      </main>
    );
  }

  // 検査役を回した結果があればそれを、無ければ正解（expected）を表示する（どちらかを画面に明記する）。
  const fromSaved = c.savedJudgements.length > 0;
  const sentences = splitSentences(c.draft);

  const meta = fromSaved && c.savedMeta ? c.savedMeta : null;

  return (
    <main className="page page-wide">
      <ReviewFlow
        records={c.records}
        sentences={sentences}
        judgements={fromSaved ? c.savedJudgements : c.expected}
        meta={meta}
        isSample
        title={`見本${c.id}：${c.title}`}
        header={
          <>
            <p className="no-print"><Link href="/">← 入口へ戻る</Link></p>
            <p className="sample-badge">架空の見本</p>
            <h1>見本{c.id}：{c.title}</h1>
            <p className="muted">
              {c.subject}・{c.period}・訪問記録{c.records.length}件・下書き{sentences.length}文
            </p>
            <p className="muted">
              {meta
                ? `この見本の判定（文ごとに付いた印）は、AI（Claude）が${judgedDate(meta.judgedAt)}に行ったものを保存してあります。`
                : "この見本では、開発に使ったClaudeが付けた正解（看護の専門職は未確認）を表示しています。"}
              記録に無い＝誤りではなく、確認が要るという印です。
            </p>
          </>
        }
      />
    </main>
  );
}
