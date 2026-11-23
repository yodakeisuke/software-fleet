// coder の地図（dashboard.html の <script id="coder-map">）を、ページから切り出したそのままの形で Node で動かす。見るのは配置（DOM に触れない計算）の規則。描画と操作はブラウザで確かめる（docs/qa-done.md の Q5）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8')
const source = page.match(/<script id="coder-map">([\s\S]*?)<\/script>/)[1]
const CoderMap = new Function(`${source}\nreturn CoderMap`)()
const PHONE = { w: 390, h: 796 }, WIDE = { w: 1280, h: 800 }
// 構造の配置。深さ D まで開いた図（最初に全部開いた図で折り返しの並びを決める）
const structure = model => { const engine = CoderMap.Structure(); engine.use(model); return engine }
const placed = (model, D, v = WIDE) => { const engine = structure(model); engine.order(v); return engine.place(D, v) }
const frames = board => board.cols.flatMap(col => col.frames)
const frameOf = (board, id) => frames(board).find(frame => frame.t.id === id)
// 状態（箱）の id → [列, 行]
const cellsOf = frame => Object.fromEntries(frame.t.objects.map((object, i) => [object.id, [frame.cells[i].c, frame.cells[i].r]]))
// 状態機械 1 つだけの設計図。arrows は [from, to] の列
const machine = (states, arrows, at = {}) => ({
  ...EMPTY, types: [{ id: 'm', name: '機械', world: 'domain', form: 'lifecycle', objects: states.map(id => ({ id, name: id, ...(at[id] ? { at: at[id] } : {}) })), morphisms: arrows.map(([from, to]) => ({ from, to, by: `${from}から${to}へ` })) }],
})
const EMPTY = { name: '例', worlds: [{ id: 'api', name: '境界' }, { id: 'domain', name: 'ドメイン' }, { id: 'db', name: '保存' }], types: [], maps: [], logic: [], flows: [] }

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
        { from: 'confirmed', to: 'shipping', by: '一部が出荷済', auto: true },
        { from: 'shipping', to: 'done', by: '全明細が出荷済', auto: true },
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
    { id: 'read_order', name: '注文と明細を読む', layer: 'persistence', fails: ['注文が無い'] },
    { id: 'read_order1', name: '注文を読む', layer: 'persistence', fails: ['注文が無い'] },
    { id: 'read_line_stock', name: '明細と在庫を読む', layer: 'persistence', fails: ['明細が無い'] },
    { id: 'read_line_order', name: '明細と注文を読む', layer: 'persistence', fails: ['明細が無い'] },
    { id: 'query_summary', name: '注文の要約を引く', layer: 'persistence', note: '注文表から直接。ドメインを通さない' },
    { id: 'total', name: '合計を出す', layer: 'domain' },
    { id: 'authorize', name: '与信を取る', layer: 'usecase', note: '外部に問う（決済）', fails: ['与信NG'] },
    { id: 'refund', name: '返金する', layer: 'usecase', note: '外部に問う（決済）', fails: ['返金NG'], change: '新' },
    { id: 'advance_order', name: '注文を進める', layer: 'domain', note: '遷移表で次の状態を引く', fails: ['表に無い遷移'] },
    { id: 'advance_order_cancel', name: '注文を進める', layer: 'domain', note: '遷移表で次の状態を引く', fails: ['表に無い遷移'] },
    { id: 'advance_order_ship', name: '注文を進める', layer: 'domain', note: '全明細が出荷済なら完了' },
    { id: 'decide_reason', name: '取消理由を決める', layer: 'domain', note: '注文と因子から' },
    { id: 'reserve', name: '引き当てる', layer: 'domain', note: '在庫を超えない', fails: ['在庫が足りない', '表に無い遷移'] },
    { id: 'ship_line', name: '出荷する', layer: 'domain', fails: ['表に無い遷移'] },
    { id: 'make_shipment', name: '出荷を作る', layer: 'domain' },
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
}

