import { generateText, generateObject } from 'ai';
import { createOpenAI } from "@ai-sdk/openai";
import { z } from 'zod';
import { getInput } from '@actions/core';

const EDA_RULES = `
- All schema changes must be backward compatible.
- Events should be designed to be idempotent.
- Avoid using generic event types; be specific about the domain and action.
- All events must have a version number.
- Consider the impact on downstream consumers before making any changes.
`;

const SYSTEM_PROMPT = `You are an expert reviewer specializing in event-driven architectures (EDA).
Your task is to analyze schema diffs and other architectural information based on the provided EDA rules:
${EDA_RULES}

Your audience is enterprise development and architecture teams. Maintain a professional and clear tone.

Provide a detailed assessment covering the following aspects:
- Overall impact of the changes.
- Specific breaking changes, if any.
- Adherence to EDA best practices and the provided rules.
- Potential risks and considerations for downstream systems.

Format your response as a JSON object with the following keys:
- "executiveSummary": A concise (2-3 sentences) overview of the most critical findings and the overall risk/impact. This should be suitable for quick ingestion by stakeholders.
- "detailedAnalysis": A thorough analysis, breaking down observations regarding backward-compatibility, domain impact, adherence to versioning rules, and other architectural notes. Be specific and reference the EDA rules where applicable. Ensure that any lists are formatted using Markdown syntax (e.g., use hyphens \`-\` or asterisks \`*\` for bullet points, and indent for sub-lists).
- "recommendations": Clear, actionable steps to mitigate risks, improve the design, or ensure compatibility. If no issues, suggest affirmations of good practice. Ensure that any lists are formatted using Markdown syntax (e.g., use hyphens \`-\` or asterisks \`*\` for bullet points, and indent for sub-lists).
- "score": A numerical score from 0 to 100, where 0 indicates a very problematic change with high risk of breaking compatibility, and 100 indicates a perfectly safe and well-designed change.`;

const AiResponseSchema = z.object({
  executiveSummary: z.string().describe("A concise summary of key findings and overall impact, suitable for quick review by enterprise stakeholders."),
  detailedAnalysis: z.string().describe("A comprehensive breakdown of the review, including specific issues, backward-compatibility impact, domain concerns, adherence to EDA rules, and other architectural notes. This section should be thorough and professional. Use Markdown for any lists (e.g., hyphens or asterisks for bullet points, indentation for sub-lists)."),
  recommendations: z.string().describe("Actionable recommendations to address identified issues or affirm good practices. Each recommendation should be clear and direct. Use Markdown for any lists (e.g., hyphens or asterisks for bullet points, indentation for sub-lists)."),
  score: z.number().min(0).max(100).describe("A score from 0 to 100, where 0 indicates a very problematic change and 100 indicates a perfectly safe change."),
});

// The Vercel AI SDK will automatically look for the OPENAI_API_KEY 
// environment variable. Make sure it's set in your environment.
// 
// You can also initialize the provider with the key explicitly if preferred:
// const explicitOpenai = openai({ apiKey: 'your-api-key-here' });
// And then use it in generateText: model: explicitOpenai('gpt-4-turbo')

/**
 * Asks an AI model to review an architectural change, focusing on event-driven systems.
 * The AI will return an executive summary, detailed analysis, recommendations, and a score in JSON format.
 *
 * @param promptText The details of the architectural change (e.g., schema diff) to send to the AI.
 * @returns A promise that resolves to an object containing the AI's structured review.
 */
export async function askAI(promptText: string): Promise<z.infer<typeof AiResponseSchema>> {
  try {
    const provider = getInput('provider') || "openai";
    const model = getInput('model') || "o4-mini";
    const apiKey = getInput('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    const openai = createOpenAI({ apiKey: apiKey })
    const { object } = await generateObject({
      model: openai(model),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: promptText,
        },
      ],
      schema: AiResponseSchema,
    });
    return object;
  } catch (error) {
    console.error("Error calling AI model or processing structured output:", error);
    // It's good practice to throw a more specific error or handle it appropriately
    throw new Error("Failed to get a valid structured response from the AI model.");
  }
}

/*
// Example of how to use the askAI function:
async function exampleUsage() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("Please set your OPENAI_API_KEY environment variable.");
    return;
  }

  try {
    const changeDescription = "We are changing the 'userId' field in the 'UserSignedUp' event from a string to an integer.";
    console.log(`Asking AI to review: ${changeDescription}`);
    const response = await askAI(changeDescription);
    console.log("AI's Review:");
    console.log(`  Executive Summary: ${response.executiveSummary}`);
    console.log(`  Detailed Analysis: ${response.detailedAnalysis}`);
    console.log(`  Recommendations: ${response.recommendations}`);
    console.log(`  Score: ${response.score}`);
  } catch (e) {
    console.error("Example usage failed:", e);
  }
}

// To run this example, you would typically call exampleUsage() in a context
// where top-level await is supported or within an async IIFE in a script.
// exampleUsage();
*/
