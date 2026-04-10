import { TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, GOLD } from '../lib/medievalTheme';

/**
 * Lightweight markdown renderer for release notes. Handles the subset
 * of markdown used in GitHub Release bodies:
 *   - ## Headings
 *   - - Bullet points (with **bold** spans and `code`)
 *   - **bold** inline
 *   - Blank-line paragraph breaks
 *
 * No external dependencies — just string splitting and inline regex.
 */
export default function MarkdownNotes({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (they create spacing via margin on blocks)
    if (!trimmed) continue;

    // ## Heading
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3
          key={key++}
          className="text-xs font-bold uppercase tracking-widest arena-heading"
          style={{
            color: ACCENT_GOLD,
            marginTop: elements.length > 0 ? '14px' : '0',
            marginBottom: '6px',
            paddingBottom: '4px',
            borderBottom: `1px solid ${GOLD} 0.1)`,
          }}
        >
          {trimmed.slice(3)}
        </h3>
      );
      continue;
    }

    // - Bullet point
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2);
      elements.push(
        <div
          key={key++}
          className="flex gap-2 text-xs leading-relaxed"
          style={{ color: TEXT_BODY, marginBottom: '4px', paddingLeft: '2px' }}
        >
          <span style={{ color: `${GOLD} 0.35)`, flexShrink: 0, marginTop: '1px' }}>&#x2022;</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    // Plain paragraph
    elements.push(
      <p
        key={key++}
        className="text-xs leading-relaxed"
        style={{ color: TEXT_BODY, marginBottom: '6px' }}
      >
        {renderInline(trimmed)}
      </p>
    );
  }

  return <div>{elements}</div>;
}

function renderInline(text) {
  // Split on **bold**, `code`, and — (em dash) patterns.
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code: `text`
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find the earliest match
    const matches = [
      boldMatch && { type: 'bold', index: boldMatch.index, full: boldMatch[0], inner: boldMatch[1] },
      codeMatch && { type: 'code', index: codeMatch.index, full: codeMatch[0], inner: codeMatch[1] },
    ].filter(Boolean).sort((a, b) => a.index - b.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const m = matches[0];

    // Text before the match
    if (m.index > 0) {
      parts.push(remaining.slice(0, m.index));
    }

    if (m.type === 'bold') {
      parts.push(
        <strong key={key++} style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>
          {m.inner}
        </strong>
      );
    } else if (m.type === 'code') {
      parts.push(
        <code
          key={key++}
          style={{
            color: ACCENT_GOLD,
            background: `${GOLD} 0.08)`,
            padding: '1px 4px',
            borderRadius: '3px',
            fontSize: '10px',
          }}
        >
          {m.inner}
        </code>
      );
    }

    remaining = remaining.slice(m.index + m.full.length);
  }

  return parts;
}
