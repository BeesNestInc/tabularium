const fileTemplates = {
  '.drawio': () => `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Legion">
  <diagram id="new-${Date.now()}" name="Page-1">
    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`,
  '.mmd': () => `# Title

\`\`\`mermaid
graph TD
    A[Hello] --> B[World]
\`\`\`
`,
  '.ical': () => `name: 新しいカレンダー
timezone: Asia/Tokyo
prodid: -//Legion//Calendar//EN
events: []
`,
  '.mycal': () => `name: カレンダー一覧
calendars:
  - knowledge/calendars/team.ical
`,
};

export { fileTemplates };
