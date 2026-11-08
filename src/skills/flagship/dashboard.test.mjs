// coder の地図（dashboard.html の <script id="coder-map">）を、ページから切り出したそのままの形で Node で動かす。描画の前の投影（盤面・カメラ・固定・選択）を見る
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8')
const source = page.match(/<script id="coder-map">([\s\S]*?)<\/script>/)[1]
// フレームは手で進める（tick）。cancelAnimationFrame は登録を外す
let now = 0
let frames = []
const clock = { performance: { now: () => now }, requestAnimationFrame: f => frames.push(f), cancelAnimationFrame: id => { frames[id - 1] = () => {} } }
const tick = ms => { now += ms; const due = frames; frames = []; due.forEach(f => f(now)) }
const settle = (limit = 120) => { let k = 0; while (frames.length && k < limit) { tick(16); k++ } return k }
const CoderMap = new Function(...Object.keys(clock), `${source}\nreturn CoderMap`)(...Object.values(clock))
// 地図を 1 つ、画面の大きさを決めて作る
const mapOf = (model, w, h) => { const map = new CoderMap.View(); map.setModel(model); map.viewport = () => ({ w, h }); return map }

// 例の設計図（Design artifact で地図を固めたときの「注文」）
const MODEL = {
  name: '注文',
  worlds: [{ id: 'api', name: '境界 · API' }, { id: 'domain', name: 'ドメイン' }, { id: 'db', name: '保存 · RDB' }],
  types: [
    // ---- 境界（API の求めと返事）。record = 項目の直積
    { id: 'confirm_req', name: '確定の依頼', world: 'api', form: 'record', objects: [{ id: 'v', name: '確定の依頼', holds: { parts: [{ type: 'id', as: '注文ID' }, { type: 'actor', as: '操作者' }] } }] },
    { id: 'cancel_req', name: '取消の依頼', world: 'api', form: 'record', objects: [{ id: 'v', name: '取消の依頼', holds: { parts: [{ type: 'id', as: '注文ID' }, { type: 'reason', as: '理由' }, { type: 'actor', as: '操作者' }] } }] },
    { id: 'reserve_req', name: '引当の依頼', world: 'api', form: 'record', objects: [{ id: 'v', name: '引当の依頼', holds: { parts: [{ type: 'id', as: '明細ID' }] } }] },
    { id: 'ship_req', name: '出荷の依頼', world: 'api', form: 'record', objects: [{ id: 'v', name: '出荷の依頼', holds: { parts: [{ type: 'ids', as: '明細ID' }, { type: 'tracking', as: '送り状番号' }] } }] },
    { id: 'list_req', name: '一覧の問い合わせ', world: 'api', form: 'record', objects: [{ id: 'v', name: '一覧の問い合わせ', holds: { parts: [{ type: 'id', as: '顧客ID' }, { type: 'period', as: '期間' }] } }] },
    { id: 'order_res', name: '注文の返事', world: 'api', form: 'record', objects: [{ id: 'v', name: '注文の返事', holds: { parts: [{ type: 'id', as: '注文ID' }, { type: 'state_name', as: '状態' }, { type: 'money', as: '合計' }, { type: 'version', as: '版' }] } }] },
    { id: 'list_res', name: '一覧の返事', world: 'api', form: 'record', objects: [{ id: 'v', name: '一覧の返事', holds: { parts: [{ type: 'summary' }] } }] },
    { id: 'error_res', name: '失敗の返事', world: 'api', form: 'record', objects: [{ id: 'v', name: '失敗の返事', holds: { parts: [{ type: 'fail_kind', as: '種類' }, { type: 'text', as: '言い分' }] } }] },
    { id: 'summary', name: '注文の要約', world: 'api', form: 'record', many: '件', doc: '一覧用の読み取りモデル。注文表から直接組む', objects: [{ id: 'v', name: '要約', holds: { parts: [{ type: 'id', as: '注文ID' }, { type: 'state_name', as: '状態' }, { type: 'money', as: '合計' }, { type: 'date', as: '日付' }] } }] },
    { id: 'period', name: '期間', world: 'api', form: 'value', objects: [{ id: 'v', name: '期間', holds: { parts: [{ type: 'date', as: '開始' }, { type: 'date', as: '終了' }], invariant: '開始は終了より前' } }] },
    { id: 'state_name', name: '状態名', world: 'api', form: 'kind', objects: [{ id: 'a', name: '下書き' }, { id: 'b', name: '確定済' }, { id: 'c', name: '出荷中' }, { id: 'd', name: '完了' }, { id: 'e', name: '取消済' }] },
    { id: 'fail_kind', name: '失敗の種類', world: 'api', form: 'kind', objects: [{ id: 'a', name: '許されていない' }, { id: 'b', name: '無い' }, { id: 'c', name: '表に無い遷移' }, { id: 'd', name: '競合' }] },
    { id: 'id', name: 'ID', world: 'api', form: 'value', objects: [{ id: 'v', name: 'ID', holds: { prim: 'UUID' } }] },
    { id: 'ids', name: 'ID ×N', world: 'api', form: 'value', objects: [{ id: 'v', name: 'ID ×N', holds: { prim: 'UUID の列' } }] },
    { id: 'actor', name: '操作者', world: 'api', form: 'value', objects: [{ id: 'v', name: '操作者', holds: { prim: 'ID と役割' } }] },
    { id: 'version', name: '版', world: 'api', form: 'value', objects: [{ id: 'v', name: '版', holds: { prim: '整数 ≥ 1' } }] },
    { id: 'date', name: '日付', world: 'api', form: 'value', objects: [{ id: 'v', name: '日付', holds: { prim: 'ISO 8601' } }] },
    { id: 'text', name: '文字', world: 'api', form: 'value', objects: [{ id: 'v', name: '文字', holds: { prim: '文字列' } }] },
    // ---- ドメイン。lifecycle = 状態機械、value = 値、kind = 選択肢
    { id: 'order', name: '注文', world: 'domain', form: 'lifecycle', doc: '顧客の買い物 1 回分。状態は遷移表でだけ進む',
      objects: [
        { id: 'draft', name: '下書き', at: [0, 0], holds: { parts: [{ type: 'customer', as: '顧客' }, { type: 'line' }, { type: 'address', as: '届け先' }] } },
        { id: 'confirmed', name: '確定済', at: [1, 0], holds: { parts: [{ type: 'customer', as: '顧客' }, { type: 'line' }, { type: 'money', as: '合計' }, { type: 'payment', as: '支払' }, { type: 'address', as: '届け先' }], invariant: '合計は明細の単価×数量の和' } },
        { id: 'shipping', name: '出荷中', at: [2, 0], holds: { parts: [{ type: 'customer', as: '顧客' }, { type: 'line' }, { type: 'money', as: '合計' }, { type: 'payment', as: '支払' }, { type: 'address', as: '届け先' }], invariant: '合計は明細の単価×数量の和' } },
        { id: 'done', name: '完了', at: [3, 0], holds: { parts: [{ type: 'customer', as: '顧客' }, { type: 'line' }, { type: 'money', as: '合計' }, { type: 'payment', as: '支払' }, { type: 'address', as: '届け先' }], invariant: '合計は明細の単価×数量の和。支払は請求済' } },
        { id: 'cancelled', name: '取消済', at: [1, 1], holds: { parts: [{ type: 'customer', as: '顧客' }, { type: 'reason' }] } }
      ],
      morphisms: [
        { from: 'draft', to: 'confirmed', by: '確定する' },
        { from: 'confirmed', to: 'shipping', by: '一部が出荷済', when: { type: 'line', at: 'shipped', all: false } },
        { from: 'shipping', to: 'done', by: '全明細が出荷済', when: { type: 'line', at: 'shipped', all: true } },
        { from: 'draft', to: 'cancelled', by: '取り消す' },
        { from: 'confirmed', to: 'cancelled', by: '取り消す' }
      ] },
    { id: 'line', name: '明細', world: 'domain', form: 'lifecycle', many: '行', doc: '注文の中でだけ生きる。引当と出荷は明細ごと',
      objects: [
        { id: 'open', name: '未引当', holds: { parts: [{ type: 'product', as: '商品' }, { type: 'qty', as: '数量' }, { type: 'money', as: '単価' }] } },
        { id: 'reserved', name: '引当済', holds: { parts: [{ type: 'product', as: '商品' }, { type: 'qty', as: '数量' }, { type: 'money', as: '単価' }] } },
        { id: 'shipped', name: '出荷済', holds: { parts: [{ type: 'product', as: '商品' }, { type: 'qty', as: '数量' }, { type: 'money', as: '単価' }, { type: 'tracking', as: '送り状' }] } }
      ],
      morphisms: [{ from: 'open', to: 'reserved', by: '引き当てる' }, { from: 'reserved', to: 'shipped', by: '出荷する' }] },
    { id: 'payment', name: '支払', world: 'domain', form: 'lifecycle',
      objects: [
        { id: 'unpaid', name: '未払', at: [0, 0], holds: { parts: [{ type: 'pay_method', as: '方法' }, { type: 'money', as: '金額' }] } },
        { id: 'authorized', name: '与信済', at: [1, 0], holds: { parts: [{ type: 'pay_method', as: '方法' }, { type: 'money', as: '金額' }, { type: 'auth_code', as: '与信番号' }] } },
        { id: 'charged', name: '請求済', at: [2, 0], holds: { parts: [{ type: 'pay_method', as: '方法' }, { type: 'money', as: '金額' }, { type: 'auth_code', as: '与信番号' }] } },
        { id: 'failed', name: '失敗', at: [1, 1], holds: { parts: [{ type: 'pay_method', as: '方法' }, { type: 'text', as: '理由' }] } },
        { id: 'refunded', name: '返金済', at: [3, 0], change: '新', holds: { parts: [{ type: 'pay_method', as: '方法' }, { type: 'money', as: '金額' }, { type: 'date', as: '返金日' }] } }
      ],
      morphisms: [
        { from: 'unpaid', to: 'authorized', by: '与信を取る' },
        { from: 'authorized', to: 'charged', by: '請求する' },
        { from: 'unpaid', to: 'failed', by: '与信NG' },
        { from: 'authorized', to: 'failed', by: '請求に失敗', change: '削' },
        { from: 'charged', to: 'refunded', by: '返金する', change: '新' }
      ] },
    { id: 'shipment', name: '出荷', world: 'domain', form: 'lifecycle',
      objects: [
        { id: 'preparing', name: '準備中', holds: { parts: [{ type: 'line_ref', as: '明細' }, { type: 'address', as: '届け先' }] } },
        { id: 'sent', name: '発送済', holds: { parts: [{ type: 'line_ref', as: '明細' }, { type: 'address', as: '届け先' }, { type: 'tracking', as: '送り状番号' }] } },
        { id: 'delivered', name: '配達済', holds: { parts: [{ type: 'line_ref', as: '明細' }, { type: 'tracking', as: '送り状番号' }, { type: 'date', as: '配達日' }] } }
      ],
      morphisms: [{ from: 'preparing', to: 'sent', by: '発送する' }, { from: 'sent', to: 'delivered', by: '配達済にする' }] },
    { id: 'stock', name: '在庫', world: 'domain', form: 'value', doc: '商品ごとに 1 つ。引当で減り、入荷で増える',
      objects: [{ id: 'v', name: '在庫', holds: { parts: [{ type: 'product', as: '商品' }, { type: 'number', as: '手持ち' }, { type: 'number', as: '引当' }], invariant: '引当は手持ちを超えない' } }] },
    { id: 'money', name: '金額', world: 'domain', form: 'value', objects: [{ id: 'v', name: '金額', holds: { parts: [{ type: 'number', as: '数値' }, { type: 'currency', as: '通貨' }], invariant: '0 以上' } }] },
    { id: 'address', name: '住所', world: 'domain', form: 'value', objects: [{ id: 'v', name: '住所', holds: { parts: [{ type: 'zip', as: '郵便番号' }, { type: 'pref', as: '都道府県' }, { type: 'text', as: '市区町村' }, { type: 'text', as: '番地' }] } }] },
    { id: 'line_ref', name: '明細 ID ×N', world: 'domain', form: 'value', objects: [{ id: 'v', name: '明細 ID ×N', holds: { prim: '注文の明細を指す' } }] },
    { id: 'number', name: '数値', world: 'domain', form: 'value', objects: [{ id: 'v', name: '数値', holds: { prim: '整数', invariant: '≥ 0' } }] },
    { id: 'qty', name: '数量', world: 'domain', form: 'value', objects: [{ id: 'v', name: '数量', holds: { prim: '整数', invariant: '≥ 1' } }] },
    { id: 'zip', name: '郵便番号', world: 'domain', form: 'value', objects: [{ id: 'v', name: '郵便番号', holds: { prim: '数字 7 桁' } }] },
    { id: 'tracking', name: '送り状番号', world: 'domain', form: 'value', objects: [{ id: 'v', name: '送り状番号', holds: { prim: '英数 12 桁' } }] },
    { id: 'auth_code', name: '与信番号', world: 'domain', form: 'value', objects: [{ id: 'v', name: '与信番号', holds: { prim: '決済会社の文字列' } }] },
    { id: 'currency', name: '通貨', world: 'domain', form: 'kind', objects: [{ id: 'jpy', name: 'JPY' }, { id: 'usd', name: 'USD' }] },
    { id: 'pay_method', name: '支払方法', world: 'domain', form: 'kind', objects: [{ id: 'card', name: 'カード' }, { id: 'invoice', name: '請求書' }, { id: 'cod', name: '代引', holds: 'unit', change: '削' }] },
    { id: 'reason', name: '取消理由', world: 'domain', form: 'kind', objects: [{ id: 'customer', name: '顧客都合' }, { id: 'stockout', name: '在庫切れ', holds: { parts: [{ type: 'product', as: '商品' }] } }, { id: 'credit', name: '与信NG' }] },
    { id: 'pref', name: '都道府県', world: 'domain', form: 'value', objects: [{ id: 'v', name: '都道府県', holds: { prim: '47 都道府県の名前' } }] },
    { id: 'product', name: '商品', world: 'domain', form: 'value', objects: [{ id: 'v', name: '商品', holds: { prim: '商品ID（商品台帳を指す）' } }] },
    { id: 'customer', name: '顧客', world: 'domain', form: 'value', objects: [{ id: 'v', name: '顧客', holds: { prim: '顧客ID（顧客台帳を指す）' } }] },
    // ---- 保存（RDB）。table = 列の並び
    { id: 't_orders', name: 'orders', world: 'db', form: 'table', doc: '注文 1 件 = 1 行。住所は列に展開、合計は金額と通貨の 2 列', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'customer_id', type: 'uuid', fk: 't_customers' }, { name: 'status', type: 'text' }, { name: 'total_amount', type: 'bigint' }, { name: 'total_currency', type: 'char(3)' }, { name: 'zip', type: 'char(7)' }, { name: 'prefecture', type: 'text' }, { name: 'city', type: 'text' }, { name: 'street', type: 'text' }, { name: 'version', type: 'int' }, { name: 'updated_at', type: 'timestamptz' }] },
    { id: 't_lines', name: 'order_lines', world: 'db', form: 'table', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'order_id', type: 'uuid', fk: 't_orders' }, { name: 'product_id', type: 'uuid', fk: 't_products' }, { name: 'qty', type: 'int' }, { name: 'unit_amount', type: 'bigint' }, { name: 'unit_currency', type: 'char(3)' }, { name: 'status', type: 'text' }, { name: 'tracking_no', type: 'text', change: '削' }] },
    { id: 't_payments', name: 'payments', world: 'db', form: 'table', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'order_id', type: 'uuid', fk: 't_orders' }, { name: 'method', type: 'text' }, { name: 'status', type: 'text', change: '改' }, { name: 'amount', type: 'bigint' }, { name: 'currency', type: 'char(3)' }, { name: 'auth_code', type: 'text' }, { name: 'refunded_at', type: 'timestamptz', change: '新' }] },
    { id: 't_shipments', name: 'shipments', world: 'db', form: 'table', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'order_id', type: 'uuid', fk: 't_orders' }, { name: 'status', type: 'text' }, { name: 'tracking_no', type: 'text' }, { name: 'delivered_on', type: 'date' }] },
    { id: 't_shipment_lines', name: 'shipment_lines', world: 'db', form: 'table', columns: [
      { name: 'shipment_id', type: 'uuid', pk: true, fk: 't_shipments' }, { name: 'line_id', type: 'uuid', pk: true, fk: 't_lines' }] },
    { id: 't_stocks', name: 'stocks', world: 'db', form: 'table', columns: [
      { name: 'product_id', type: 'uuid', pk: true, fk: 't_products' }, { name: 'on_hand', type: 'int' }, { name: 'reserved', type: 'int' }, { name: 'version', type: 'int' }] },
    { id: 't_events', name: 'order_events', world: 'db', form: 'table', doc: '注文に起きたことの追記ログ。状態の復元には使わない', columns: [
      { name: 'id', type: 'bigserial', pk: true }, { name: 'order_id', type: 'uuid', fk: 't_orders' }, { name: 'kind', type: 'text' }, { name: 'payload', type: 'jsonb' }, { name: 'at', type: 'timestamptz' }] },
    { id: 't_customers', name: 'customers', world: 'db', form: 'table', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'name', type: 'text' }] },
    { id: 't_products', name: 'products', world: 'db', form: 'table', columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'name', type: 'text' }] }
  ],
  // 世界をまたぐ対応。API → ドメイン → 保存
  maps: [
    { from: 'confirm_req', to: 'order' }, { from: 'cancel_req', to: 'order' }, { from: 'reserve_req', to: 'order' }, { from: 'ship_req', to: 'shipment' },
    { from: 'order', to: 'order_res' }, { from: 'list_req', to: 't_orders' }, { from: 't_orders', to: 'list_res' },
    { from: 'order', to: 't_orders' }, { from: 'order', to: 't_lines' }, { from: 'order', to: 't_payments' }, { from: 'order', to: 't_events' }, { from: 'shipment', to: 't_shipments' }, { from: 'shipment', to: 't_shipment_lines' }, { from: 'stock', to: 't_stocks' }
  ],
  logic: [
    { id: 'auth_confirm', name: '確定できる人か問う', layer: 'usecase', note: '外部に問う（権限）', fails: ['許されていない'] },
    { id: 'auth_cancel', name: '取り消せる人か問う', layer: 'usecase', note: '外部に問う（権限）', fails: ['許されていない'] },
    { id: 'auth_list', name: '見てよい人か問う', layer: 'usecase', note: '外部に問う（権限）', fails: ['許されていない'] },
    { id: 'read_order', name: '注文と明細を読む', layer: 'persistence', ref: 'R2', fails: ['注文が無い'] },
    { id: 'read_order1', name: '注文を読む', layer: 'persistence', ref: 'R2', fails: ['注文が無い'] },
    { id: 'read_line_stock', name: '明細と在庫を読む', layer: 'persistence', ref: 'R5', fails: ['明細が無い'] },
    { id: 'read_line_order', name: '明細と注文を読む', layer: 'persistence', ref: 'R5', fails: ['明細が無い'] },
    { id: 'query_summary', name: '注文の要約を引く', layer: 'persistence', ref: 'R1', note: '注文表から直接。ドメインを通さない' },
    { id: 'total', name: '合計を出す', layer: 'domain' },
    { id: 'authorize', name: '与信を取る', layer: 'usecase', note: '外部に問う（決済）', fails: ['与信NG'] },
    { id: 'refund', name: '返金する', layer: 'usecase', note: '外部に問う（決済）', fails: ['返金NG'], change: '新' },
    { id: 'advance_order', name: '注文を進める', layer: 'domain', ref: 'C3', note: '遷移表で次の状態を引く', fails: ['表に無い遷移'] },
    { id: 'advance_order_cancel', name: '注文を進める', layer: 'domain', ref: 'C4', note: '遷移表で次の状態を引く', fails: ['表に無い遷移'] },
    { id: 'advance_order_ship', name: '注文を進める', layer: 'domain', ref: 'C8', note: '全明細が出荷済なら完了' },
    { id: 'decide_reason', name: '取消理由を決める', layer: 'domain', note: '注文と因子から' },
    { id: 'reserve', name: '引き当てる', layer: 'domain', ref: 'C6', note: '在庫を超えない', fails: ['在庫が足りない', '表に無い遷移'] },
    { id: 'ship_line', name: '出荷する', layer: 'domain', ref: 'C7', fails: ['表に無い遷移'] },
    { id: 'make_shipment', name: '出荷を作る', layer: 'domain', ref: 'C7' },
    { id: 'write_order', name: '注文と支払を書く', layer: 'persistence', note: '版を確かめて書く', fails: ['先に誰かが変えていた'] },
    { id: 'write_order1', name: '注文と支払を書く', layer: 'persistence', note: '版を確かめて書く', fails: ['先に誰かが変えていた'], change: '改' },
    { id: 'write_line_stock', name: '明細と在庫を書く', layer: 'persistence', note: '版を確かめて書く', fails: ['先に誰かが変えていた'] },
    { id: 'write_ship', name: '明細・注文・出荷を書く', layer: 'persistence', note: '版を確かめて書く', fails: ['先に誰かが変えていた'] },
    { id: 'shape_list', name: '返事を組む', layer: 'usecase' }
  ],
  // ユースケース = 列。columns が線（左が API、右が保存）、steps が箱。out は箱が出した線の新しい名前、drop は箱で終わる線
  flows: [
    { id: 'confirm', name: '確定する', columns: [{ name: '依頼者', kind: 'api' }, { name: '注文' }, { name: '明細' }, { name: '支払' }, { name: '保存データ', kind: 'stored' }],
      start: { 0: '確定の依頼', 4: '保存データ' },
      steps: [
        { logic: 'auth_confirm', span: [0, 1], out: { 0: { name: '許された依頼 ✓', kind: 'api' } } },
        { logic: 'read_order', span: [0, 4], out: { 1: { name: '注文〈下書き〉', kind: 'stored' }, 2: { name: '明細 ×N', kind: 'stored' }, 3: { name: '支払〈未払〉', kind: 'stored' } } },
        { logic: 'total', span: [2, 2], out: { 2: { name: '合計の金額' } } },
        { logic: 'authorize', span: [2, 3], out: { 3: { name: '支払〈与信済〉 ✓' } }, drop: [2] },
        { logic: 'advance_order', span: [1, 3], out: { 1: { name: '確定済の注文 ✓' } }, drop: [3] },
        { logic: 'write_order', span: [0, 4], out: { 0: { name: '確定した', kind: 'api' }, 4: { name: '更新後の保存データ', kind: 'stored' } }, drop: [1] }
      ] },
    { id: 'cancel', name: '取り消す', columns: [{ name: '依頼者', kind: 'api' }, { name: '注文' }, { name: '理由' }, { name: '保存データ', kind: 'stored' }],
      start: { 0: '取消の依頼', 3: '保存データ' },
      steps: [
        { logic: 'auth_cancel', span: [0, 1], out: { 0: { name: '許された依頼 ✓', kind: 'api' } } },
        { logic: 'read_order1', span: [0, 3], out: { 1: { name: '注文〈下書き｜確定済〉', kind: 'stored' } } },
        { logic: 'decide_reason', span: [1, 2], out: { 2: { name: '取消理由' } } },
        { logic: 'advance_order_cancel', span: [1, 2], out: { 1: { name: '取消済の注文 ✓' } }, drop: [2] },
        { logic: 'refund', span: [1, 2], out: { 2: { name: '返金済の支払 ✓' } } },
        { logic: 'write_order1', span: [0, 3], out: { 0: { name: '取り消した', kind: 'api' }, 3: { name: '更新後の保存データ', kind: 'stored' } }, drop: [1, 2] }
      ] },
    { id: 'reserve', name: '引き当てる', columns: [{ name: '依頼者', kind: 'api' }, { name: '明細' }, { name: '在庫' }, { name: '保存データ', kind: 'stored' }],
      start: { 0: '引当の依頼', 3: '保存データ' },
      steps: [
        { logic: 'read_line_stock', span: [0, 3], out: { 1: { name: '明細〈未引当〉', kind: 'stored' }, 2: { name: '在庫', kind: 'stored' } } },
        { logic: 'reserve', span: [1, 2], out: { 1: { name: '引当済の明細 ✓' }, 2: { name: '引いた在庫' } } },
        { logic: 'write_line_stock', span: [0, 3], out: { 0: { name: '引き当てた', kind: 'api' }, 3: { name: '更新後の保存データ', kind: 'stored' } }, drop: [1, 2] }
      ] },
    { id: 'ship', name: '出荷する', columns: [{ name: '依頼者', kind: 'api' }, { name: '明細' }, { name: '注文' }, { name: '出荷' }, { name: '保存データ', kind: 'stored' }],
      start: { 0: '出荷の依頼', 4: '保存データ' },
      steps: [
        { logic: 'read_line_order', span: [0, 4], out: { 1: { name: '明細〈引当済〉', kind: 'stored' }, 2: { name: '注文〈確定済〉', kind: 'stored' } } },
        { logic: 'ship_line', span: [1, 1], out: { 1: { name: '出荷済の明細 ✓' } } },
        { logic: 'make_shipment', span: [1, 3], out: { 3: { name: '出荷〈準備中〉' } } },
        { logic: 'advance_order_ship', span: [1, 2], change: '削' },
        { logic: 'write_ship', span: [0, 4], out: { 0: { name: '出荷した', kind: 'api' }, 4: { name: '更新後の保存データ', kind: 'stored' } }, drop: [1, 2, 3] }
      ] },
    { id: 'list', name: '一覧を見る', columns: [{ name: '依頼者', kind: 'api' }, { name: '要約' }, { name: '保存データ', kind: 'stored' }],
      start: { 0: '一覧の問い合わせ', 2: '保存データ' },
      steps: [
        { logic: 'auth_list', span: [0, 1], out: { 0: { name: '許された問い合わせ ✓', kind: 'api' } } },
        { logic: 'query_summary', span: [0, 2], out: { 1: { name: '注文の要約 ×N', kind: 'stored' } } },
        { logic: 'shape_list', span: [0, 1], out: { 0: { name: '一覧の返事', kind: 'api' } }, drop: [1] }
      ] }
  ]
};

