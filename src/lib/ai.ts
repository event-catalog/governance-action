import { generateText, generateObject } from 'ai';
import { createOpenAI } from "@ai-sdk/openai";
import { z } from 'zod';
import { getInput } from '@actions/core';

const SYSTEM_PROMPT = `You are an expert reviewer specializing in event-driven architectures.
Your task is to analyze schema diffs and other architectural information.
Identify potential breaking changes and assess the overall impact of the proposed changes.
Please provide a detailed explanation of your findings and a score from 0 to 100, where 0 indicates a very problematic change with high risk of breaking compatibility, and 100 indicates a perfectly safe and well-designed change.
Format your response as a JSON object with two keys: "explanation" (string) and "score" (number).`;

// The AiResponseSchema can still be useful for validating the parsed JSON, even if not passed directly to the SDK.
const AiResponseSchema = z.object({
  explanation: z.string().describe("Detailed explanation of the findings, including any breaking changes or architectural concerns."),
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
 * The AI will return an explanation and a score in JSON format.
 *
 * @param promptText The details of the architectural change (e.g., schema diff) to send to the AI.
 * @returns A promise that resolves to an object containing the AI's explanation and score.
 */
export async function askAI(promptText: string): Promise<{ explanation: string; score: number }> {
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
    console.log(`  Explanation: ${response.explanation}`);
    console.log(`  Score: ${response.score}`);
  } catch (e) {
    console.error("Example usage failed:", e);
  }
}

// To run this example, you would typically call exampleUsage() in a context
// where top-level await is supported or within an async IIFE in a script.
// exampleUsage();
*/
