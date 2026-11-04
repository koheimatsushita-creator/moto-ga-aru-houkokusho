// 記録と下書きを指示文に入れる前に、区切りの書き込み（<record> や </sentences> など）を無害にする。
// 山かっこを全角にして、指示文の区切りと見分けがつかない書き方をできなくする。
// 確かめ直し（postcheck）でも同じ変換をした記録の本文と引用を比べる。
export function neutralize(text: string): string {
  return text.replace(/</g, "＜").replace(/>/g, "＞");
}
