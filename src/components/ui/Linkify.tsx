import { Fragment } from 'react';

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const TRAILING_PUNCTUATION = /[).,;:!?\]}'"]+$/;

function toHref(url: string): string {
  return url.startsWith('www.') ? `https://${url}` : url;
}

/**
 * Renders text with http(s)/www URLs converted to clickable links.
 * Builds React elements directly (no dangerouslySetInnerHTML), so there's no HTML injection surface.
 * Trailing punctuation (periods, closing parens, etc.) is excluded from the link so
 * "see https://example.com." doesn't swallow the sentence-ending period into the URL.
 */
export default function Linkify({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    let url = match[0];
    let end = match.index + url.length;

    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) {
      url = url.slice(0, -trailing[0].length);
      end -= trailing[0].length;
    }
    if (!url) continue;

    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    nodes.push(
      <a
        key={key++}
        href={toHref(url)}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary-600 underline break-words"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return <>{nodes}</>;
}
