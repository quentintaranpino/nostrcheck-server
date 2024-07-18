interface moderationCategory {
    code: string;
    description: string;
}

const moderationCategories : moderationCategory[] = [
    { code: 'NA', description: 'None applying / Safe, safe, neutral' },
    { code: 'O1', description: 'Hate, Humiliation, Harassment' },
    { code: 'O2', description: 'Violence, Harm, or Cruelty' },
    { code: 'O3', description: 'Sexual Content, sexy, Sexy' },
    { code: 'O4', description: 'Nudity Content, nude, Nude' },
    { code: 'O5', description: 'Criminal Planning' },
    { code: 'O6', description: 'Weapons or Substance Abuse' },
    { code: 'O7', description: 'Self-Harm' },
    { code: 'O8', description: 'Animal Cruelty' },
    { code: 'O9', description: 'Disasters or Emergencies' },
    { code: '10', description: 'Political Content' },
    { code: '99', description: 'Unknown' }
];

const emptyModerationCategory: moderationCategory = {
    code: '99',
    description: 'Unknown'
};

export { moderationCategories, moderationCategory, emptyModerationCategory };