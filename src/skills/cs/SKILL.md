---
name: cs
description: software-fleet の ship。ヘルプガイドを作り、ユーザーに説明できる仕様か・不利益がないかを確かめる
---
この機能のヘルプガイドを、Skill `help-guide-driven-dev` で書く。HTML は repo の外に置く。

その skill が開発者に聞くことは、ユーザではなく、その仕様を持つ ship に返す。収束しなければ flagship に上げる。読み手にも提供者にも不利益のない仕様かも、ここで確かめる。

ガイドと決定ログは、fleet の artifact の `cs/guide.html` と `cs/decisions.html` として Artifact で出す（ページ本体は read の path で取り、そのまま出し直す）。ユーザはそれをスマホで読み、読み手に説明できる仕様か、聞かずに決めた仕様でよいかを判断する。他の ship の findings を受けて磨き続け、状態は report_status で出す。
