import Link from "next/link";
import { JudgementView } from "@/components/JudgementView";
import { fixtureCases } from "@/lib/fixtures";
import { splitSentences } from "@/lib/split";
import { RunMode } from "./RunMode";

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { case: caseId } = await searchParams;
  const c = fixtureCases.find((f) => f.id === caseId);

  if (!c) {
    return (
      <main className="page page-wide">
        <p><Link href="/">← 入口へ戻る</Link></p>
        <h1>照合（実行モード）</h1>
        <p className="muted">
          架空の訪問記録と下書きを貼ると、AIの検査役が文ごとに判定します。入力は合わせて4,000字まで、1日30回までです。
        </p>
        <RunMode />
      </main>
    );
  }

  // 検査役を回した結果があればそれを、無ければ人が付けた正解を表示する（どちらかを画面に明記する）。
  const fromSaved = c.savedJudgements.length > 0;
  const sentences = splitSentences(c.draft);

  return (
    <main className="page page-wide">
      <p><Link href="/">← 入口へ戻る</Link></p>
      <p className="sample-badge">架空の見本</p>
      <h1>見本{c.id}：{c.title}</h1>
      <p className="muted">
        {c.subject}・{c.period}・訪問記録{c.records.length}件・下書き{sentences.length}文
      </p>
      <p className="source-note">
        {fromSaved && c.savedMeta
          ? `AIの検査役（${c.savedMeta.model}）が ${c.savedMeta.judgedAt.slice(0, 10)} に実際に判定し、保存しておいた結果です。`
          : "AIの検査役の結果はまだ保存していません。いまは人が付けた正解の判定を表示しています。"}
        記録に無い＝誤りではなく、確認が要るという印です。
      </p>
      <JudgementView records={c.records} sentences={sentences} judgements={fromSaved ? c.savedJudgements : c.expected} />
      <p><span className="button disabled" aria-disabled="true">処理を選んで出す（準備中）</span></p>
    </main>
  );
}
