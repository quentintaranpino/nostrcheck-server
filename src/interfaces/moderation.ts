interface moderationCategory {
    code: string;
    description: string;
}

const moderationCategories : moderationCategory[] = [
    { code: '0', description: 'SAFE' },
    { code: '1', description: 'QUESTIONABLE' },
    { code: '2', description: 'UNSAFE' }
];

const emptyModerationCategory: moderationCategory = {
    code: '99',
    description: 'Unknown'
};

export { moderationCategories, moderationCategory, emptyModerationCategory };