import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection } from "next/server";
import { isRunModeOpen } from "./runMode";

// 画面（サーバー側）で実行モードが開いているかを、リクエストのたびに読む。
// connection() で、組み立ての時ではなく開いた時に値を読む。
export async function runModeOpenNow(): Promise<boolean> {
  await connection();
  const { env } = await getCloudflareContext({ async: true });
  return isRunModeOpen(env as { RUN_MODE?: string }, process.env.NODE_ENV === "production");
}
