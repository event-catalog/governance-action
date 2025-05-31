import * as core from '@actions/core';
import * as github from '@actions/github';
import { getChangedFiles, generateCommentBody, getFileContentAtRef, ReviewedFile } from './lib/github'; // Updated import path
import { askAI } from './lib/ai';
import { readdir } from 'fs/promises';

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const failureThresholdInput = core.getInput('failure_threshold');
    const failureThreshold = parseInt(failureThresholdInput, 10);

    // Log folders in the catalog directory
    const catalogDirectory = core.getInput('catalog_directory');
    if (catalogDirectory) {
      core.info(`Catalog directory: ${catalogDirectory}`);
      // Read the directory and log the files
      const files = await readdir(catalogDirectory);
      core.info(`Files in catalog directory: ${files.join(', ')}`);
    } else {
      core.info('No catalog directory specified.');
    }

    if (isNaN(failureThreshold) || failureThreshold < 0 || failureThreshold > 100) {
      core.setFailed('Invalid input for `failure_threshold`. Must be a number between 0 and 100.');
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    if (context.eventName !== 'pull_request') {
      core.setFailed('This action can only be run on pull_request events.');
      return;
    }

    if (!context.payload.pull_request) {
      core.setFailed('Pull request payload is missing.');
      return;
    }

    const pullRequestNumber = context.payload.pull_request.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const headSha = context.payload.pull_request.head.sha;
    const baseSha = context.payload.pull_request.base.sha;
    const issueNumber = context.payload.pull_request.number;

    const changedFilePaths = await getChangedFiles(octokit, owner, repo, pullRequestNumber, catalogDirectory || undefined);

    core.info(`directory: ${catalogDirectory}`);

    if (changedFilePaths.length === 0) {
      if (catalogDirectory) {
        core.info(`No changed files found within the specified directory: ${catalogDirectory}. Action will not comment.`);
      } else {
        core.info('No files changed in this pull request.');
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: '## EventCatalog: Detected File Changes\n\nNo files were changed in this pull request.',
        });
      }
      return;
    }

    const reviewedFiles: ReviewedFile[] = [];
    let overallLowestScore = 100; // Initialize with the highest possible score
    let lowScoreFile = '';

    for (const filePath of changedFilePaths) {
      core.info(`Processing file: ${filePath}`);
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
        if (aiReview.score < overallLowestScore) {
          overallLowestScore = aiReview.score;
          lowScoreFile = filePath;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.error(`AI review failed for ${filePath}: ${errorMessage}`);
        reviewedFileEntry.aiError = errorMessage;
      }
      reviewedFiles.push(reviewedFileEntry);
    }

    // Pass the array of ReviewedFile objects to generateCommentBody
    const commentBody = await generateCommentBody(octokit, owner, repo, pullRequestNumber, reviewedFiles, headSha, baseSha, catalogDirectory || undefined);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    core.setOutput('comment-url', `https://github.com/${owner}/${repo}/pull/${issueNumber}#issuecomment-${context.payload.comment?.id}`);

    // Fail the action if any file has a score below the threshold
    if (overallLowestScore < failureThreshold) {
      core.setFailed(`Action failed: File '${lowScoreFile}' received an AI review score of ${overallLowestScore}, which is below the threshold of ${failureThreshold}.`);
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run(); 