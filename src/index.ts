import * as core from '@actions/core';
import * as github from '@actions/github';
import { generateCommentBody, ReviewedFile, initialChecksAndGetChangedFiles } from './lib/github'; // Updated import
// import { askAI } from './lib/ai'; // No longer directly used
import { readdir } from 'fs/promises';
import { performSchemaReview, SchemaReviewResult } from './tasks/schema-review'; // Import the new function and type

const VALID_TASKS = ['schema_review', 'config_review'];

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const failureThresholdInput = core.getInput('failure_threshold');
    const failureThreshold = parseInt(failureThresholdInput, 10);

    const task = core.getInput('task');
    if (!VALID_TASKS.includes(task)) {
      core.setFailed(`Invalid input for \`task\`. Must be one of: ${VALID_TASKS.join(', ')}.`);
      return;
    }

    const catalogDirectory = core.getInput('catalog_directory');
    if (catalogDirectory) {
      core.info(`Catalog directory: ${catalogDirectory}`);
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

    // Perform initial checks and get changed files
    const { changedFilePaths, shouldContinue } = await initialChecksAndGetChangedFiles(octokit, context, catalogDirectory || undefined);

    if (!shouldContinue) {
      return; // Exit if checks fail or no files to process
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const headSha = context.payload.pull_request!.head.sha; // Non-null assertion as payload is checked in initialChecksAndGetChangedFiles
    const baseSha = context.payload.pull_request!.base.sha; // Non-null assertion
    const issueNumber = context.payload.pull_request!.number; // Non-null assertion
    const pullRequestNumber = context.payload.pull_request!.number; // Non-null assertion

    core.info(`directory: ${catalogDirectory}`);

    // Call the refactored schema review function
    const reviewResult: SchemaReviewResult = await performSchemaReview(octokit, owner, repo, changedFilePaths, baseSha, headSha);

    // Pass the array of ReviewedFile objects to generateCommentBody
    const commentBody = await generateCommentBody(octokit, owner, repo, pullRequestNumber, reviewResult.reviewedFiles, headSha, baseSha, catalogDirectory || undefined);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    core.setOutput('comment-url', `https://github.com/${owner}/${repo}/pull/${issueNumber}#issuecomment-${context.payload.comment?.id}`);

    // Fail the action if any file has a score below the threshold
    if (reviewResult.overallLowestScore < failureThreshold) {
      core.setFailed(`Action failed: File '${reviewResult.lowScoreFile}' received an AI review score of ${reviewResult.overallLowestScore}, which is below the threshold of ${failureThreshold}.`);
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run(); 