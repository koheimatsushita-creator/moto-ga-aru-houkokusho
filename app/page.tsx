import Link from "next/link";
import { fixtureCases } from "@/lib/fixtures";

export default function Home() {
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
          <li>入力した内容は保存しません。画面を閉じると消えます。</li>
          <li>実行モードは1日30回までです。上限に達しても見本モードは使えます。</li>
        </ul>
      </section>

      <section aria-labelledby="howto-title">
        <h2 id="howto-title">使い方</h2>
        <ol className="steps">
          <li><span>1</span>見本を1つ選ぶ（または実行モードで架空の記録と下書きを貼る）</li>
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
        <h2 id="run-title">実行モード</h2>
        <p className="muted">
          架空の訪問記録と下書きを貼って、AIに照合させます（入力は4,000字まで、1日30回まで）。
          氏名・電話番号・住所のように見える箇所があると送信しません。
        </p>
        <p><span className="button disabled" aria-disabled="true">準備中</span></p>
      </section>

      <footer className="footer muted">
        架空のデータだけで作った見本です。表示は内容の正しさの証明ではなく、確認のための目印です。
      </footer>
    </main>
  );
}
