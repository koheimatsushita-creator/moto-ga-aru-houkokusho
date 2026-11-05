import Link from "next/link";
import { RunModeClosed } from "@/components/RunModeClosed";
import { fixtureCases } from "@/lib/fixtures";
import { runModeOpenNow } from "@/lib/runModeServer";
import { serializeRecords } from "@/lib/samples";
import { RunMode } from "./RunMode";

// 照合の画面。見本を選んだ時も、結果からではなく「貼る→照合する」の手順から始める。
export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { case: caseId } = await searchParams;
  const c = fixtureCases.find((f) => f.id === caseId);
  const runOpen = await runModeOpenNow();

  if (!c && !runOpen) {
    return (
      <main className="page">
        <p><Link href="/">← 入口へ戻る</Link></p>
        <h1>照合</h1>
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
          架空の訪問記録と下書きを貼ると、AIの検査役が文ごとに印（判定）を付けます。入力は合わせて4,000字まで、全体で1日30回まで、同じ接続元からは1分に3回までです。
        </p>
        <RunMode runOpen={runOpen} />
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <p className="no-print"><Link href="/">← 入口へ戻る</Link></p>
      <p className="sample-badge no-print">架空の見本</p>
      <h1 className="no-print">見本{c.id}：{c.title}</h1>
      <p className="muted no-print">
        {c.subject}・{c.period}・訪問記録{c.records.length}件。照合（記録と下書きを1文ずつ見比べること）を、貼るところから試せます。
      </p>
      <RunMode runOpen={runOpen} sample={{ id: c.id, title: c.title, recordText: serializeRecords(c.records), draft: c.draft }} />
    </main>
  );
}
