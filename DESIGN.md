## コアコンセプト
- 全てのセッションは対等で、工程ごとの時間的優劣はない。つまりライン」ではない。同時に動き、お互いのfindingsを密に連携し合い 、常にsyncした状態を保つ
  - 実装を始めずに事前に良い設計構造を固めることは不可能である。実装や設計を始めずに事前にすべての要求や振る舞いを網羅的に記述することは不可能である。
  - これは software factory ではなく software fleet と表現している理由でもある

要は agileだな。docはあくまで派生的に投影されるビューに過ぎない。人間がレビューするためのもの

## 通貫する指針
- too texty は避ける
- 図解ファースト。基本は絵の中でわからせる。図の中に注釈として文字を書いても良い
- cluttered は避ける
- green field だけではなく、brown field にも対応。どこが新規で、既存で、既存の修正なのかわかるように
- リアルタイムに更新する。またこれは mini-waterfallではない。工程は「行き来」するものであり、どの成果物もスパイラルアップに磨いていくものだ。というかそもそも 工程 メンタルモデルで捉えないように
- 親子セッションで状態を共有する。ファイルを介して共有する
- 仕様とコードの ROA を最大化する。flagship と全 ship が最初に `fleet/prompt/roa.md` を読む

## fleet構造
### flagship
- ships の起動。依頼に要る ship を、要るときに起こす（全部とは限らない）。ユーザが名指しした ship も起こす
- ships間で議論が収束しなかった場合の調停
- 無視できないトレードオフや、リスクを伴う判断のみユーザへエスカレーションする
- PR マージまでに残っている大きな塊を示す。ダッシュボードはそれと、ユーザが判断することの一覧と、behavior が仮定で進めていることを分けて最初に見せる
- ユーザへの問いは flagship の ask_user だけ（背景・選択肢・推奨が必ず付く）。ship はユーザを直接待たず、flagship を待つ
### ships
- requirement
  誰が何をできるようになるのか。要求ごとに端的に１行ずつ書く。
  - 機能要求
  - 非機能要求
    - セキュリティファーストです
  - QA: テストケース（要求レベル。取得すべき証跡）
- system behavior
  - event modeling で整理する
  - UX design。画面と操作の流れをノイズのないプロのデザインとして artifact に描き、set_links で出す。描くのはセッション内の sub agent。置く情報とインタラクションは、存在する理由を言えるものだけ
  - QA: テストケース（結合レベル）
- architect
  - system design に責任を持つ。このシステムが、動く場所まで含めて丸ごと、どんな部品からなり、どう繋がり、データがどこに置かれどう流れ、外の世界と何を約束するか
  - 後から戻しにくい判断を意図して置き、なぜ他の形でないかを残す。brownfield では新・改・既を分けて描く。既存システムの形は自分で調べる
  - コードの中は見ない（coder の領分）
  - 境目: behavior は業務の事実と不変条件のまとまりを決め、architect はそれがどこに置かれどう運ばれるかを決める。プロセスやシステムをまたぐ流れは architect、1 つのプロセスの中は coder。新しい部品が要ると決めるのは architect、それを動かし監視するのは ops
  - 成果物はその場次第の自由フォーマット（自前の artifact・fleet の artifact の asset・ブランチの文書）。set_links でダッシュボードにリンクを出す
- coder
  - コードの中に責任を持つ。モジュール・関数・unit テストの設計と実装、PR
    - フロントエンド: state/hook と component の構造、dir 構造を図示
    - API: 1 つのプロセスの中の実行時のフロー構造と静的な関係構造を図示
    - 仕様の組み合わせを網羅する unit テストを設計
  - ユーザはコードを読まないので、設計は図で見せる。型・対応・処理・流れの設計図を revise_model で DB の 1 文書に書き、ページが「構造」と「流れ」の地図に投影する。地図はいまのコードの写しで、それを mod が確かめる。型は code（ファイル#名前）でコードを指し、mod は revise_model のたびと coder の収束の報告のときに、そのファイルを読んで名前が在るかを照合し、無ければ拒む。コードで型になっていない形は破線の枠で出て、新しく足す型には許さない。照合は名前が在るかまでで、形（変種・項目）が合うかと、処理の箱が関数かは見ていない。流れの名前は behavior のコマンド・リードモデルの名前で、behavior とはそれで結ばれる。PR は set_links でダッシュボードにリンクを出す
  - sub agentsを駆使して効率的に行う
