import Link from "next/link";
import { fixtureCases } from "@/lib/fixtures";
import { runModeOpenNow } from "@/lib/runModeServer";

export default async function Home() {
  const runOpen = await runModeOpenNow();
  return (
    <main className="page">
      <header className="hero">
        <h1>もとがある報告書</h1>
        <p className="lead">AIが書いた報告書の下書きを、訪問記録と文ごとに見比べ、記録に無い文に印を付けます</p>
        <p className="start">
          <Link href="/check?case=01" className="button button-big">見本01を開いて試す（約3分）</Link>
        </p>
        <p className="notice-strip">
          架空の内容だけで試せます。利用者さんの情報は入れないでください。診断・治療の助言はしません。入力は保存しません。
          {runOpen && "（実行モードでは、照合のため Anthropic社のAPIへ送ります）"}
        </p>
      </header>

      <section aria-labelledby="howto-title">
        <h2 id="howto-title">使い方</h2>
        <ol className="steps">
          <li><span>1</span>見本を開くと、左に訪問記録、右に下書きの文ごとの印（判定）が並びます</li>
          <li><span>2</span>赤い印の文を「記録の言葉に戻す／削る／確認して残す」から選んで直します。赤い印は誤りという意味ではなく、確認が要るという印です</li>
          <li><span>3</span>赤が無くなったら「出す」で検査記録ができ、印刷できます</li>
        </ol>
      </section>

      <section aria-labelledby="sample-title">
        <h2 id="sample-title">ほかの見本（架空の5組）</h2>
        <p className="muted">どれもAIが前もって印を付けた結果を表示します。ログインは要りません。</p>
        <ul className="cases">
          {fixtureCases.map((c) => (
            <li key={c.id}>
              <Link href={`/check?case=${c.id}`}>
                <span className="case-no">見本{c.id}</span>
                <span className="case-title">{c.title}</span>
                <span className="muted">
                  {c.subject}・{c.period}・訪問記録{c.records.length}件
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {runOpen ? (
        <section aria-labelledby="run-title">
          <h2 id="run-title">実行モード（自分で文を貼ってAIに照合させる）</h2>
          <p className="muted">
            架空の訪問記録と下書きを貼って、AIに照合させます（入力は4,000字まで、全体で1日30回まで、同じ接続元からは1分に3回まで）。
            送る前に、氏名・電話・住所などの形を見つけたら送信を止めます。これは形で見分ける目印で、全部は止められません。
          </p>
          <p><Link href="/check" className="button">実行モードへ</Link></p>
        </section>
      ) : (
        <p className="muted run-closed-note">
          自分で文を貼ってAIに照合させる実行モードは、公開版では止めています。
          <br />
          手元で動かす手順はREADMEにあります。
        </p>
      )}

      <footer className="footer muted">
        架空のデータだけで作った見本です。表示は内容の正しさの証明ではなく、確認のための目印です。
      </footer>
    </main>
  );
}
