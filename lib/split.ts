import type { Sentence } from "./types";

// 文の分割は普通のプログラムで行う（Claudeに任せると文を飛ばされることがあるため）。
// 句点「。」と改行で切り、空の文は捨て、S01 から番号を付ける。
export function splitSentences(draft: string): Sentence[] {
  const texts: string[] = [];
  for (const line of draft.split(/\r?\n/)) {
    for (const part of line.split(/(?<=。)/)) {
      const text = part.trim();
      if (text) texts.push(text);
    }
  }
  return texts.map((text, i) => ({ id: `S${String(i + 1).padStart(2, "0")}`, text }));
}
