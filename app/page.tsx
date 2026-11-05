import Link from "next/link";
import { Fragment } from "react";
import { fixtureCases } from "@/lib/fixtures";
import { runModeOpenNow } from "@/lib/runModeServer";

// 入口の「流れ」の帯。上段はこの公開版でできること、下段は現場で使う時の流れ（この版では作っていない）
const FLOW_NOW = [
  "見本の文が入った欄（架空の訪問記録と下書き）",
  "「照合する」を押す",
  "保存済みの判定が出る（公開版ではAIを呼ばない）",
  "赤い文を処理",
  "出す・本文をコピー",
];
const FLOW_FIELD = [
  "記録ソフト（外のサービス）にある1か月分の訪問記録 と 生成AIで書いた下書き",
  "人がコピーして貼る（いまは貼り付けだけ。記録ソフトとの自動の取り込みは無い）",
  "照合・処理",
  "検査記録",
];

function FlowSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="flow-steps">
      {steps.map((step, i) => (
        <Fragment key={step}>
          {i > 0 && <li className="flow-arrow" aria-hidden="true" />}
          <li className="flow-step">{step}</li>
        </Fragment>
      ))}
    </ol>
  );
}

export default async function Home() {
  const runOpen = await runModeOpenNow();
  return (
    <main className="page">
      <header className="hero">
        <h1 className="brand">URADORI</h1>
        <p className="brand-reading">ウラドリ ＝ 裏取り</p>
        <p className="lead">
          訪問看護ステーションが毎月、主治医に出す『訪問看護報告書』。生成AIが書いた下書きを、1か月分の訪問記録と1文ずつ見比べ、記録に無い文に印を付けます。赤い印が残っている間は出せません。
        </p>
        <p className="muted lead-sub">下書きは、別の生成AIや人が書いた物を貼ります。この道具は下書きを書きません。</p>
        <p className="start">
          <Link href="/check?case=01" className="button button-big">見本01を開いて試す（約3分）</Link>
        </p>
        <p className="notice-strip">
          架空の内容だけで試せます。利用者さんの情報は入れないでください。診断・治療の助言はしません。入力は保存しません。
          {runOpen && "（実行モードでは、照合のため Anthropic社のAPIへ送ります）"}
        </p>
      </header>

      <section className="flow" aria-labelledby="flow-title">
        <h2 id="flow-title">流れ</h2>
        <div className="flow-row">
          <h3>この公開版でできること</h3>
          <FlowSteps steps={FLOW_NOW} />
        </div>
        <div className="flow-row flow-future">
          <h3>
            現場で使う時の流れ <span className="flow-badge">この版では作っていません</span>
          </h3>
          <FlowSteps steps={FLOW_FIELD} />
          <p className="muted flow-aside">報告書そのものは、記録ソフト側で主治医へ出します（この道具からは出しません）。</p>
        </div>
        <p className="muted">
          本物の記録を扱うには、利用者を限った入口（ログイン）・氏名などを消す仕組み・個人情報の取り決めが別に要ります。公開版は見本だけです。
        </p>
      </section>

      <section aria-labelledby="howto-title">
        <h2 id="howto-title">使い方</h2>
        <ol className="steps">
          <li><span>1</span>見本を開くと、①訪問記録と②下書きの欄に架空の文が入っています。「照合する」を押すと、文ごとの印（判定）が出ます</li>
          <li><span>2</span>赤い印の文を「記録の言葉に戻す／削る／確認して残す」から選んで直します。赤い印は誤りという意味ではなく、確認が要るという印です</li>
          <li><span>3</span>赤が無くなったら「出す」で検査記録ができます。直した本文はコピーでき、検査記録は印刷できます</li>
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
          公開版で照合できるのは見本の文だけで、同じ文に対して前もって付けた判定を返します（AIは呼びません）。自分で書いた文をAIに照合させる実行モードは、公開版では止めています。
          <br />
          誰でも文を貼れる形は、本物の記録が入りうるため、認証なしでは公開しない決まりにしました。手元で動かす手順はREADMEにあります。
        </p>
      )}

      <footer className="footer muted">
        架空のデータだけで作った見本です。表示は内容の正しさの証明ではなく、確認のための目印です。
      </footer>
    </main>
  );
}
