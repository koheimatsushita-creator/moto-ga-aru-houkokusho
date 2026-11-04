import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleJudge, type JudgeBindings } from "@/lib/judge/handler";
import { runJudge } from "@/lib/judge/run";

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  return handleJudge(request, {
    env: env as JudgeBindings,
    // 公開した物（本番の書き出し）では回数の上限を必ず掛ける。手元の npm run dev だけ素通りにする
    // （見本の判定の保存や揺れの測定で続けて呼ぶため）
    production: process.env.NODE_ENV === "production",
    judge: runJudge,
  });
}