test('広い画面で、あらゆる倍率・位置・固定・選択を描ける', () => {
  for (const view of ['struct', 'flow']) {
    const map = mapOf(MODEL, 2600, 1600)
    map.state.view = view
    map.renderVals()
    const board = map.L(view, 1)
    for (let k = 0; k < 30; k++) {
      const s = 0.08 * Math.pow(1.2, k)
      for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.3], [0.3, 0.9]]) {
        map.state.cam[view] = { s, tx: 1300 - board.w * fx * s, ty: 800 - board.h * fy * s }
        CoderMap.View.markup(map.renderVals())
      }
    }
  }
  const map = mapOf(MODEL, 2600, 1600)
  const paths = [...new Set(map.L('struct', 0.6).shapes.filter(n => n.ref?.path).map(n => n.ref.path))]
  assert(paths.length > 20)
  for (const path of paths) {
    map.pins = { [path]: 1 }; map.pinTo = { [path]: 1 }; map.layouts = {}; map.keys = []
    for (const s of [0.2, 0.4, 0.8, 1.6]) { map.state.cam.struct = { s, tx: 0, ty: 0 }; map.renderVals() }
  }
  map.pins = {}; map.pinTo = {}; map.layouts = {}; map.keys = []
  for (const s of [0.1, 0.15, 0.2, 0.3, 0.5, 0.8, 1.2, 2.4]) {
    const board = map.L('struct', s)
    map.state.cam.struct = { s, tx: 0, ty: 0 }
    for (const n of [...board.shapes, ...(board.hits ?? [])].filter(n => n.ref)) { map.state.sel = { id: n.id, ref: n.ref, wx: n.x, wy: n.y, box: n }; map.renderVals() }
  }
  map.state.view = 'flow'
  map.state.cam.flow = { s: 1, tx: 0, ty: 0 }
  for (const n of map.L('flow').shapes.filter(n => n.ref)) { map.state.sel = { id: n.id, ref: n.ref, wx: n.x, wy: n.y, box: n }; map.renderVals() }
})

