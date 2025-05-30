import * as core from '@actions/core';
import { Buffer } from 'buffer'; // Needed for Buffer.from

// Define a simple interface for the file object from Octokit
interface OctokitFile {
  filename: string;
  // Add other properties if needed, or use a more specific type from @octokit/types
}

// Interface for AI Review data (matching the updated AiResponseSchema in ai.ts)
export interface AiReview {
  executiveSummary: string;
  detailedAnalysis: string;
  recommendations: string;
  score: number;
}

// Interface for a file that has been reviewed (or attempted to be reviewed)
export interface ReviewedFile {
  filePath: string;
  oldFileContent: string;
  newFileContent: string;
  aiReview?: AiReview;
  aiError?: string;
}

// Helper function to get file content at a specific ref
export async function getFileContentAtRef(octokit: any, owner: string, repo: string, path: string, ref: string): Promise<string> {
  try {
    const { data: contentResponse } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in contentResponse && contentResponse.content) {
      if (contentResponse.encoding === 'base64') {
        return Buffer.from(contentResponse.content, 'base64').toString('utf-8');
      }
      return contentResponse.content;
    } else if (Array.isArray(contentResponse)) {
      return 'This is a directory, content not displayed.';
    }
    return 'Could not retrieve content for this file.';
  } catch (error: any) {
    core.warning(`Failed to fetch content for ${path} at ref ${ref}: ${error.mreessage}`);
    return `Could not retrieve content (Error: ${error.message})`;
  }
}

// Helper function to get changed files in a PR
export async function getChangedFiles(octokit: any, owner: string, repo: string, pullRequestNumber: number, catalogDirectory: string | undefined): Promise<string[]> {
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullRequestNumber,
  });

  let changedFiles = files.map((file: OctokitFile) => file.filename);

  if (catalogDirectory) {
    core.info(`Filtering changed files for directory: ${catalogDirectory}`);
    changedFiles = changedFiles.filter((file: string) => file.startsWith(catalogDirectory));
  }
  return changedFiles;
}

// Helper function to generate the comment body
export async function generateCommentBody(
  octokit: any, // octokit is not used directly here anymore but kept for consistency if needed elsewhere by caller
  owner: string, // owner is not used directly here anymore

  
  repo: string, // repo is not used directly here anymore
  reviewedFiles: ReviewedFile[], 
  headSha: string, // headSha is not used directly here anymore
  baseSha: string, // baseSha is not used directly here anymore
  catalogDirectory: string | undefined
): Promise<string> {
  let commentBody = '# EventCatalog: Governance Review\n\n';
  commentBody += `The following files ${catalogDirectory ? `in \'${catalogDirectory}\' ` : ''}were modified in this pull request:\n\n`;

  for (const reviewedFile of reviewedFiles) {
    commentBody += `## File: ${reviewedFile.filePath}\n\n`;

    if (reviewedFile.aiReview) {
      const score = reviewedFile.aiReview.score;
      let scorePrefix = '';
      if (score < 25) {
        scorePrefix = '<span style="color:red;">🚨 Danger</span> ';
      } else if (score < 75) {
        scorePrefix = '<span style="color:orange;">⚠️ Warning</span> ';
      } else {
        scorePrefix = '<span style="color:green;">✅ Safe</span> ';
      }
      commentBody += `**Score:** ${scorePrefix}${score}/100\n\n`;
      commentBody += `**Executive Summary:**\n${reviewedFile.aiReview.executiveSummary}\n\n`;

      commentBody += `### Detailed Analysis\n${reviewedFile.aiReview.detailedAnalysis}\n\n`;
      commentBody += `### Recommendations\n${reviewedFile.aiReview.recommendations}\n\n`;
    } else if (reviewedFile.aiError) {
      commentBody += '### AI-Powered Review\n';
      commentBody += `*AI review could not be generated for this file. Error: ${reviewedFile.aiError}*\n\n`;
    } else {
      commentBody += '### AI-Powered Review\n';
      commentBody += `*AI review data not available for this file.*\n\n`;
    }

    commentBody += '### Content Before PR (Base Branch)\n';
    commentBody += '\`\`\`\n';
    commentBody += `${reviewedFile.oldFileContent}\n`;
    commentBody += '\`\`\`\n\n';

    commentBody += '### Content After PR (Head Branch)\n';
    commentBody += '\`\`\`\n';
    commentBody += `${reviewedFile.newFileContent}\n`;
    commentBody += '\`\`\`\n\n';
    commentBody += '---\n\n';
  }
  return commentBody;
} 