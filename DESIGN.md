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
- 全体の状況とダッシュボードの管理
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

### escorts
- 未定。skillを作っていく中で適切な責務を見出していく

### skill の構成
- `src/skills/` の直下に flagship と各 ship を1フォルダずつ並べる（requirement / behavior / code-design / implementation / qa / cs）。skill 名は `software-fleet:<フォルダ名>`

### 技術的原則
- 状態はファイルで保存。jsonで構造化されたものを全てのセッションが共有する
  - 置き場所は `~/.software-fleet/fleets/<fleet-id>/`。repo の外に置き、worktree や repo をまたいで同じ状態を見る。コミットしない
  - event sourcing。`events/` が正で、`state/<area>.json` はそこからの投影。既読位置は各セッションの `$.state` に持つ
    - 1イベント1ファイル（`events/<時刻>-<セッションID>.json`）。$.fs に追記がなく、1つのファイルへの読み書きでは同時更新が消えるため
  - 更新ツールの入力は1件の変更（イベント）。状態全体は入力にも出力にも載せない
  - fleet の構成（ship・宛先のセッションID・artifact URL）も state の1つ（`state/fleet.json`）
  - view の html は保存しない。publish 時に state と template（mod に同梱）から一時ファイルへ書き出す
- html arttifactはangentが書かない。状態から投影される格好とする。つまり事前定義のtemplateに流し込まれる
- mod の使い所
  - 専用toolの登録: 状態の更新はこのtoolだけ。ship ごとに、その ship の成果物に合わせた型付きtoolを持つ
    - 同梱 skill の呼び出し（tool.call の Skill）を合図に $.tool.register({ ..., isDeferred: false }) する。登録はそのセッション限りで、他セッションを汚さない
    - 合図の引数（fleet-id と ship名）で、登録するtoolを決める。見えるのは自分の ship のtoolと、全 ship 共通の読み取りtoolだけ
    - ship ごとの定義（stateの型・toolの入力スキーマ・イベントへの変換・viewのtemplate）は `src/skills/<ship>/` に SKILL.md と並べて置く
      - ここには $ を使わない純粋な定義だけを置く。$ は import 先の関数へ渡せない（validate が拒否する）。I/O は hooks 側で行う
    - skill.prompt は Skill tool 経由では発火しない。start_session の指示に書いた /command は実行されない
  - 直接編集の禁止: fleet が持つ状態json・view への Edit/Write を tool.call で拒否する
    - 効かせるのは fleet のセッションだけ（専用toolと同じ合図の後）。mod は全セッションで読まれるため
    - パスで絞る。Artifact tool は止めない。他の artifact やコードの編集は通す
    - Bash 経由の書き換えは塞がない（コマンドをパスで判定するのは脆い）
  - 候補（未検証）。書き込みが専用toolに一本化されるので、更新の瞬間を mod が知れる
    - 他の ship への通知（$.session.send）
    - 状態から artifact を描き直す
    - 前のターンからの差分を、各 ship の次のターンの最初に注入する（prompt.submit の context）。prompt.compose は system prompt が毎ターン変わりキャッシュを作り直すので使わない
    - push（$.session.send）は相手が動くべき findings のときだけ。相手のターンを起こすので、更新のたびには送らない
    - ship のターン終了ごとに進捗を記録する（turn.complete）
