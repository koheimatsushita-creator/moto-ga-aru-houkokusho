import Link from "next/link";

// 実行モードを閉じている時に /check（見本を選ばずに開いた時）で出す説明。押せないボタンは置かない。
export function RunModeClosed() {
  return (
    <div className="closed-box">
      <p><strong>公開版では、見本の文だけ照合できます（AIを呼ばないためです）。</strong></p>
      <p>
        見本を開くと、①訪問記録と②下書きの欄に架空の文が入っています。「照合する」を押すと、同じ文に対して前もって付けた判定が出て、赤い文の処理・出す・本文のコピーまで一通り試せます。
      </p>
      <p className="muted">
        自分で書いた文をAIに照合させる実行モードは、このリポジトリを手元で動かし、自分のClaude APIの鍵を入れると使えます。手順はREADMEにあります。
      </p>
      <p><Link href="/check?case=01" className="button">見本01を開いて試す</Link></p>
    </div>
  );
}
