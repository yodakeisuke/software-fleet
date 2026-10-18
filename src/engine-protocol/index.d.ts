export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// 基本の型。作れるのは logic/primitive の of だけ（brand で素の値と見分ける）
export type NonEmptyString = string & { readonly brand: 'NonEmptyString' }
export type PositiveInt = number & { readonly brand: 'PositiveInt' }
export type NonEmptyList<T> = readonly [T, ...T[]]