- QA
  - ブラウザから実際の動作確認を行い、証跡を取得する
  - 他のセッションの成果物をQAの視点から監査する
- CS
  - ヘルプガイドを作成し、findingsをFBする
  - ユーザに説明可能な仕様か、テストする。複雑な仕様負債を排除する
  - ユーザにあるいはプロダクト提供者に不利益な内容はないかテストする
- セキュリティ
  - セキュリティ責任者として、すべてのレイヤを横断してセキュリティホールを塞ぐ
- ops
  - 保守運用の責任者として、運用で困らないように指摘を加え、必要なら開発にも加わる
  - 運用設計書（任意）。要るときだけ書く

### skill の構成
- `src/skills/` の直下に flagship と各 ship を1フォルダずつ並べる（requirement / behavior / architect / coder / qa / cs / security / ops）。skill 名は `software-fleet:<フォルダ名>`。flagship だけは起動コマンドを兼ねるので `set-afloat`（ユーザが `/set-afloat <依頼>` と打つ）
- ship の起こし方は 3 つ。役割は起動のコマンドか Skill で、fleet は artifact の URL で決まる
  - flagship が起こす: 別セッションに「Skill `software-fleet:<ship>` を URL 付きで呼べ」と指示する
  - ユーザが自分のセッションで既存の fleet に乗る: `/software-fleet:<ship> <ダッシュボードの URL>`
  - flagship なしの単独: `/software-fleet:<ship> <依頼>`（URL なし）。最初はダッシュボードも専用 tool もなく、成果物はブランチ・自前の artifact・チャットに出し、ユーザへの問いはそのセッションで直接聞く。他の ship と共有するか、スマホで見たくなったときだけ、その ship がダッシュボードを publish する（共有に要るのは画面ではなく DB で、DB は artifact に付いている）。そこで専用 tool が出て、依頼の要約（set_brief）と、それまでの成果物を出し直す。他の ship は上の方法でその URL に乗る
- cs はヘルプガイドを skill `help-guide-driven-dev` で書く。前提: その skill がユーザの環境に入っていること（`npx skills add yodakeisuke/help-guide-driven-dev`）

## ui指針
- 例えば Tinder UI のような、スマフォでの楽で直感的な体験をファーストに考える
- 自分用の高密度な道具。書体は端末標準、角は直角に近く（3px）、ラベルは場所に見合うものだけ置く
- 色は藍鉄と浅葱。上下の帯と本体で組み、面の彩度は低く保つ。色の面は「押すもの」と「あなたの番」だけ。詰まりは面にせず文字と印で示す
- アイコンは役割の飾りにせず、状態を形で伝えるために使う

### 技術的原則
- 状態は fleet ごとに1つの artifact の DB（db capability）に置く。全セッションとスマホのページが同じ状態を見る。ローカルファイルは持たない
  - fleet-id は flagship のセッションID。DB の URL を fleet の全セッションに渡す
  - event sourcing はしない。文書がそのまま状態。競合は DB の if_version で検知される（古い版への書き込みは失敗し、何も書かれない）
  - 1つの文書を書くのは1人だけ。ship の状態はその ship、ユーザの操作（needs review・承認・判断の回答・ship や付箋へのコメント）はページが、別の文書に書く
  - 制約: 1文書 256KiB、1書き込み 1MiB、1 artifact 25,000 文書。成果物は細かい文書に分け、証跡の画像などは assets に置く
- html は事前定義の枠を set-afloat で1回だけ publish する。以後 agent は html を触らず、DB の文書だけを書く。ページは onSnapshot で自分で描き直す
  - 読み手向けの文書（cs のヘルプガイドと聞かずに決めた仕様、ops の運用設計書）も DB に置く。revise_document で章と部品（文・手順・箇条書き・表・図・注意）だけを、直す分だけ書き、見た目はページが描く。HTML は書かない。cs と ops で 1 つの tool を共有し、どの文書を書くかは skill に任せる
  - 図の SVG だけは直接書く（文書の図と ask_user の図）。ページが img で描くので、script も外部の読み込みも動かない
  - 運用設計書は任意なので、無ければページは「まだありません」と出す
  - fleet で1つの artifact、中身は1つの SPA。ダッシュボードと各 ship のページを画面内で切り替える
  - 画面の指定は `#<ship>` のような素の hash だけ（artifact に届くのは英数字と . _ ~ - の hash のみ）。これで各 ship のページへ直接リンクできる
