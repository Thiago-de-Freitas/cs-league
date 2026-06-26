export type TextMatchParts = {
  pre: string;
  hit: string;
  post: string;
};

/** Divide texto para destacar o trecho que bate com a busca (case-insensitive). */
export function splitBySearchQuery(text: string, query: string): TextMatchParts {
  const source = text ?? '';
  const needle = query.trim();
  if (!needle) {
    return { pre: source, hit: '', post: '' };
  }
  const idx = source.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) {
    return { pre: source, hit: '', post: '' };
  }
  return {
    pre: source.slice(0, idx),
    hit: source.slice(idx, idx + needle.length),
    post: source.slice(idx + needle.length),
  };
}