test('押して固定した箱は、押した所に左上を留めたまま開く（はみ出すなら画面に寄せる）', () => {
  const map = mapOf(MODEL, 800, 552)
  map.state.cam.struct = map.camOf('struct')
  const corner = n => { const cam = map.camOf('struct'); return [n.x * cam.s + cam.tx + 1, n.y * cam.s + cam.ty + 1] }
  const shape = id => map.L('struct', map.camOf('struct').s).shapes.find(x => x.id === id)
  const press = n => {
    const [ax, ay] = corner(n)
    map.tap([ax + 4, ay + 4])
    settle()
    const c = map.camOf('struct'), m = shape(n.id), V = map.viewport()
    const left = m.x * c.s + c.tx, right = left + m.w * c.s, top = m.y * c.s + c.ty, bottom = top + m.h * c.s, dx = left - ax, dy = top - ay
    const wide = m.w * c.s > V.w - 32, tall = m.h * c.s > V.h - 84
    const panned = right > V.w - 16 + 1 || bottom > V.h - 72 + 1 || Math.abs(dx) > 10 || Math.abs(dy) > 10
    const stayed = !panned && Math.abs(dx) <= 10 && Math.abs(dy) <= 10
    const fitted = (wide ? Math.abs(left - 16) <= 2 : right <= V.w - 16 + 2) && (tall ? Math.abs(top - 12) <= 2 : bottom <= V.h - 72 + 2)
    assert(stayed || fitted, `${n.id}: ${[left, top, right, bottom].map(Math.round)}`)
  }
  // 開いている箱を押すと選ぶだけ
  press(shape('order#confirmed'))
  assert.equal(map.state.sel.id, 'order#confirmed')
  // 寄ってから、閉じた箱を入れ子の奥へ順に押す。押した箱は開いたまま固定される
  const [zx, zy] = corner(shape('order#confirmed'))
  map.zoomAt(2.2, zx, zy)
  for (const id of ['order#confirmed/支払#unpaid/金額', 'order#confirmed/支払#unpaid/金額#v/数値']) {
    const n = shape(id)
    assert(n.ref.open < 1 && map.hitScreen(corner(n).map(v => v + 4))?.id === id, id)
    press(n)
    assert.equal(map.pins[n.ref.path], 1, id)
  }
})