test('状態機械は、いちばん長い道筋を 1 行目に一直線に置き、流れは左から右', () => {
  const cells = cellsOf(frameOf(placed(machine(['a', 'x', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'x'], ['x', 'd']]), 1), 'm'))
  assert.deepEqual([cells.a, cells.b, cells.c, cells.d], [[0, 0], [1, 0], [2, 0], [3, 0]])
  assert.deepEqual(cells.x, [1, 1])
})

test('脇の状態は矢の交差が最小、次に矢が短くなる行に置き、同点は書いた順', () => {
  // 契約: 一時停止を先に書いても、解約済へ矢が出る解約予約が上に来る
  const contract = machine(['trial', 'active', 'past_due', 'paused', 'canceling', 'canceled'], [
    ['trial', 'active'], ['trial', 'canceled'], ['active', 'active'], ['active', 'past_due'], ['past_due', 'active'], ['past_due', 'canceled'],
    ['active', 'paused'], ['paused', 'active'], ['active', 'canceling'], ['canceling', 'active'], ['canceling', 'canceled'],
  ])
  assert.deepEqual(cellsOf(frameOf(placed(contract, 1), 'm')), { trial: [0, 0], active: [1, 0], past_due: [2, 0], canceled: [3, 0], canceling: [2, 1], paused: [2, 2] })
  const tie = cellsOf(frameOf(placed(machine(['a', 'b', 'c', 'x', 'y'], [['a', 'b'], ['b', 'c'], ['a', 'x'], ['a', 'y']]), 1), 'm'))
  assert.deepEqual([tie.x, tie.y], [[1, 1], [1, 2]])
})

test('戻る矢があっても列は決まり、at で置いた図は指定どおり', () => {
  const back = cellsOf(frameOf(placed(machine(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]), 1), 'm'))
  assert.deepEqual(back, { a: [0, 0], b: [1, 0], c: [2, 0] })
  const fixed = cellsOf(frameOf(placed(machine(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], { a: [0, 0], b: [0, 1], c: [1, 1] }), 1), 'm'))
  assert.deepEqual(fixed, { a: [0, 0], b: [0, 1], c: [1, 1] })
})

test('自分へ戻る矢は 1 本ごとに名札 1 行ぶん、その状態の上を空ける（空けないと名前が重なる）', () => {
  const above = loops => { const frame = frameOf(placed(machine(['a', 'b'], [['a', 'b'], ...Array(loops).fill(['b', 'b'])]), 1), 'm'); return { y: frame.boxes[1].y, line: frame.fl } }
  const [one, two, three] = [1, 2, 3].map(above)
  assert(two.y - one.y >= one.line && three.y - two.y >= one.line, `${one.y} → ${two.y} → ${three.y}（名札 ${one.line}）`)
})

test('最上位は部品になっていない型だけを書いた順に並べ、区画は worlds の並びに依らず 境界 → ドメイン → 保存', () => {
  const board = placed({ ...MODEL, worlds: [...MODEL.worlds].reverse() }, 0)
  assert.deepEqual(board.cols.map(col => col.w.id), ['api', 'domain', 'db'])
  assert.deepEqual(board.cols[1].frames.map(frame => frame.t.id), ['order', 'shipment', 'stock'])
  assert(board.cols[0].x < board.cols[1].x && board.cols[1].x < board.cols[2].x)
  const tall = placed(MODEL, 0, PHONE)
  assert(tall.cols[0].y < tall.cols[1].y && tall.cols[1].y < tall.cols[2].y)
})

test('自分を含む型（木）も最上位に出て、中の自分は名前だけの行になる', () => {
  const org = { id: 'org', name: '組織', world: 'domain', form: 'value', objects: [{ id: 'v', name: '組織', holds: { parts: [{ type: 'org', as: '上位' }] } }] }
  const board = placed({ ...EMPTY, types: [org] }, 3)
  assert.deepEqual(frames(board).map(frame => frame.t.id), ['org'])
  assert.equal(frameOf(board, 'org').rec.rows[0].leaf, true)
})

