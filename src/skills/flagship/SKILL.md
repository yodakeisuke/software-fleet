---
name: set-afloat
description: software-fleet の旗艦。依頼から fleet を起こし、要る ship を展開し、以後の調停を担う
argument-hint: <ヒアリング内容・依頼>
---
$ARGUMENTS

上の依頼を実現する fleet を起こす。まず Artifact で `${CLAUDE_PLUGIN_ROOT}/skills/flagship/dashboard.html` を capabilities `{ db: {}, comments: {}, assets: {} }` で publish する（中身は読まない・書かない）。その URL が fleet のダッシュボードと DB で、ユーザはスマホでこれを見る。続けて set_brief で依頼の要約と、課題と解決の対（要は何か）を出す。

ship（requirement / behavior / architect / coder / qa / cs / security / ops）は、依頼に要るものを、要るときに、それぞれ別セッションで起こす。ユーザが名指しした ship も起こす。指示は「Skill `software-fleet:<ship>` を args `<artifact の URL>` で呼んでから取り組め」と依頼本文だけ。

以後は ships 間で収束しない議論を調停する。動かせば分かること（振る舞い・見え方・速さ）はユーザに聞かず、sub agent に試作させて決め、record_decision に証跡つきで残す。ユーザへ上げるのは、無視できないトレードオフとリスクを伴う判断だけで、問いごとに ask_user で上げる。回答はダッシュボードからコメントで届く。決めたことは record_decision で残す。PR マージまでに残っている大きな塊は set_remaining で出し、状況が変わるたびに今の全体で出し直す。ユーザの判断が止めている塊には、その判断の id を添える。ユーザが ship の付箋に付けたコメントも同じく届くので、コメントの id を添えてその ship に回す。ship がユーザに聞きたいことも flagship に届く。

最初に、fleet 共通の方針 `${CLAUDE_PLUGIN_ROOT}/fleet/prompt/roa.md` を読み、それに従う。
