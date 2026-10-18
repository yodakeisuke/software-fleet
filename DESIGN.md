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

## fleet構造
### flagship
- shipsの起動
- ships間で議論が収束しなかった場合の調停
- 無視できないトレードオフや、リスクを伴う判断のみユーザへエスカレーションする
### ships
- requirement
  誰が何をできるようになるのか。要求ごとに端的に１行ずつ書く。
  - 機能要求
  - 非機能要求
    - セキュリティファーストです
  - QA: テストケース（要求レベル。取得すべき証跡）
- system behavior
  - event modeling で整理する
  - QA: テストケース（結合レベル）
- code design
  - フロントエンド
    - state/hookとcomponent構造を図示
    - dir構造を図示
  - API
    - 実行時のフロー構造を図示
    - 静的な関係構造を図示
    - 仕様の組み合わせ網羅するunitテストを設計
  - QA
    - unit テストで組み合わせ網羅する仕様
  - 実装
    - コードを実装し、PRを作成する
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

### skill の構成
- `src/skills/` の直下に flagship と各 ship を1フォルダずつ並べる（requirement / behavior / code-design / implementation / qa / cs / security / ops）。skill 名は `software-fleet:<フォルダ名>`。flagship だけは起動コマンドを兼ねるので `set-afloat`（ユーザが `/set-afloat <依頼>` と打つ）

## ui指針
- 例えば Tinder UI のような、スマフォでの楽で直感的な体験をファーストに考える

### 技術的原則
- 状態は fleet ごとに1つの artifact の DB（db capability）に置く。全セッションとスマホのページが同じ状態を見る。ローカルファイルは持たない
  - fleet-id は flagship のセッションID。DB の URL を fleet の全セッションに渡す
  - event sourcing はしない。文書がそのまま状態。競合は DB の if_version で検知される（古い版への書き込みは失敗し、何も書かれない）
  - 1つの文書を書くのは1人だけ。ship の状態はその ship、ユーザの操作（needs review・承認・判断の回答）はページが、別の文書に書く
  - 制約: 1文書 256KiB、1書き込み 1MiB、1 artifact 25,000 文書。成果物は細かい文書に分け、証跡の画像などは assets に置く
- html は事前定義の枠を set-afloat で1回だけ publish する。以後 agent は html を触らず、DB の文書だけを書く。ページは onSnapshot で自分で描き直す
  - fleet で1つの artifact、中身は1つの SPA。ダッシュボードと各 ship のページを画面内で切り替える
  - 画面の指定は `#<ship>` のような素の hash だけ（artifact に届くのは英数字と . _ ~ - の hash のみ）。これで各 ship のページへ直接リンクできる
- 書き込みは成果物ごとの専用tool。mod が $.tool.register で、その ship のセッションにだけ登録し、中で ArtifactData を呼んで DB に書く（$.tool.call）
  - シグネチャは成果物ごとに最適にする。URL・文書ID・if_version・時刻・書いた ship は mod が付け、LLM には書かせない
  - 型は `src/logic/` に1か所だけ定義する。tool の入力スキーマと検査はここから作る。ページはビルドせずに publish するので、表示の導出（レビュー待ちなど数行）だけはページが自分で持つ
  - LLM が生の ArtifactData で fleet の DB に書くことは、mod が tool.call で拒否する。見分けは next.origin.plugin（LLM は "engine"、mod の呼び出しは plugin 名）
- ship の合図: 同梱 skill の呼び出し（tool.call の Skill）で、そのセッションがどの ship かを mod が知る
  - skill.prompt は Skill tool 経由では発火しない。start_session の指示に書いた /command は実行されない
  - toolや hook のエントリポイントは `src/skills/<ship>/tool/`、`hooks/register.tsx` は on に1行ずつ登録するだけ。$ を引数にして別ファイルの関数へ渡さない（validate が拒否する）。$.state の鍵も、使うファイルの中に文字列のまま書く（import した const は validate が拒否する）
- 候補（未検証）
  - 他の ship への通知（$.session.send）。相手が動くべき findings のときだけ。更新のたびには送らない
  - 前のターンからの差分を、各 ship の次のターンの最初に注入する（prompt.submit の context）。文書の更新時刻で差分を取る