test('開いていない箱は名前の大きさで、開くと中身のぶん育つ', () => {
  const shut = frameOf(placed(MODEL, 0), 'order'), open = frameOf(placed(MODEL, 1), 'order'), deep = frameOf(placed(MODEL, 2), 'order')
  assert.equal(shut.leaf, true)
  assert.equal(shut.boxes, undefined)
  assert.equal(open.boxes.length, 5)
  assert(shut.h < open.h / 2 && shut.w < open.w / 2)
  assert(open.boxes.every(state => state.rec === undefined))
  assert(deep.boxes.some(state => state.rec) && deep.w > open.w && deep.h > open.h)
})

test('折り返しの並びは最初に一度決めて、どの深さに開いても変えない', () => {
  for (const v of [PHONE, WIDE]) {
    const engine = structure(MODEL)
    engine.home(v)
    const breaks = D => engine.place(D, v).cols.map(col => col.frames.map(frame => frame.x === col.x))
    for (let D = 1; D <= CoderMap.DEEP; D++) assert.deepEqual(breaks(D), breaks(0))
  }
  // 縦長の画面は 1 列
  assert(placed(MODEL, 2, PHONE).cols.every(col => col.frames.every(frame => frame.x === col.x)))
})

test('最初の画面は、収まって名前が読める範囲でいちばん深く開く', () => {
  const phone = structure(MODEL).home(PHONE), wide = structure(MODEL).home(WIDE)
  assert.equal(phone.placed.depth, 0)
  assert.equal(wide.placed.depth, 1)
  for (const { placed: board, cam } of [phone, wide]) assert(cam.s < CoderMap.openAt(board.depth + 1) && board.W * cam.s <= (board === phone.placed ? PHONE : WIDE).w)
  const small = structure(machine(['a', 'b'], [['a', 'b']])).home(WIDE)
  assert(small.placed.depth >= 1)
})

test('縦長の画面では、世界の間は寄っても育たず、同じ世界の型の間より狭くならない。最初の画面は左の端から', () => {
  // 世界の間 = 上の世界の最後の箱の下から、下の世界の最初の箱の上まで（下の世界の名前の場所を含む）
  const between = board => { const [above, below] = board.cols; return below.frames[0].y - Math.max(...above.frames.map(frame => frame.y + frame.h)) }
  // 型の間 = 同じ世界で上下に並ぶ箱の間のいちばん狭い所
  const within = board => Math.min(...board.cols.flatMap(col => { const ys = [...col.frames].sort((a, b) => a.y - b.y); return ys.slice(1).map((frame, i) => frame.y - (ys[i].y + ys[i].h)).filter(gap => gap > 0) }))
  const phone = D => placed(MODEL, D, PHONE)
  for (let D = 0; D < 4; D++) assert(between(phone(D + 1)) < between(phone(D)))
  for (let D = 0; D <= 4; D++) assert(between(phone(D)) > within(phone(D)))
  // 横長は世界を横に並べるので、名前の場所はどの深さでも同じ
  assert.equal(placed(MODEL, 2, WIDE).cols[0].top, placed(MODEL, 0, WIDE).cols[0].top)
  assert.equal(structure(MODEL).home(PHONE).cam.tx, 16)
})

test('倍率が上がると 1 段ずつ開き、境目では少し粘る', () => {
  const { openAt, levelOf } = CoderMap
  assert.equal(levelOf(openAt(1) * 0.99, 0), 0)
  assert.equal(levelOf(openAt(1), 0), 1)
  assert.equal(levelOf(openAt(2) * 1.01, 1), 2)
  assert.equal(levelOf(openAt(2) * 0.95, 2), 2)
  assert.equal(levelOf(openAt(2) * 0.9, 2), 1)
})

