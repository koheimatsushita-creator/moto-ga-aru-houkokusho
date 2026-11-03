// 個人情報の形の検出。画面（送信前）とサーバーの両方で使う。
// 架空の内容に書き換えてもらうための目印で、見つけたら送信しない。

// 「◯◯さん」「◯◯様」のうち、人を指さない語・架空の呼び名は許す
const HONORIFIC_OK = /^(利用者[A-EＡ-Ｅ]|ご?家族|ご?本人|ご?主人|奥|娘|息子|お子|長女|次女|三女|長男|次男|三男|子|嫁|孫|ヘルパー|ケアマネ|ケアマネジャー|看護師|主治医|先生|医者|訪問者|皆)$/;

const PATTERNS: { label: string; test: (line: string) => boolean }[] = [
  {
    label: "氏名",
    test: (line) => {
      const stripped = line.replace(/利用者[A-EＡ-Ｅ]/g, "");
      for (const m of stripped.matchAll(/([一-龯々ァ-ヶー]{1,8})(さん|様|さま|氏)/g)) {
        if (!HONORIFIC_OK.test(m[1])) return true;
      }
      return false;
    },
  },
  {
    label: "電話番号",
    test: (line) => /(?<!\d)0\d{9,10}(?!\d)|(?<!\d)0\d{1,4}[-‐－ー]\d{1,4}[-‐－ー]\d{3,4}(?!\d)/.test(line),
  },
  { label: "郵便番号", test: (line) => /〒|(?<![\d-])\d{3}[-‐－]\d{4}(?![\d-])/.test(line) },
  {
    label: "住所",
    test: (line) => /[都道府県][一-龯ぁ-んァ-ヶ]{1,10}[市区町村郡]|\d+丁目|\d+番地|(?<![\d-])(?!0|(19|20)\d{2}-)\d{1,4}-\d{1,4}-\d{1,4}(?![\d-])/.test(line),
  },
  {
    label: "生年月日",
    test: (line) => /生年月日|(明治|大正|昭和|平成)\s*\d{1,2}年|(19|20)\d{2}年\d{1,2}月\d{1,2}日生/.test(line),
  },
];

export type PiiHit = { line: number; label: string };

export function findPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const p of PATTERNS) if (p.test(line)) hits.push({ line: i + 1, label: p.label });
  });
  return hits;
}

export function piiMessage(hits: PiiHit[], where: string): string {
  const lines = [...new Set(hits.map((h) => h.line))].join("・");
  return `${where}に、氏名・電話番号・住所のように見える箇所があります（${lines}行目）。架空の内容に書き換えてください。`;
}
