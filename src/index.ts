import * as core from '@actions/core';
import * as github from '@actions/github';
import { getChangedFiles, generateCommentBody } from './lib/github'; // Updated import path

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const catalogDirectory = core.getInput('catalog_directory');
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
    const baseSha = context.payload.pull_request.base.sha; // Get the base SHA of the PR
    const issueNumber = context.payload.pull_request.number;

    const changedFiles = await getChangedFiles(octokit, owner, repo, pullRequestNumber, catalogDirectory || undefined);

    console.log('directory', catalogDirectory);
    core.info(`directory: ${catalogDirectory}`);

    if (changedFiles.length === 0) {
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

    const commentBody = await generateCommentBody(octokit, owner, repo, changedFiles, headSha, baseSha, catalogDirectory || undefined);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    core.setOutput('comment-url', `https://github.com/${owner}/${repo}/pull/${issueNumber}#issuecomment-${context.payload.comment?.id}`);

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run(); 