test('中に変更がある箱は畳んでいても「改」を告げ、自分の印はそのまま。全部が同じ印なら出さない', () => {
  const shut = placed(MODEL, 0)
  assert.equal(frameOf(shut, 'order').change, '改')
  assert.equal(frameOf(shut, 't_payments').change, '改')
  assert.equal(frameOf(shut, 'shipment').change, undefined)
  const order = frameOf(placed(MODEL, 1), 'order')
  assert.equal(order.change, undefined)
  assert.equal(order.boxes.find(state => state.o.id === 'confirmed').change, '改')
  assert.equal(order.boxes.find(state => state.o.id === 'draft').change, undefined)
  const fresh = { ...MODEL, types: MODEL.types.map(type => ({ ...type, change: '新' })) }
  assert.equal(frameOf(placed({ ...MODEL, types: MODEL.types.map(type => (type.id === 'stock' ? { ...type, change: '新' } : type)) }, 0), 'stock').change, '新')
  assert(frames(placed(fresh, 0)).every(frame => frame.change === undefined))
})

test('流れの箱の種類: ドメインは出す線の型の形から決まり、✓ と ×N が付いた線も型に結ぶ', () => {
  const kinds = id => CoderMap.Flow.place(MODEL, WIDE).flows.find(lay => lay.flow.id === id).boxes.map(box => box.kind)
  assert.deepEqual(kinds('confirm'), ['ユースケース', '入出力', '計算', 'ユースケース', '遷移', '入出力'])
  assert.deepEqual(kinds('cancel').slice(2, 4), ['判断', '遷移'])
  assert.equal(kinds('ship')[3], 'ドメイン')
  const model = structuredClone(MODEL)
  model.flows.find(flow => flow.id === 'reserve').steps[1].out[1].name = '引当済の明細 ✓ ×N'
  assert.equal(CoderMap.Flow.place(model, WIDE).flows.find(lay => lay.flow.id === 'reserve').boxes[1].kind, '遷移')
  // 結び方は src/skills/coder/logic/wires.ts の写し
  assert.equal(CoderMap.typeOf(MODEL, '確定済の注文 ×N ✓').id, 'order')
  assert.equal(CoderMap.typeOf(MODEL, '注文の要約 ×N').id, 'summary')
  assert.equal(CoderMap.typeOf(MODEL, '確定した'), undefined)
  assert.deepEqual(CoderMap.statesOf('注文〈下書き｜確定済〉'), ['下書き', '確定済'])
})

test('流れの線は生まれてから受ける箱まで 1 本で、箱の脇を通る線はその箱が切らない', () => {
  const lay = CoderMap.Flow.place(MODEL, WIDE).flows.find(l => l.flow.id === 'confirm')
  const runs = name => lay.segs.filter(seg => seg.w.name === name).map(seg => [seg.c, seg.g0, seg.open ? 'end' : seg.to])
  // 注文〈下書き〉は 2 段目で生まれ、3・4 段目（合計・与信）の脇を通って 5 段目に入る
  assert.deepEqual(runs('注文〈下書き〉'), [[1, 2, 4]])
  assert.deepEqual(runs('確定した'), [[0, 6, 'end']])
  assert(lay.boxes.every((box, i) => i === 0 || box.y >= lay.boxes[i - 1].y + lay.boxes[i - 1].h))
})

test('丸ごと新しい流れは題名に 1 度だけ印を出し、箱には処理そのものの印だけを残す', () => {
  const model = structuredClone(MODEL)
  model.flows.find(flow => flow.id === 'cancel').steps.forEach(step => { step.change = '新' })
  const cancel = CoderMap.Flow.place(model, WIDE).flows.find(lay => lay.flow.id === 'cancel')
  assert.equal(cancel.whole, '新')
  assert.deepEqual(cancel.boxes.map(box => box.ch), [undefined, undefined, undefined, undefined, '新', '改'])
  const ship = CoderMap.Flow.place(MODEL, WIDE).flows.find(lay => lay.flow.id === 'ship')
  assert.equal(ship.whole, undefined)
  assert.equal(ship.boxes[3].ch, '削')
})