test('流れ: 線の名前が読め、選んだ線は濃く、構造へ切り替えると的の型が画面に収まる', () => {
  const map = mapOf(MODEL, 1024, 720)
  map.state.view = 'flow'
  const board = map.L('flow')
  map.state.cam.flow = map.camOf('flow')
  assert(map.renderVals().texts.some(t => t.text === '合計を出す'))
  const draft = board.hits.find(h => h.ref.label === '注文〈下書き〉')
  map.state.sel = { id: draft.id, ref: draft.ref, wx: draft.x, wy: draft.y, box: draft }
  const label = map.renderVals().texts.find(t => t.text === '注文〈下書き〉')
  assert.match(label.style, /#3F5577/)
  assert.match(label.style, /font-weight:700/)
  const lines = board.hits.find(h => h.ref.label === '明細 ×N')
  map.state.sel = { id: lines.id, ref: lines.ref, wx: 0, wy: 0, box: lines }
  map.state.view = 'struct'
  map.lastL = {}
  map.flyLinked('struct')
  settle()
  const c = map.camOf('struct'), box = map.L('struct', c.s).shapes.filter(x => x.ref?.kind === 'type' && x.ref.t.id === 'line').sort((a, b) => a.id.length - b.id.length)[0]
  assert(box.w * c.s <= 1024 && box.h * c.s <= 720)
})

test('ホバーは不変条件だけを注釈に出し、背景を押すと選択が外れる', () => {
  const map = mapOf(MODEL, 390, 796)
  const cam = map.camOf('struct')
  map.state.cam.struct = cam
  const target = map.L('struct', cam.s).shapes.find(n => n.ref?.kind === 'object' && n.ref.o.holds.invariant && Math.max(n.w, n.h) * cam.s >= 8)
  map.hoverAt([(target.x + target.w / 2) * cam.s + cam.tx, (target.y + target.h / 2) * cam.s + cam.ty])
  const shown = map.renderVals()
  assert.equal(map.state.hover.id, target.id)
  assert.equal(shown.popText, target.ref.o.holds.invariant)
  assert.match(shown.vpStyle, /cursor:pointer/)
  map.state.sel = map.state.hover
  map.tap([2, 790])
  assert.equal(map.state.sel, null)
})

test('設計図が書き換わると盤面を組み直し、見ている場所は残して選択を外す', () => {
  const map = mapOf(MODEL, 390, 796)
  map.state.cam.struct = { s: 0.5, tx: 10, ty: 20 }
  map.state.sel = { id: 'order', ref: map.L('struct', 0.5).shapes.find(n => n.id === 'order').ref }
  const before = map.L('struct', 0.5)
  map.setModel({ ...MODEL, name: '受注' })
  assert.notEqual(map.L('struct', 0.5), before)
  assert.deepEqual(map.state.cam.struct, { s: 0.5, tx: 10, ty: 20 })
  assert.equal(map.state.sel, null)
  assert.equal(map.renderVals().title, '受注')
})

test('流れがまだ無い・型がまだ無い設計図も描け、流れが無ければ構造を見せる', () => {
  const noFlows = mapOf({ ...MODEL, flows: [] }, 390, 796)
  noFlows.state.view = 'flow'
  noFlows.setModel({ ...MODEL, flows: [], name: '型だけ' })
  assert.equal(noFlows.hasFlows(), false)
  assert.equal(noFlows.state.view, 'struct')
  assert(noFlows.renderVals().shapes.length > 0)
  const noTypes = mapOf({ ...MODEL, types: [], maps: [] }, 390, 796)
  for (const view of ['struct', 'flow']) { noTypes.state.view = view; noTypes.renderVals() }
  noTypes.fitAll()
  settle()
})

test('盤面の文字は HTML として埋めない', () => {
  const map = mapOf({ ...MODEL, worlds: MODEL.worlds.map(w => (w.id === 'domain' ? { ...w, name: '<img src=x onerror=alert(1)>' } : w)) }, 2600, 1600)
  map.state.cam.struct = { s: 0.5, tx: 0, ty: 0 }
  const html = CoderMap.View.markup(map.renderVals())
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert(!html.includes('<img'))
})
