import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils'; // Correct way to get Octokit type
import { getFileContentAtRef, ReviewedFile } from '../lib/github';
import { askAI } from '../lib/ai';

export interface SchemaReviewResult {
  reviewedFiles: ReviewedFile[];
  overallLowestScore: number;
  lowScoreFile: string;
}

async function reviewSingleFile(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  filePath: string,
  baseSha: string,
  headSha: string
): Promise<ReviewedFile> {
  core.info(`Performing schema review for file: ${filePath}`);
  const oldFileContent = await getFileContentAtRef(octokit, owner, repo, filePath, baseSha);
  const newFileContent = await getFileContentAtRef(octokit, owner, repo, filePath, headSha);

  const promptForAI = `Review the following changes to the file \`${filePath}\`:\n\nOld version (from base branch):\n\`\`\`\n${oldFileContent}\n\`\`\`\n\nNew version (from this PR):\n\`\`\`\n${newFileContent}\n\`\`\`\n\nPlease analyze these changes for potential issues, especially breaking changes if this is a schema or configuration file. Provide your assessment.`;

  let reviewedFileEntry: ReviewedFile = {
    filePath,
    oldFileContent,
    newFileContent,
  };

  try {
    core.info(`Requesting AI review for ${filePath}...`);
    const aiReview = await askAI(promptForAI);
    core.info(`AI review received for ${filePath}: Score ${aiReview.score}`);
    reviewedFileEntry.aiReview = aiReview;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`AI review failed for ${filePath}: ${errorMessage}`);
    reviewedFileEntry.aiError = errorMessage;
  }
  return reviewedFileEntry;
}

export async function performSchemaReview(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  changedFilePaths: string[],
  baseSha: string,
  headSha: string
): Promise<SchemaReviewResult> {
  const reviewedFiles: ReviewedFile[] = [];
  let overallLowestScore = 100;
  let lowScoreFile = '';

  for (const filePath of changedFilePaths) {
    const reviewedFileEntry = await reviewSingleFile(octokit, owner, repo, filePath, baseSha, headSha);
    reviewedFiles.push(reviewedFileEntry);
    if (reviewedFileEntry.aiReview && reviewedFileEntry.aiReview.score < overallLowestScore) {
      overallLowestScore = reviewedFileEntry.aiReview.score;
      lowScoreFile = filePath;
    }
  }

  return {
    reviewedFiles,
    overallLowestScore,
    lowScoreFile,
  };
}
