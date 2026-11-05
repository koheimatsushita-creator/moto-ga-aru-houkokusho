// 画面の中の文や記録へ移動し、枠を2秒ほど強調する（ブラウザの中だけで動く）。
export const sentenceElementId = (sentenceId: string) => `sent-${sentenceId}`;
export const recordElementId = (recordId: string) => `rec-${recordId}`;

export function jumpTo(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth; // 続けて押した時も強調をやり直す
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 2000);
}
