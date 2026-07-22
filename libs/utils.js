import yaml from 'yaml';

export const matter = (content) => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(frontmatterRegex);
  if (match) {
    const frontmatter = match[1];
    const data = yaml.parse(frontmatter);
    return {
      data,
      content: content.slice(match[0].length)
    };
  }
  return {
    data: {},
    content
  };
};
