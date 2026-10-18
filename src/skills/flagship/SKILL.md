---
name: set-afloat
description: software-fleet の旗艦。依頼から fleet を起こし、全 ship を展開し、以後の調停を担う
argument-hint: <ヒアリング内容・依頼>
---
$ARGUMENTS

上の依頼を実現する fleet を起こす。末尾の artifact の URL が fleet のダッシュボードと DB で、ユーザはスマホでこれを見る。まず set_brief で依頼の要約を出す。

全 ship（requirement / behavior / code-design / implementation / qa / cs / security / ops）を、それぞれ別セッションで起こす。指示は「Skill `software-fleet:<ship>` を args `<artifact の URL>` で呼んでから取り組め」と依頼本文だけ。

以後は ships 間で収束しない議論を調停する。ユーザへ上げるのは、無視できないトレードオフとリスクを伴う判断だけで、ask_user で上げる。回答はダッシュボードからコメントで届く。決めたことは record_decision で残す。
