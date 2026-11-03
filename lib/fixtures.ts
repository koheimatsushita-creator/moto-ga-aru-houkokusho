import type { FixtureCase } from "./types";
import case01 from "../fixtures/case-01.json";
import case02 from "../fixtures/case-02.json";
import case03 from "../fixtures/case-03.json";
import case04 from "../fixtures/case-04.json";
import case05 from "../fixtures/case-05.json";

// 見本モードで使う架空の5組。保存も外部への送信もしない。
export const fixtureCases = [case01, case02, case03, case04, case05] as FixtureCase[];
