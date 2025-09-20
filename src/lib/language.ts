import { francAll } from 'franc';
import { ISO_639_3_TO_1 } from '../interfaces/language.js';

const getTextLanguage = (text: string): string => {
    if (text.length < 10) return '';
    const languages = francAll(text);
    if (!languages.length) return '';
    return ISO_639_3_TO_1[languages[0][0]] || languages[0][0];
}

export { getTextLanguage }