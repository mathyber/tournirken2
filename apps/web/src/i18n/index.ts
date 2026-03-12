import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './ru.json';
import en from './en.json';
import uk from './uk.json';
import be from './be.json';
import es from './es.json';

const savedLang = localStorage.getItem('language') || 'ru';

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    uk: { translation: uk },
    be: { translation: be },
    es: { translation: es },
  },
  lng: savedLang,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