test('凡例は、その面のその設計図に出ている色だけ', () => {
  assert.deepEqual(CoderMap.legendOf(MODEL, 'struct'), { api: true, db: true, new: true, mod: true, imp: true, chk: false })
  const plain = { ...machine(['a', 'b'], [['a', 'b']]), logic: [{ id: 'l', name: '進める', layer: 'domain' }], flows: [{ id: 'f', name: '進める', columns: [{ name: '機械' }], start: { 0: '機械〈a〉' }, steps: [{ logic: 'l', span: [0, 0], out: { 0: { name: '機械〈b〉' } } }] }] }
  assert.deepEqual(CoderMap.legendOf(plain, 'struct'), { api: false, db: false, new: false, mod: false, imp: true, chk: false })
  assert.deepEqual(CoderMap.legendOf(plain, 'flow'), { api: false, db: false, new: false, mod: false, imp: false, chk: false })
  // 削だけでも、畳んだ箱は「改」で告げる
  const cut = structuredClone(plain)
  cut.types[0].morphisms[0].change = '削'
  assert.deepEqual(CoderMap.legendOf(cut, 'struct'), { api: false, db: false, new: false, mod: true, imp: true, chk: false })
  // コードで型になっていない形（code の無い型。破線の枠）があるときだけ、構造の面に出る。表は数えない
  assert.equal(CoderMap.legendOf(plain, 'struct').imp, true)
  assert.equal(CoderMap.legendOf(plain, 'flow').imp, false)
  const named = structuredClone(plain)
  named.types[0].code = 'Machine'
  assert.equal(CoderMap.legendOf(named, 'struct').imp, false)
  // 流れの線に ✓ があるときだけ、流れの面に ✓ の意味が出る
  const proven = structuredClone(plain)
  proven.flows[0].steps[0].out[0].name = '機械〈b〉 ✓'
  assert.equal(CoderMap.legendOf(proven, 'flow').chk, true)
  assert.equal(CoderMap.legendOf(proven, 'struct').chk, false)
})

test('型がまだ無い・流れがまだ無い・段がまだ無い設計図も置ける', () => {
  const noTypes = { ...MODEL, types: [], maps: [], flows: [{ id: 'f', name: '空の流れ', columns: [{ name: '値' }], start: { 0: '値' }, steps: [] }] }
  assert.deepEqual(structure(noTypes).home(PHONE).placed.cols, [])
  assert.equal(CoderMap.Flow.place(noTypes, PHONE).flows[0].whole, undefined)
  assert.deepEqual(CoderMap.legendOf(noTypes, 'struct'), { api: false, db: false, new: false, mod: false, imp: false, chk: false })
  assert.deepEqual(CoderMap.Flow.place({ ...MODEL, flows: [] }, PHONE).flows, [])
  const unit = { id: 'ok', name: '受け付けた', world: 'api', form: 'record', objects: [{ id: 'v', name: '受け付けた' }] }
  assert.equal(frameOf(placed({ ...MODEL, types: [...MODEL.types, unit] }, 2), 'ok').leaf, true)
})

test('配置は設計図を書き換えない（書き換えると、同じ設計図を毎回組み直すことになる）', () => {
  const before = JSON.stringify(MODEL)
  structure(MODEL).home(PHONE)
  for (let D = 0; D <= CoderMap.DEEP; D++) placed(MODEL, D)
  CoderMap.Flow.place(MODEL, PHONE)
  assert.equal(JSON.stringify(MODEL), before)
})

test('DB の文字列は文字としてだけ入れ、HTML として解釈しない', () => {
  assert(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source))
})
