## 実現すること
- FDEが、客先でヒアリングをした。終了後、電車の移動時にスマホから software factoy に指示を飛ばし、ビジュアライズされた成果物をレビューする。QA証跡を確認し、PRマージまで行う

最重要KPI: 人間の認知資源の消費を最小化する
ガードレール指標: あらゆる意味での「品質」も担保する。完全にindustrial gradeであること

## コアコンセプト
- 設計品質・外部品質の確認はまだ人間のエンジニアが行う必要があるためそれを支援する
- html artifactでリアルタイムに可視化し続ける
- スマホ・remote controll first
- Claude Code 専用。skill が本体で、mod は skill だけでは守れないこと（専用tool・禁止の強制）を担う
- 設計について、class-based thinking ではなく functional DDDを、state-centricではなく event-centricで、つまり現代のベスプラでcoding agentをハーネスできる

## 人間から見た体験原則
- レビューするだけ。直接コードを見ないで、ハイレベルのビジュアライズにより構造を把握する。
  - 人間が確認するのは構造の品質と、QAの十分さ
  - スマホから、レビュー・PRマージまで完結

## coding agent から見た体験原則
- flagshipを親セッションとし、子セッション群を展開する
- セッション群は、密にやりとりし合う
- artifactに表示する成果物群は、agentが直接更新しない。jsonデータを更新し、それがビューに投影されるようにする。（html描画でコンテキストを消費しない）

## 仕様策定・実装ポリシーのスタンス
コードも仕様もあるだけでは負債なので、"ROI"を考えてください。

過剰品質は悪です。
コード・仕様のROAを最大化することがポリシーです。(分子は、価値やバグリスク)
ROA の定義: @src/fleet/prompt/roa.md
「余計なお世話仕様」「不要分岐」「勝手にフォールバック」こんなものを入れてないか常に自己監査せよ。
勝手に仕様を追加する場合は報告しなさい。

promptやコンテキスト、LLMの認知負荷 の負債を無駄に増やしてないか？
promptに書くことは本当に最小限にします。細かいことは書かない。原則や目的だけ。なぜならllmはもはや心の理論を理解するからです。ブレがあってもいいので最小しか書かない。実行時のLLMの自主性に任せる

## 制約
- 全ての promptファイルは、front matter とデータ構造の説明を除き 30行以内とする
- htmlやjson状態を直接更新しない。更新は mod が登録する専用toolだけで行う。そのI/OはLLMに伝わる必要がある
  - fleet の DB への生の ArtifactData 書き込みだけを mod が tool.call で拒否する。他のファイルや artifact は止めない

mods の仕様は https://code.claude.com/docs/en/plugins/mods/reference と、engine が生成する型定義（src/.claude-plugin/types/）を正とする。記憶で書かない。
