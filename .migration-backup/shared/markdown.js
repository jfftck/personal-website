'use strict';

export function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function inline(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(src) {
  const lines = src.split('\n');
  let out = '';
  let inPre = false, preLang = '', preBuf = [];
  let inUL = false, inOL = false;
  let inTbl = false, tblBuf = [];
  let paraBuf = [];

  function flushPara() {
    if (!paraBuf.length) return;
    out += `<p>${inline(paraBuf.join(' ').trim())}</p>\n`;
    paraBuf = [];
  }
  function flushList() {
    if (inUL) { out += '</ul>\n'; inUL = false; }
    if (inOL) { out += '</ol>\n'; inOL = false; }
  }
  function flushTable() {
    if (!inTbl) return;
    inTbl = false;
    if (!tblBuf.length) { tblBuf = []; return; }
    const rows  = tblBuf.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const isSep = r => r.every(c => /^:?-+:?$/.test(c));
    let html = '<table class="md-table">', tbody = false;
    rows.forEach((row, i) => {
      if (isSep(row)) { if (!tbody) { html += '</thead><tbody>'; tbody = true; } return; }
      if (!tbody && i === 0) { html += '<thead><tr>' + row.map(c => `<th>${inline(c)}</th>`).join('') + '</tr>'; return; }
      if (!tbody) { html += '</thead><tbody>'; tbody = true; }
      html += '<tr>' + row.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
    });
    if (!tbody) html += '</thead><tbody>';
    out += html + '</tbody></table>\n';
    tblBuf = [];
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inPre) {
        out += `<pre><code class="lang-${esc(preLang)}">${esc(preBuf.join('\n'))}</code></pre>\n`;
        preBuf = []; inPre = false; preLang = '';
      } else { flushPara(); flushList(); flushTable(); inPre = true; preLang = line.slice(3).trim(); }
      continue;
    }
    if (inPre) { preBuf.push(line); continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { flushPara(); flushList(); flushTable(); out += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>\n`; continue; }

    if (/^(\*\*\*|---|___)\s*$/.test(line.trim()) && line.trim().length >= 3) {
      flushPara(); flushList(); flushTable(); out += '<hr>\n'; continue;
    }

    const tl = line.trim();
    if (tl.startsWith('|') && tl.lastIndexOf('|') > 0) {
      flushPara(); flushList(); inTbl = true; tblBuf.push(tl); continue;
    }
    if (inTbl) flushTable();

    const ulm = line.match(/^[ \t]*[*+-]\s+(.*)/);
    if (ulm) {
      flushPara(); flushTable();
      if (inOL) { out += '</ol>\n'; inOL = false; }
      if (!inUL) { out += '<ul>\n'; inUL = true; }
      out += `<li>${inline(ulm[1])}</li>\n`; continue;
    }
    const olm = line.match(/^[ \t]*\d+\.\s+(.*)/);
    if (olm) {
      flushPara(); flushTable();
      if (inUL) { out += '</ul>\n'; inUL = false; }
      if (!inOL) { out += '<ol>\n'; inOL = true; }
      out += `<li>${inline(olm[1])}</li>\n`; continue;
    }
    if (inUL || inOL) flushList();
    if (!line.trim()) { flushPara(); continue; }
    paraBuf.push(line.trim());
  }
  flushPara(); flushList(); flushTable();
  if (inPre) out += `<pre><code>${esc(preBuf.join('\n'))}</code></pre>\n`;
  return out;
}
