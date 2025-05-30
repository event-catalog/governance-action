import * as core from '@actions/core';
import { Buffer } from 'buffer'; // Needed for Buffer.from

// Define a simple interface for the file object from Octokit
interface OctokitFile {
  filename: string;
  // Add other properties if needed, or use a more specific type from @octokit/types
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
    core.warning(`Failed to fetch content for ${path} at ref ${ref}: ${error.message}`);
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
export async function generateCommentBody(octokit: any, owner: string, repo: string, changedFiles: string[], headSha: string, baseSha: string, catalogDirectory: string | undefined): Promise<string> {
  let commentBody = '## EventCatalog: Detected File Changes\n\n';
  commentBody += `The following files ${catalogDirectory ? `in '${catalogDirectory}' ` : ''}were modified in this pull request:\n\n`;

  for (const filePath of changedFiles) {
    commentBody += `<details><summary><strong>File: ${filePath}</strong></summary>\n\n`;

    commentBody += '### Content Before PR (Base Branch)\n';
    commentBody += '\`\`\`\n';
    const oldFileContent = await getFileContentAtRef(octokit, owner, repo, filePath, baseSha);
    commentBody += `${oldFileContent}\n`;
    commentBody += '\`\`\`\n\n';

    commentBody += '### Content After PR (Head Branch)\n';
    commentBody += '\`\`\`\n';
    const newFileContent = await getFileContentAtRef(octokit, owner, repo, filePath, headSha);
    commentBody += `${newFileContent}\n`;
    commentBody += '\`\`\`\n</details>\n\n';
  }
  return commentBody;
} 