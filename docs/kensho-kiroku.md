# 検証記録（検査役の判定）

## 条件
- 検査役：claude-opus-5-5、effort medium、max_tokens 4000、55秒で打ち切り、再試行なし
- 指示：lib/judge/prompt.ts。言い換えの例は fixtures/iikae-rei.json の**仮の例**
- 正解：fixtures/case-01〜05.json の expected（開発担当のClaudeが付けた。依頼者の確認はまだ）
- 実行：`npm run dev` を動かしたまま `npm run judge:fixtures`。生の実測は docs/kensho-data/ に保存

## 費用の単価
- 入力 $4 / 100万トークン、出力 $20 / 100万トークン（Claude Opus 5.5、通常の料金。キャッシュ・一括処理は使っていない）
- 出典：https://platform.claude.com/docs/en/about-claude/pricing （2026-11-04 に確認）。約3,000トークンの入力に長文の割増は無い
- 1回の費用 ＝ 入力トークン × 4 ÷ 1,000,000 ＋ 出力トークン × 20 ÷ 1,000,000（ドル）

## 実行の記録

### 2026-11-04 1回目：鍵が受け付けられず、判定できず
| 組 | 結果 | 所要秒数 | 入力トークン | 出力トークン | 費用 |
|---|---|---|---|---|---|
| 01〜05 | API が鍵を受け付けなかった（401） | 各1秒前後 | 0 | 0 | $0 |

- 5組とも同じ理由で失敗。fixtures は書き換わっていない
- 生の記録：docs/kensho-data/judge-run-2026-11-04T03-18-16-149Z.json
- 原因は未確認（.dev.vars の中身は開発担当からは確かめない）
