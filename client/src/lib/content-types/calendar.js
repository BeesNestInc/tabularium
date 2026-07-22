export const match = (path) => /\.(ical|mycal)$/i.test(path);

export const load = async (path) => {
  return '<div class="text-muted">カレンダーを読み込み中...</div>';
};