- 書き込みは成果物ごとの専用tool。mod が $.tool.register で、その ship のセッションにだけ登録し、中で ArtifactData を呼んで DB に書く（$.tool.call）
  - 全 ship が set_links を持つ。成果物へのリンク（URL と文言）を今の全体で置き換え、ship ごとの 1 文書に書く。ページは top の「成果物」の一覧と、その ship のページにボタンで出す
  - シグネチャは成果物ごとに最適にする。URL・文書ID・if_version・時刻・書いた ship は mod が付け、LLM には書かせない
  - 入力の形（型・必須・空でない・enum・pattern）は tool の JSON Schema が見る。意味（件数・文字数・推奨は選択肢のどれか など）は logic が見る。同じことを 2 か所で見ない
  - LLM が生の ArtifactData で fleet の DB に書くことは、mod が tool.call で拒否する。見分けは next.origin.plugin（LLM は "engine"、mod の呼び出しは plugin 名）
  - 前提: settings の permissions.allow に `ArtifactData` を入れる。mod の中からの ArtifactData は、auto モードの判定が「依頼にない操作」として止めるため。設定は起動時に読まれるので、足す前に起動したセッションには効かない
- fleet のセッションが preview_start で dev server を起こすことを mod が tool.call で拒否する。ユーザの確認を出してセッションを止めるため。url で開くだけなら通す
- ship の合図: 同梱 skill の呼び出し（tool.call の Skill）か、ユーザが打った /command（command.run）で、そのセッションがどの ship かを mod が知る
  - 単独で起きた ship は、役割だけを $.state に覚え、ダッシュボードを publish したら乗る。skill の本文は flagship がいる前提なので、その差だけを mod が command.run の context で伝える
  - skill.prompt は Skill tool 経由では発火しない。start_session の指示に書いた /command は実行されない
### コードの置き場所
指針
1. 一緒に変わるものは一緒に置く（機能ごとにフォルダを切り、tool・logic・テストを並べる）
2. ドメインは純粋に保つ（logic は $・DB・スキーマを知らない）
3. 名前は中身を言う（utils・tools のような総称は使わない）
4. 実行環境の都合は境目の 1 ファイルに閉じ込める（$ と $.state の鍵は `hooks/register.tsx` だけ）
5. 足すより削る

補足
- 2 つ以上の機能が使うものは `fleet/` に置く
- ドメインは「fleet を紙で運用しても成り立つ規則」だけ（乗れる者・乗るのは一度だけ・レビューの要否・判断の選択肢は 2〜4 件 など）。文書 ID や skill 名の解析はドメインではない

```
src/
├─ hooks/register.tsx   組み立て役。$ を engine（関数の束）にして渡す
├─ types/fleet.d.ts     plugin の型の契約（PluginState）と Engine の型
├─ skills/<機能>/        SKILL.md（と dashboard.html）。中身ができたら tool/（LLM が呼ぶ tool、1 tool 1 ファイル）・logic/
└─ fleet/               2 つ以上の機能が使うもの: tool/・hook/・logic/・db/（fleet-db.ts）・schema/（json-schema.ts）・prompt/（全 ship が読む roa.md）
```

依存は一方向: `register.tsx → tool・hook → fleet-db・json-schema → logic → 型と result`
- logic はほかの logic と型だけを読む。fleet/ は skills/ を読まない（機能ごとの tool の一覧は register.tsx が集めて渡す）。skills の機能どうしは読み合わない。register.tsx は誰も読まない
- テストは対象の隣に置く（`*.test.ts`）

例外（写しを持つもの）
- dashboard.html はビルドせずに publish するので、レビューの規則（`fleet/logic/review.ts` の required・レビュー待ち）の写しを持つ。review を変えたら dashboard.html も直す
- 同じく、qa のケースの集め方（`skills/qa/logic/quality.ts` の cases）の写しを持つ。変えたら dashboard.html も直す
- 同じく、流れの線と構造の型の結び方（`skills/coder/logic/wires.ts` の typeOf・statesOf）の写しを持つ。変えたら dashboard.html の地図も直す
- DB の置き場所は `fleet/db/fleet-db.ts` の paths が唯一の定義。mod はダッシュボードの publish のときに、それを DB の `fleet/db-paths` に置く。ページはそれを読むので、ページが知っているのはこの 1 つの置き場所だけ

- 候補（未検証）
  - 他の ship への通知（$.session.send）。相手が動くべき findings のときだけ。更新のたびには送らない
  - 前のターンからの差分を、各 ship の次のターンの最初に注入する（prompt.submit の context）。文書の更新時刻で差分を取る
