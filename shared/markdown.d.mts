export function renderMarkdown(source: string): Promise<{html:string;headings:{depth:number;slug:string;text:string}[];remarkPluginFrontmatter:{words:number;minutes:number}}>;
