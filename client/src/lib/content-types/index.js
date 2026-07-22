import * as markdown from './markdown.js';
import * as calendar from './calendar.js';

const handlers = [
  markdown,
  calendar,
];

export const resolve = (path) => {
  if (!path) return null;
  return handlers.find(h => h.match(path)) || null;
};
