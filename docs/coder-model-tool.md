# coder の設計図: revise_model と地図

型・tool の入出力・DB の置き場所はコードが正（`src/types/fleet.d.ts` の Model 系、`src/skills/coder/tool/revise-model.ts`、`src/fleet/db/fleet-db.ts`）。ここには、コードの 1 か所に収まらない判断と、その理由だけを書く。

## 何か

coder が「コードの中の設計図」を 1 つの JSON（Model）で書き、ページがそれを 2 つの地図に投影する。

```
coder ─ revise_model ─▶ DB: fleet/coder/deliverables/model ─ onSnapshot ─▶ ページ ┬ 構造（型の箱と矢、3 つの区画）
                                                                                 └ 流れ（ユースケースの列と箱）
```

Model = name / worlds[api, domain, db] / types（箱）/ maps（世界をまたぐ対応）/ logic（処理）/ flows（流れ）。要素の意味は tool の inputSchema の description が唯一の説明（LLM が読むのはそれだけ。別ファイルに写しを持たない）。投影表の原本は Design artifact の `project/Data.dc.html`。

## 判断

| 問い | 決めたこと | なぜ |
|---|---|---|
| 名前 | `revise_model` | 既存の revise_* に揃える。モデル = 型と不変条件（coder の SKILL.md の語） |
| 入力 | 渡した集まり（name・worlds・types・maps・logic・flows）はその全体で置き換え、渡さなければ今のまま | id で指す add/replace/remove は、入れ子（objects・morphisms・columns・steps）の分だけ op の形が増え、「指したものがない」という誤りの種類が増える。設計図はコードから導く写しで coder は常に全体を手元に持つので、集まりごと渡すのが一番安い。検査は fk・maps・when・線の名前と全体にまたがるので、どのみち全体を見る。流れだけ直すときは flows だけ渡せばよい |
| 検証 | 形は JSON Schema（型・必須・enum・number/boolean）、意味は logic（下表） | 同じことを 2 か所で見ない（DESIGN.md） |
| エラー | 1 件でも問題があれば何も書かず、全部を ` / ` でつないだ 1 文を deny で返す | 既存の tool と同じ。LLM は 1 回の呼び直しで全部直せる |
| 保存先 | `fleet/coder/deliverables/model`（1 文書、書くのは coder の revise_model だけ） | 「1 つの文書を書くのは 1 人だけ」。ship の成果物の置き場所の規則 `fleet/<ship>/deliverables/<名前>` |
| 地図の読み方 | ダッシュボード（`skills/flagship/dashboard.html`）の coder のページが、この文書を onSnapshot で読んで描く | 下の「地図がどう読むか」 |

### logic が見ること（意味の検査）

| ファイル | 規則 |
|---|---|
| `logic/code-model.ts` | name がある。worlds は api・domain・db が 1 つずつ。問題があれば何も通さない |
| `logic/references.ts` | 型・処理・流れの id は 1 つだけ。表は列を持ち、列名は 1 つだけ、`fk` の先は表。表以外は箱（objects）を持ち、箱の id は型の中で 1 つだけ。部品 `holds.parts[].type`・対応 `maps[].from/to` の型がある。遷移の両端は箱、`when.type` の型と `when.at` の箱がある |
| `logic/flows.ts` | 段の `logic` がある。`start`・`span`・`out`・`drop` の列は流れの列の範囲。`span` は [左, 右] で左 ≤ 右 |
| `logic/wires.ts` | 線の名前「…型名〈状態｜状態〉 ✓ ×N」: 〈〉で状態を言う線は、〈 の前の末尾が型名（最長一致、地図の `labelType` と同じ結び方）で、状態はその型の箱の名前。状態を言わない線（「確定した」「依頼者」）は結べなくてよい。ドメイン層の処理の段は、型に結べる線を 1 本は出す（削る段は除く） |

`change` の値は schema の enum（新・改・削）。無印が既存。

## 地図がどう読むか

今の地図（Design artifact の `project/Main.dc.html`）は MODEL をスクリプトに直書きしている。これを公開された文書から読む道筋。

- Design 型の artboard は、できない。artboard は `.dc.html` 1 枚ずつが editor のサンドボックスの iframe で動き、runtime は `claude.use()` を出さない（format.md が許す外は Google Fonts とアップロードした asset だけ）。また artifact の DB は artifact ごとなので、別の artifact にある fleet の DB は、たとえ読めても届かない
- 代わりに、ダッシュボードの coder のページが読む。DESIGN.md の形そのもの（fleet で 1 つの artifact、1 つの SPA、agent は DB の文書だけを書く、ページは onSnapshot で描き直す）。`fleet/db-paths` に `model` が載る（paths を丸ごと置くので、mod の変更は不要）
- 移植の中身: `Main.dc.html` の投影（`buildStruct`・`buildFlow`・`describe`・`labelType` ほか。約 700 行、素の JS）はそのまま使える。DCLogic の `Component`（カメラ・ヒット判定・renderVals → `sc-for`）だけを、shapes / arrows / texts を絶対配置の div と svg に描く素の描画に書き直す（約 250 行）。`#coder` の hash で直接開ける
- 代替（移植まで）: 地図を Design artifact で磨き続ける間は、ハーネスが DB の文書を `MODEL` に差し込む（parent session の `part_head.js` 方式）。本番の fleet では、移植が終わるまで coder は地図を出せず、PR だけが set_links に出る

## SKILL.md に足したこと

`src/skills/coder/SKILL.md` に 1 段落（原則と目的だけ。データの形は tool の説明に任せる）。front matter を除き 11 行。

## 残り（このブランチでは未実装）

1. ダッシュボードの coder のページ（上の移植）。`skills/flagship/dashboard.html` に `S.paths.model` の listen と `#coder` の描画
2. Q4・Q5（`docs/qa-done.md`）: 本物の coder セッションが SKILL.md と tool の説明だけで設計図を書き切るか、ページがスマホ幅で描けるか
3. 大きな設計図（型 40・流れ 10 で 30〜50 KB）は 1 文書 256 KiB に収まる見込み。超えたら DB が拒み deny で返るだけなので、分割は要るまでしない

## 勝手に足した仕様（報告）

- **ドメイン層の段は型に結べる線を 1 本は出す**（wires.ts）。地図はドメインの箱の種類（Transition / Decision / Computation）を出す線の型から導くので、結べない線しか出さない箱は黙って Computation になる。人が見る地図の嘘を止めるために足した。今の `Main.dc.html` の例では「合計を出す」が出す線「合計」（型は「金額」）がこれに当たる。「合計の金額」のように末尾を型名にする
- **worlds は api・domain・db が 1 つずつ**。地図が `WNAME[w.id]` で区画の名前を引くため
- **name は必須**（最初の呼び出しで渡す）。地図の見出し
- JSON Schema の検査に `number`・`boolean` と、`additionalProperties` の中の `$ref` の解決を足した（`fleet/schema/json-schema.ts`）。既存の tool には影響しない
