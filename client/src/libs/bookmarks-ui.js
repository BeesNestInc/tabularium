import { t } from './i18n.js';

export const esc = (s) => {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};

export const fileListingHtml = (entries, dirPath) => {
  if (!entries || !entries.length) return '';
  let html = '<div class="fv-files-header"><span>' + t('itemCount', entries.length) + '</span>'
    + '<div class="fv-actions"><button class="fv-btn" onclick="window.createFolder()">' + t('addFolder') + '</button></div></div>';
  html += '<div class="fv-file-list">';
  const sorted = entries.slice().sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of sorted) {
    const icon = e.type === 'directory' ? '\ud83d\udcc1' : (e.name.endsWith('.md') ? '\ud83d\udcdd' : '\ud83d\udcc4');
    var href = '/' + esc(e.path) + (e.type === 'directory' ? '/' : '');
    var click = e.type === 'directory'
      ? 'window.selectFolder(\'' + esc(e.path) + '\')'
      : 'window.selectTreeFile(\'' + esc(e.path) + '\')';
    var hover = ' onmouseenter="window.showFileInfo(event,\'' + esc(e.path) + '\')" onmouseleave="window.hideFileInfo()"';
    html += '<div class="fv-file-row">';
    html += '<a class="fv-file-item" href="' + href + '"' + hover + ' onclick="event.preventDefault();' + click + ';return false">';
    html += '<span class="fv-file-icon">' + icon + '</span>';
    html += '<span class="fv-file-name">' + esc(e.name) + '</span>';
    if (e.type === 'directory') html += '<span class="fv-file-suffix">/</span>';
    html += '</a>';
    html += '<button class="fv-del-btn" onclick="event.stopPropagation();window.deleteEntry(\'' + esc(e.path) + '\')" title="' + t('delete') + '">✕</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
};

