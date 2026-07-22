const detectLocale = () => {
  if (typeof navigator === 'undefined') return 'en';
  return (navigator.language || '').split('-')[0] || 'en';
};

const messages = {};

const en = {
  '保存': 'Save',
  '保存中...': 'Saving...',
  '保存して終了': 'Save & Exit',
  '取消': 'Cancel',
  'キャンセル': 'Cancel',
  '編集': 'Edit',
  '削除': 'Delete',
  '削除する': 'Delete',
  '印刷': 'Print',
  '閉じる': 'Close',
  '作成': 'Create',
  '作成中...': 'Creating...',
  '追加': 'Add',
  '追加中...': 'Adding...',
  '新規': 'New',
  '新規ファイル': 'New File',
  '新規フォルダ': 'New Folder',
  '開く': 'Open',
  '開閉': 'Toggle',
  '貼り付け': 'Paste',
  '元に戻す': 'Undo',
  '切り取り': 'Cut',
  'ダウンロード': 'Download',
  'SVG出力': 'Export SVG',
  '出力中...': 'Exporting...',
  '保存しました': 'Saved',
  '保存失敗: {0}': 'Save failed: {0}',
  'SVG保存完了 → {0}': 'SVG saved → {0}',
  'SVG保存失敗: {0}': 'SVG save failed: {0}',
  'SVGデコード失敗': 'SVG decode failed',
  '作成失敗: {0}': 'Create failed: {0}',
  '削除失敗: {0}': 'Delete failed: {0}',
  '移動失敗: {0}': 'Move failed: {0}',
  '復元失敗: {0}': 'Restore failed: {0}',
  '更新失敗: {0}': 'Update failed: {0}',
  '追加失敗: {0}': 'Add failed: {0}',
  '読み込み中...': 'Loading...',
  'ファイルを選択してください': 'Select a file',
  'ファイルが存在しません': 'File not found',
  'ナレッジ': 'Knowledge',
  'ナレッジがありません。': 'No knowledge base found.',
  'ルート設定': 'Root Settings',
  '隠しファイルを表示': 'Show Hidden Files',
  '新規ファイル作成': 'Create New File',
  'ルート設定': 'Root Settings',
  'ルート名 (例: wiki)': 'Root name (e.g., wiki)',
  'パス (例: /path/to/dir)': 'Path (e.g., /path/to/dir)',
  '(ルート)': '(root)',
  'ファイル名': 'Filename',
  'ファイル名に拡張子が含まれない場合、選択した種類の拡張子を自動付与します': 'If the filename has no extension, the selected type will be appended automatically.',
  'カレンダー': 'Calendar',
  'カレンダー一覧': 'Calendar List',
  '図 (draw.io)': 'Diagram (draw.io)',
  '図 (Mermaid)': 'Diagram (Mermaid)',
  'フォルダ名:': 'Folder name:',
  'フォルダ名にパス区切り文字は使えません': 'Folder name must not contain path separators',
  'タイトル:': 'Title:',
  '日時:': 'Date:',
  '終了:': 'End:',
  '場所:': 'Location:',
  '詳細:': 'Details:',
  '元:': 'Source:',
  '件名': 'Subject',
  '色': 'Color',
  '自動': 'Auto',
  '終日': 'All day',
  '繰り返す': 'Repeat',
  '毎': 'Every',
  '日': 'day',
  '週': 'week',
  '月': 'month',
  '年': 'year',
  '毎{0}': 'Every {0}',
  ' {0}回': ' {0} times',
  '回': 'time(s)',
  'なし': 'None',
  '日付指定': 'By date',
  'N回後': 'After N times',
  '予定なし': 'No events',
  '他 {0} 件': '{0} more',
  '今日': 'Today',
  'イベント編集': 'Edit Event',
  '新規イベント': 'New Event',
  '全ての予定': 'All events',
  'このイベントだけ': 'Only this event',
  'この予定を削除': 'Delete this event',
  'この予定だけ削除': 'Delete this event only',
  'すべての予定を削除': 'Delete all events',
  '保存先': 'Save to',
  'このイベントを削除しますか？': 'Delete this event?',
  '"{0}" を削除しますか？': 'Delete "{0}"?',
  '"{0}" を削除しますか？（.trash/ に移動します）': 'Delete "{0}"? (moves to .trash/)',
  'ルート「{0}」を削除しますか？': 'Delete root "{0}"?',
  '図が変更されています。保存しますか？': 'The diagram has been modified. Save?',
  '繰り返しイベントの移動はイベントをクリックして編集してください。': 'Drag recurring events by clicking and editing.',
  'ファイルの読み込みに失敗しました': 'Failed to load file',
  'インポートできるイベントが見つかりませんでした': 'No importable events found',
  '{0}件中{1}件をインポートしました': 'Imported {1} of {0} events',
  '（{0}件はUID重複のためスキップ）': '({0} skipped due to UID conflict)',
  '{0}件中0件をインポートしました（すべてUID重複）': 'Imported 0 of {0} events (all UID conflict)',
  'ICSパースエラー: {0}': 'ICS parse error: {0}',
  'カレンダー追加': 'Add Calendar',
  'カレンダーファイルのパス': 'Calendar file path',
  '例: knowledge/calendars/team.ical': 'e.g., knowledge/calendars/team.ical',
  'ナレッジ上の絶対パスで指定してください': 'Specify an absolute path in the knowledge base',
  'クリックで色変更': 'Click to change color',
  '＋追加': '+ Add',
  '📥 ICS取込': '📥 Import ICS',
  '📤 ICS出力': '📤 Export ICS',
  '表': 'Table',
  'グラフ': 'Chart',
  '実行中...': 'Running...',
  'クエリ結果は空です': 'No results',
  'グラフに適したカラムがありません': 'No suitable columns for chart',
  'グラフに適したカラムがありません（数値カラムが必要です）': 'No numeric columns for chart',
  'グラフの初期化に失敗しました': 'Chart initialization failed',
  '空です': 'Empty',
  '（空のファイルです）': '(empty file)',
  '（編集中の内容がここにプレビューされます）': '(editing preview)',
  '▶ Runでクエリを実行': '▶ Run to execute query',
  'カレンダーを読み込み中...': 'Loading calendar...',
  'このファイルはプレビューできません。ダウンロードしてください。': 'This file cannot be previewed. Please download it.',
  'ディレクトリが見つかりません: {0}': 'Directory not found: {0}',
  '📁 {0} アイテム': '📁 {0} items',
  '+ フォルダ': '+ Folder',
  '+ 追加': '+ Add',
  '📥 URLをドロップしてブックマーク追加': '📥 Drop URL to add bookmark',
  '青': 'Blue',
  '赤': 'Red',
  '緑': 'Green',
  '橙': 'Orange',
  '紫': 'Purple',
  '水色': 'Cyan',
  '灰': 'Gray',
  '月': 'Mon',
  '火': 'Tue',
  '水': 'Wed',
  '木': 'Thu',
  '金': 'Fri',
  '土': 'Sat',
  '日': 'Sun',
};

const ja = {};

const loadMessages = (locale) => {
  if (locale === 'ja') return ja;
  return en;
};

let locale = detectLocale();

export const setLocale = (l) => { locale = l; Object.assign(messages, loadMessages(l)); };
export const getLocale = () => locale;

export const t = (key, ...args) => {
  let msg = messages[key];
  if (msg === undefined) {
    // fallback: try English, then use key as-is
    msg = en[key] ?? key;
  }
  if (args.length === 0) return msg;
  return msg.replace(/\{(\d+)\}/g, (_, idx) => {
    const i = Number(idx);
    return i < args.length ? String(args[i]) : `{${idx}}`;
  });
};

// initialize
setLocale(locale);
