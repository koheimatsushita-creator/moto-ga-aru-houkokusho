import Link from "next/link";
import { RUN_MODE_CLOSED_MESSAGE } from "@/lib/runMode";

// 実行モードを閉じている時に /check（見本を選ばずに開いた時）で出す説明。押せないボタンは置かない。
export function RunModeClosed() {
  return (
    <div className="closed-box">
      <p><strong>{RUN_MODE_CLOSED_MESSAGE}</strong></p>
      <p>
        見本5組では、AIが前もって判定した結果を使って、照合・文ごとの処理・出す（検査記録の印刷）まで一通り試せます。
      </p>
      <p className="muted">
        実行モード（自分で文を貼ってAIに照合させる形）は、このリポジトリを手元で動かし、自分のClaude APIの鍵を入れると使えます。手順はREADMEにあります。
      </p>
      <p><Link href="/check?case=01" className="button">見本01を開いて試す</Link></p>
    </div>
  );
}
