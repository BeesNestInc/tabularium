const OFFICE_EXTS = ['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf'];

const isImageExt = (name) => /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(name);
const isTextExt = (name) => /\.(txt|json|yaml|yml|js|ts|css|scss|html|htm|xml)$/i.test(name);
const isCsvExt = (name) => /\.csv$/i.test(name);
const isDrawioExt = (name) => /\.drawio$/i.test(name);
const isOfficeExt = (name) => OFFICE_EXTS.includes(name.split('.').pop().toLowerCase());
const isCalendarExt = (name) => /\.(ical|mycal)$/i.test(name);

const getEditorLang = (name) => {
  if (/\.md$|\.mmd$/i.test(name)) return 'markdown';
  if (/\.json$/i.test(name)) return 'json';
  if (/\.(yaml|yml|ical|mycal)$/i.test(name)) return 'yaml';
  return 'text';
};

export { isImageExt, isTextExt, isCsvExt, isDrawioExt, isOfficeExt, isCalendarExt, getEditorLang };
