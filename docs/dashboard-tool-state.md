# ダッシュボード: コードに書けないこと

型・tool の入出力・DB の置き場所はコードが正（`src/types/fleet.d.ts`・各 tool・`src/fleet/db/fleet-db.ts`）。ここには、コードの 1 か所に収まらないことだけを書く。

## 導出（保存しない）

```ts
required     = Review.required ?? (architect | qa)
レビュー待ち = converged ∧ required
             ∧ approved_since ≠ since
あなたの番   = 未回答・未 close の Ask
             ＋ レビュー待ちの Ship
```

- 正は `src/fleet/logic/review.ts`。ページ（dashboard.html）はビルドせずに publish するので写しを持つ
- 「あなたの番」はページだけが使うので、ページにだけある

## 回答が flagship に届く経路

```
判断をタップ
 ├─ ページが DB に Answer を書く
 └─ ページが comments.sendToClaude
      → flagship のターンが始まる
       （届かなければ Answer に undelivered を書き、
         ページに「送り直す」が出る）
取り消し（5秒以内のタップ）
 └─ 同じ経路で「取り消し」を送る
```
- artifact の組み込みの仕組みだけで動く。mod は使わない（mod が DB を見張る方式を検証中。差し替えるのはページの wake だけ）
- 送信はタップの直後に限られる（タイマーからは送れない）
