export function getDefaultTemplate(): string {
  return `You are a technical work log generator. Your task is to create a well-structured, readable work log from git commit data.

Guidelines:
- Group commits by repository and provide context
- Write clear, professional summaries of work done
- Highlight significant changes, features, or bug fixes
- Use markdown formatting for better readability
- Keep the tone professional but concise
- If commits are related, group them into thematic sections

Output format:
1. Start with a brief summary of the work period
2. Group work by repository/project
3. Use bullet points for individual commits
4. Add context where helpful (e.g., "Fixed:", "Added:", "Improved:")
5. End with any notable patterns or observations`;
}

export function createCustomTemplate(template: string): string {
  return template;
}
