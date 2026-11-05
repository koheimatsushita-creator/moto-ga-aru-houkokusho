"use client";

import { useState } from "react";

// 処理後の本文をコピーする。記録ソフトの報告書の欄に貼って出す想定。
// navigator.clipboard が使えない時（http など）は、選択してコピーする古いやり方に切り替える。
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (!ok) throw new Error("copy failed");
      }
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="copy-area no-print">
      <button type="button" className="button" onClick={copy} disabled={!text}>本文をコピー</button>
      <span aria-live="polite" className="copy-status">
        {state === "done" && "コピーしました。記録ソフトの報告書の欄に貼ります"}
        {state === "failed" && "コピーできませんでした。本文を選んでコピーしてください"}
      </span>
    </span>
  );
}
