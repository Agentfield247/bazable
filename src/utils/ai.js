import { readConfig } from './config.js';
import { logger } from './logger.js';
import chalk from 'chalk';

export async function askAI(userPrompt, systemContext = '') {
  const config = await readConfig();
  const apiKey = config?.aiApiKey;
  if (!apiKey) {
    logger.error('AI API key not configured. Run `bazable config --set-ai-key <your-key>`.');
    process.exit(1);
  }

  // Currently only OpenAI‑compatible endpoints supported
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemContext || 'You are a helpful API architect and engineering assistant.' },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'AI request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    logger.error(`AI request failed: ${error.message}`);
    process.exit(1);
  }
}
