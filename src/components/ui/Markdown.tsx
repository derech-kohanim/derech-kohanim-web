import { useMemo, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

/**
 * A deliberately small Markdown subset: headings, paragraphs, lists, bold, italic, inline code
 * and links. The terms of use documents arrive from the server as Markdown, and a full parser is
 * not worth the bundle for a handful of constructs. Anything unrecognised stays literal text,
 * so a document is never swallowed by a syntax the renderer does not know.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;

/** Bold before italic, so `**text**` is not read as an empty emphasis pair. */
const INLINE =
  /\*\*([\s\S]+?)\*\*|\*([^\s*][\s\S]*?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      // A single newline inside a paragraph is a soft wrap in the source, not a line break.
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  function flushList() {
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  }

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = ordered !== null;
      flushParagraph();
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((bullet?.[1] ?? ordered?.[1] ?? '').trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** Only schemes that cannot execute script. An unsafe link degrades to its own text. */
function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href) ? href : null;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(INLINE.source, 'g');
  let last = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${match.index}`;
    const [, bold, italic, code, linkText, linkHref] = match;

    if (bold !== undefined) {
      nodes.push(<strong key={key}>{renderInline(bold)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{renderInline(italic)}</em>);
    } else if (code !== undefined) {
      nodes.push(
        <code key={key} className={styles.markdownCode}>
          {code}
        </code>,
      );
    } else {
      const href = safeHref(linkHref);
      nodes.push(
        href ? (
          <a
            key={key}
            className={styles.markdownLink}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {linkText}
          </a>
        ) : (
          linkText
        ),
      );
    }

    last = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export interface MarkdownProps {
  source: string;
  /** Level a top level `#` maps to, so the document nests under the surrounding title. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function Markdown({ source, headingLevel = 3, className }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(source), [source]);

  return (
    <div className={cn(styles.markdown, className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = `h${Math.min(headingLevel + block.level - 1, 6)}` as 'h3';
          return (
            <Heading key={index} className={styles.markdownHeading}>
              {renderInline(block.text)}
            </Heading>
          );
        }

        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={index} className={styles.markdownList} data-ordered={block.ordered}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }

        return (
          <p key={index} className={styles.markdownParagraph}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
