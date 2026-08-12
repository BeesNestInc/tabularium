// トップレベルの宣言を「共有スコープへの代入」に変換する precompile。
// 概念は livenote / jsconsole の方式（async IIFE に包み、トップレベル宣言を
// 代入に変換、最終式を return する）をベースに独自再実装。
// これにより Script ブロック間で let/const/var/function/class が共有できる。
import { parse } from '@babel/parser';

/**
 * ユーザーコードを変換し、実行用の関数本体（文の列）を返す。
 * 呼び出し側はこの本体を `with(scope) { ... }` の中で非同期実行する。
 */
export function precompile(code) {
  const src = String(code ?? '');
  if (!src.trim()) return '';

  // async 関数の本体として解析し、トップレベル文を特定する
  const wrapped = `(async () => {\n${src}\n})()`;
  const root = parse(wrapped, { sourceType: 'script', errorRecovery: false });
  const body = root.program.body[0]?.expression?.callee?.body;
  if (!body || !Array.isArray(body.body)) {
    return src;
  }

  const statements = body.body;
  const changes = [];

  // 先頭の "use strict" ディレクティブは除去（with が使えないため）
  for (const d of body.directives || []) {
    if (d.value && d.value.value === 'use strict') {
      changes.push({ text: '', start: d.start, end: d.end });
    }
  }

  const isTopLevel = (node) => statements.includes(node);

  for (const node of statements) {
    if (node.type === 'VariableDeclaration' && isTopLevel(node)) {
      // let/const/var → 共有スコープへの代入 void (x = init)
      changes.push({ text: 'void', start: node.start, end: node.start + node.kind.length });
      const first = node.declarations[0];
      const last = node.declarations[node.declarations.length - 1];
      changes.push({ text: '(', start: first.start, end: first.start });
      for (const decl of node.declarations) {
        if (!decl.init) {
          changes.push({ text: ' = undefined', start: decl.end, end: decl.end });
        }
      }
      changes.push({ text: ')', start: last.end, end: last.end });
    } else if (node.type === 'FunctionDeclaration' && isTopLevel(node)) {
      // function f(){} → f = function f(){}
      changes.push({ text: `${node.id.name} = `, start: node.start, end: node.start });
    } else if (node.type === 'ClassDeclaration' && isTopLevel(node) && node.id) {
      // class C{} → C = class C{}
      changes.push({ text: `${node.id.name} = `, start: node.start, end: node.start });
    }
  }

  // 最後の式文を return {returnValue: (expr)} にする
  // （宣言の変換はすべて最終式より前にあり、挿入位置が前方なのでオフセットは不変）
  const last = statements[statements.length - 1];
  if (last && last.type === 'ExpressionStatement' && !/;\s*$/.test(src)) {
    changes.push({ text: 'return {returnValue: (', start: last.start, end: last.start });
    const endOffset = wrapped[last.end - 1] === ';' ? last.end - 1 : last.end;
    changes.push({ text: ')}', start: endOffset, end: endOffset });
  }

  // 変更を後ろから適用
  let out = wrapped;
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i];
    out = out.slice(0, ch.start) + ch.text + out.slice(ch.end);
  }

  // 外側の (async () => { ... })() を剥がして「文の列」だけ返す
  const prefix = '(async () => {\n';
  const suffix = '\n})()';
  if (out.startsWith(prefix) && out.endsWith(suffix)) {
    out = out.slice(prefix.length, out.length - suffix.length);
  }
  return out;
}
