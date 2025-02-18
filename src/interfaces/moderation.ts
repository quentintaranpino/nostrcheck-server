

const moderationCategories : ModerationCategory[] = [
    { code: '0', description: 'SAFE' },
    { code: '1', description: 'QUESTIONABLE' },
    { code: '2', description: 'UNSAFE' }
];

const emptyModerationCategory: ModerationCategory = {
    code: '99',
    description: 'Unknown'
};

interface ModerationCategory {
    code: string;
    description: string;
}

interface ModerationJob {
    url: string;
    originTable: string;
    originId: string;
    fileName: string;
  }

export { moderationCategories, ModerationCategory, emptyModerationCategory, ModerationJob };