export const bookmarkItemHtml = (bm, i, folderPath, mode) => {
  const tUrl = bm.thumb ? '/api/knowledge/file/' + folderPath + '/.bookmarks/thumbs/' + bm.thumb : '';
  const fUrl = bm.domain ? '/api/knowledge/file/' + folderPath + '/.bookmarks/favicons/' + bm.domain + '.ico' : '';
  if (mode === 'list') {
    return '<div class="fv-bookmark-item">'
      + '<a href="' + esc(bm.url) + '" target="_blank" rel="noopener noreferrer">'
      + (bm.thumb ? '<img class="fv-list-thumb" src="' + esc(tUrl) + '" alt="" loading="lazy">'
        : '<img class="fv-favicon" src="' + esc(fUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">')
      + '<span class="fv-title">' + esc(bm.title) + '</span>'
      + '<span class="fv-domain">' + esc(bm.domain) + '</span>'
      + '</a>'
      + '<button class="fv-edit-btn" onclick="window.editBookmark(' + i + ')" title="' + t('edit') + '">✎</button>'
      + '<button class="fv-del-btn" onclick="window.deleteBookmark(' + i + ')" title="' + t('delete') + '">✕</button>'
      + '</div>';
  }
  // thumbnail card mode
  var bmHover = ' onmouseenter="window.showBookmarkInfo(event,\'' + esc(bm.url) + '\',\'' + esc(bm.title) + '\',\'' + esc(bm.domain || '') + '\')" onmouseleave="window.hideFileInfo()"';
  return '<div class="fv-thumb-card">'
    + '<a href="' + esc(bm.url) + '"' + bmHover + ' target="_blank" rel="noopener noreferrer">'
    + (bm.thumb ? '<img class="fv-thumb-img" src="' + esc(tUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentElement;if(p&&!p.querySelector(\'.fv-thumb-fallback\')){var d=document.createElement(\'div\');d.className=\'fv-thumb-fallback\';d.style.fontSize=\'40px\';d.textContent=\'?\';p.insertBefore(d,this.nextSibling)}">'
      : '<div class="fv-thumb-fallback">'
        + (fUrl ? '<img class="fv-favicon" src="' + esc(fUrl) + '" alt="" loading="lazy" onerror="this.parentElement.textContent=\'?\';this.remove()">' : '?')
        + '</div>')
    + '<div class="fv-thumb-info"><div class="fv-title">' + esc(bm.title) + '</div></div></a>'
    + '<button class="fv-edit-btn" onclick="window.editBookmark(' + i + ')" title="' + t('edit') + '">✎</button>'
    + '<button class="fv-del-btn" onclick="window.deleteBookmark(' + i + ')" title="' + t('delete') + '">✕</button>'
    + '</div>';
};

export const bookmarkListHtml = (bookmarks, folderPath, mode) => {
  if (!bookmarks || !bookmarks.length) return '';
  return '<div class="fv-' + (mode === 'list' ? 'list' : 'thumb-grid' + ' fv-thumb-grid-' + mode.replace('thumb-', '')) + '">'
    + bookmarks.map((bm, i) => bookmarkItemHtml(bm, i, folderPath, mode.startsWith('thumb') ? 'thumb' : 'list')).join('')
    + '</div>';
};

export const folderViewHtml = (folderPath, entries, bookmarks, mode, hasIndex) => {
  let html = '<div class="folder-view">';
  if (mode === 'list') {
    html += fileListingHtml(entries, folderPath);
    if (entries && entries.length) html += '<div style="border-top:1px solid var(--border);margin:12px 0"></div>';
  }
  if (mode === 'list') {
    html += '<div class="fv-bookmarks-header"><span>🔖 Bookmarks</span>'
      + '<div class="fv-actions"><button class="fv-btn" onclick="window.showBookmarkAddDialog(\'\')">' + t('addItem') + '</button></div></div>';
    if (!bookmarks || !bookmarks.length) {
      html += '<div class="fv-empty">' + t('dropUrlToBookmark') + '</div>';
    } else {
      html += bookmarkListHtml(bookmarks, folderPath, 'list');
    }
  } else {
    html += '<div class="fv-thumb-grid fv-thumb-grid-' + mode.replace('thumb-', '') + '">';
    if (entries && entries.length) {
      for (const e of entries.slice().sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })) {
        const ext = e.name.split('.').pop().toLowerCase();
        const imgExts = ['png','jpg','jpeg','jfif','gif','webp','svg','bmp','ico','tif','tiff','avif','heic','heif'];
        const isImage = imgExts.indexOf(ext) !== -1;
        var thumbHref = '/' + esc(e.path) + (e.type === 'directory' ? '/' : '');
        var thumbClick = e.type === 'directory'
          ? 'window.selectFolder(\'' + esc(e.path) + '\')'
          : 'window.selectTreeFile(\'' + esc(e.path) + '\')';
        var thumbHover = ' onmouseenter="window.showFileInfo(event,\'' + esc(e.path) + '\')" onmouseleave="window.hideFileInfo()"';
        html += '<div class="fv-thumb-card">'
          + '<a href="' + thumbHref + '"' + thumbHover + ' onclick="event.preventDefault();' + thumbClick + ';return false">';
        if (isImage) {
          html += '<img class="fv-thumb-img" src="' + esc('/api/knowledge/file/' + e.path) + '" alt="" loading="lazy" onerror="this.alt=\'?\';this.style.display=\'none\';var p=this.parentElement;if(p&&!p.querySelector(\'.fv-thumb-fallback\')){var d=document.createElement(\'div\');d.className=\'fv-thumb-fallback\';d.style.fontSize=\'40px\';d.textContent=\'📄\';p.insertBefore(d,this.nextSibling)}">';
        } else {
          html += '<div class="fv-thumb-fallback" style="font-size:40px">'
            + (e.type === 'directory' ? '\ud83d\udcc1' : (e.name.endsWith('.md') ? '\ud83d\udcdd' : '\ud83d\udcc4'))
            + '</div>';
        }
        html += '<div class="fv-thumb-info"><div class="fv-title">' + esc(e.name) + '</div></div></a>'
          + '<button class="fv-del-btn" onclick="event.stopPropagation();window.deleteEntry(\'' + esc(e.path) + '\')" title="' + t('delete') + '">✕</button>'
          + '</div>';
      }
    }
    for (const [i, bm] of (bookmarks || []).entries()) {
      html += bookmarkItemHtml(bm, i, folderPath, 'thumb');
    }
    html += '</div>';
    html += '<div class="fv-bookmarks-header" style="margin-top:0"><div></div>'
      + '<div class="fv-actions"><button class="fv-btn" onclick="window.showBookmarkAddDialog(\'\')">' + t('addItem') + '</button></div></div>';
  }

  html += '</div>';
  return html;
};

export const bookmarkInlineListHtml = (bookmarks, folderPath) => {
  if (!bookmarks || !bookmarks.length) return '';
  let html = '<div class="bookmark-list-inline">\n';
  for (const bm of bookmarks) {
    const fUrl = bm.domain ? '/api/knowledge/file/' + folderPath + '/.bookmarks/favicons/' + bm.domain + '.ico' : '';
    html += '<div class="bookmark-item-inline">';
    html += '<a href="' + esc(bm.url) + '" target="_blank" rel="noopener noreferrer">';
    if (fUrl) html += '<img class="bookmark-favicon-inline" src="' + esc(fUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    html += '<span class="bookmark-title-inline">' + esc(bm.title) + '</span>';
    html += '</a>';
    html += '<span class="bookmark-domain-inline">' + esc(bm.domain) + '</span>';
    html += '</div>\n';
  }
  html += '</div>';
  return html;
};
