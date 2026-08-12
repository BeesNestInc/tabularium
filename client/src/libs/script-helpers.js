// Script ブロックの実行スコープに注入する「追加ヘルパー」のレジストリ。
// extensions.js などから registerScriptHelper('名前', 値) で登録すると、
// js:run ブロック内でその名前がそのまま使える（例: std ライブラリ）。
const helpers = new Map();

export const registerScriptHelper = (name, value) => {
  helpers.set(name, value);
};

export const getScriptHelpers = () => Object.fromEntries(helpers);
