# ダッシュボードの tool と状態

publish は `/set-afloat` の時点で mod が行う（skill.prompt hook）。LLM の tool はない。

## 状態（DB の文書）

```ts
// flagship が書く
Fleet    = { brief }
Ask      = { question,
             background: Explain,
             options: Option[],     // 2〜4
             recommended: OptionId,
             evaluation?: {         // 複雑な判断だけ
               axes: { name, weight }[],
               cells: Cell[option][axis] } }
Option   = { id, label,
             consequence,           // 1行
             detail: Explain }
Explain  = { text, diagram?: Html }  // HTML か SVG の断片
Cell     = { rating: ◎|○|△|×, note }
Decision = { what, why, closes?: AskId }

// 各 ship が書く
ShipName = requirement | behavior
         | code-design | implementation
         | qa | cs | security | ops
Status =
 | { state: working,   doing }
 | { state: converged }
 | { state: stuck,     reason }
 | { state: waiting,   on: ShipName | user,
                       what }
Ship     = Status & { since }

// ページ（ユーザ）が書く
Answer   = | { choice: OptionId }
           | { text }             // 自由記述
Review   = { required?, approved_since? }
```

置き場所: `fleet/<書き手>/...`。その書き手だけが書く。時刻・ID・if_version・URL・ship 名は mod が付ける。

## tool の I/O

```ts
// flagship
set_brief(brief)              → BriefSet
ask_user(Ask)                 → UserAsked(id)
record_decision(what, why,
                closes?)      → DecisionRecorded

// ship
report_status(Status)         → StatusReported
                                （converged で
                                  レビュー待ちなら
                                  , awaiting review）
```

## 図（Html）

- HTML か SVG の断片を、ページにそのまま埋め込む。サニタイズしない（リスクは低いと判断）
- ページの色の変数（--fg など）を使えるので、ライト/ダークはページに合わせて切り替わる
- mod の検査はサイズだけ

## 導出（保存しない）

```ts
required     = Review.required ?? (code-design | qa)
レビュー待ち = converged ∧ required
             ∧ approved_since ≠ since
あなたの番   = 未回答・未 close の Ask
             ＋ レビュー待ちの Ship
```

## 回答が flagship に届く経路

```
判断をタップ
 ├─ ページが DB に Answer を書く
 └─ ページが comments.sendToClaude
      → flagship のターンが始まる
取り消し（5秒以内のタップ）
 └─ 同じ経路で「取り消し」を送る
```
- artifact の組み込みの仕組みだけで動く。mod は使わない
- 同意を求められるのは、artifact ごとに最初の1回だけ
- 送信はタップの直後に限られる（タイマーからは送れない）

## ship への受け渡し

- flagship は ship を起こすときに artifact の URL を渡す（Skill の args）
