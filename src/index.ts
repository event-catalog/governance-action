import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
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

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const changedFiles = files.map(file => file.filename);

    if (changedFiles.length === 0) {
      core.info('No files changed in this pull request.');
      return;
    }

    const issueNumber = context.payload.pull_request.number; // Use PR number as issue number for comments

    const commentBody = `You changed these files in this PR: \n${changedFiles.map(file => `- ${file}`).join('\n')}`;

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