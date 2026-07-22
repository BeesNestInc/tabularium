import { t } from '../../libs/i18n.js';

export const match = (path) => /\.(ical|mycal)$/i.test(path);

export const load = async (path) => {
  return '<div class="text-muted">' + t('loadingCalendar') + '</div>';
};
