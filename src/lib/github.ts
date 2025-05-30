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

// Helper function to format a section with a title and bulleted list
function formatSectionAsBulletedList(title: string, content: string | undefined | null): string {
  let sectionString = `### ${title}\n`; // Section title
  if (content && content.trim().length > 0) {
    const lines = content.split('\n');
    let hasActualContent = false;
    lines.forEach(line => {
      // Preserve leading spaces on the original line for potential markdown indentation, trim trailing.
      const originalLineWithPreservedIndentation = line.trimEnd();
      if (originalLineWithPreservedIndentation.trim().length > 0) { // Check if the line has non-whitespace characters
        hasActualContent = true;
        // Regex to check if the line already starts with a common list marker
        // Markers: *, -, +, digits., roman numerals., o. (followed by a space)
        const listMarkerRegex = /^\s*([*\-+]|o|[0-9]+\.|[ivxlcdm]+\.)\s+/i;
        if (listMarkerRegex.test(originalLineWithPreservedIndentation)) {
          sectionString += `${originalLineWithPreservedIndentation}\n`; // Pass through if already formatted
        } else {
          // If not an existing list item, make it a primary bullet.
          // trimStart() to remove leading spaces before adding our own bullet.
          sectionString += `- ${originalLineWithPreservedIndentation.trimStart()}\n`;
        }
      } else {
        // Add empty lines back if they were in the original content, might be for spacing.
        sectionString += `${line}\n`;
      }
    });
    if (!hasActualContent) {
        sectionString += `No ${title.toLowerCase()} provided (content was empty or whitespace only).\n`;
    }
  } else {
    sectionString += `No ${title.toLowerCase()} provided.\n`;
  }
  return sectionString + '\n'; // Extra newline after the section
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
  owner: string, 
  repo: string, 
  reviewedFiles: ReviewedFile[], 
  headSha: string, 
  baseSha: string, // baseSha is not used directly here anymore
  catalogDirectory: string | undefined
): Promise<string> {
  let commentBody = '# EventCatalog: Governance Review\n\n';
  commentBody += `The following files ${catalogDirectory ? `in \'${catalogDirectory}\' ` : ''}were modified in this pull request:\n\n`;

  for (const reviewedFile of reviewedFiles) {
    const fileUrl = `https://github.com/${owner}/${repo}/blob/${headSha}/${reviewedFile.filePath}`;

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
      // 1. Score
      commentBody += `### **Score:** ${scorePrefix}${score}/100\n\n`;
      // 2. File link (small) - now after score
      commentBody += `<sub>File: [${reviewedFile.filePath}](${fileUrl})</sub>\n\n`;
      
      // 3. Executive Summary
      commentBody += `**Executive Summary:**\n${reviewedFile.aiReview.executiveSummary}\n\n`;

      // 4. Detailed Analysis
      commentBody += formatSectionAsBulletedList("Detailed Analysis", reviewedFile.aiReview.detailedAnalysis);
      
      // 5. Recommendations
      commentBody += formatSectionAsBulletedList("Recommendations", reviewedFile.aiReview.recommendations);

    } else {
      // No AI Review. File link is the primary intro, but small.
      commentBody += `<sub>File: [${reviewedFile.filePath}](${fileUrl})</sub>\n\n`; // Small file link
      
      // Then the error or "not available" message
      commentBody += '##### AI-Powered Review\n'; // Keep sub-heading for this message block
      if (reviewedFile.aiError) {
        commentBody += `*AI review could not be generated for this file. Error: ${reviewedFile.aiError}*\n\n`;
      } else { // aiReview is falsy but not an aiError, so "not available"
        commentBody += `*AI review data not available for this file.*

`;
      }
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