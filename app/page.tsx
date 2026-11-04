import Link from "next/link";
import { RunModeClosed } from "@/components/RunModeClosed";
import { fixtureCases } from "@/lib/fixtures";
import { runModeOpenNow } from "@/lib/runModeServer";

export default async function Home() {
  const runOpen = await runModeOpenNow();
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">訪問看護報告書の下書きを、訪問記録と見比べる道具</p>
        <h1>もとがある報告書</h1>
        <p className="lead">
          報告書の下書きを文ごとに分け、それぞれが訪問記録のどこから来たかを示します。
          記録に見当たらない文や、記録と食い違う文に印を付けるので、確かめるのは印の付いた文だけで済みます。
        </p>
      </header>

      <section className="notice" aria-labelledby="notice-title">
        <h2 id="notice-title">はじめにお読みください</h2>
        <ul>
          <li><strong>利用者さんの情報は入力しないでください。</strong>架空の内容だけを使ってください。</li>
          <li><strong>診断や治療の助言はしません。</strong></li>
          <li><strong>記録に無い＝誤りではなく、確認が要るという印です。</strong>判定は人が画面で直せます。</li>
          <li>この道具は入力を保存しません（画面を閉じると消えます）。{runOpen && "実行モードでは、照合のため、Anthropic社のAPIへ送ります。"}</li>
          {runOpen ? (
            <li>実行モードは全体で1日30回まで、同じ接続元からは1分に3回までです。上限に達しても見本モードは使えます。</li>
          ) : (
            <li>公開版では見本モードだけを動かせます。見本はAIを呼ばず、前もって判定した結果を表示します。</li>
          )}
        </ul>
      </section>

      <section aria-labelledby="howto-title">
        <h2 id="howto-title">使い方</h2>
        <ol className="steps">
          <li><span>1</span>{runOpen ? "見本を1つ選ぶ（または実行モードで架空の記録と下書きを貼る）" : "下の見本を1つ選ぶ"}</li>
          <li><span>2</span>照合の画面で、左の訪問記録と右の文ごとの判定を見比べる</li>
          <li><span>3</span>印の付いた文ごとに「記録の言葉に戻す／削る／確認して残す」を選ぶ</li>
          <li><span>4</span>赤い印が残っていなければ「出す」を押し、検査記録を印刷する</li>
        </ol>
        <table className="legend">
          <thead>
            <tr><th>判定</th><th>意味</th></tr>
          </thead>
          <tbody>
            <tr><td><span className="tag">一致</span></td><td>記録に同じ内容がある</td></tr>
            <tr><td><span className="tag tag-yellow">言い換え</span></td><td>記録の内容を別の言葉にした</td></tr>
            <tr><td><span className="tag tag-red">根拠なし</span></td><td>記録のどこにも見当たらない</td></tr>
            <tr><td><span className="tag tag-red tag-strike">反する</span></td><td>記録と食い違う</td></tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="sample-title">
        <h2 id="sample-title">見本モード（架空の5組）</h2>
        <p className="muted">AIを呼ばずに、保存しておいた判定結果を表示します。ログインは要りません。</p>
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

      <section aria-labelledby="run-title">
        <h2 id="run-title">実行モード（AIでの照合）</h2>
        {runOpen ? (
          <>
            <p className="muted">
              架空の訪問記録と下書きを貼って、AIに照合させます（入力は4,000字まで、全体で1日30回まで、同じ接続元からは1分に3回まで）。
              送る前に、氏名・電話・住所などの形を見つけたら送信を止めます。これは形で見分ける目印で、全部は止められません。
            </p>
            <p><Link href="/check" className="button">実行モードへ</Link></p>
          </>
        ) : (
          <RunModeClosed />
        )}
      </section>

      <footer className="footer muted">
        架空のデータだけで作った見本です。表示は内容の正しさの証明ではなく、確認のための目印です。
      </footer>
    </main>
  );
}
