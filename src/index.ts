import * as core from '@actions/core';
import * as github from '@actions/github';

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
    const headSha = context.payload.pull_request.head.sha; // Get the head SHA of the PR
    const issueNumber = context.payload.pull_request.number; // Defined issueNumber earlier

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    let changedFiles = files.map(file => file.filename);

    console.log('directory', catalogDirectory);
    core.info(`directory: ${catalogDirectory}`);

    if (catalogDirectory) {
      core.info(`Filtering changed files for directory: ${catalogDirectory}`);
      changedFiles = changedFiles.filter(file => file.startsWith(catalogDirectory));
      if (changedFiles.length === 0) {
        core.info(`No changed files found within the specified directory: ${catalogDirectory}. Action will not comment.`);
        return; // Silently exit if no files in specified directory
      }
    }

    // If catalogDirectory was specified and led to no files, we've returned.
    // So, if changedFiles is empty here, it means no catalogDirectory was given AND no files changed in the PR.
    if (changedFiles.length === 0) {
      core.info('No files changed in this pull request.');
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: '## EventCatalog: Detected File Changes\n\nNo files were changed in this pull request.',
      });
      return;
    }

    // At this point, changedFiles.length > 0 is guaranteed.
    let commentBody = '## EventCatalog: Detected File Changes\n\n';

    commentBody += `The following files ${catalogDirectory ? `in '${catalogDirectory}' ` : ''}were modified in this pull request:\n\n`;
    for (const filePath of changedFiles) {
      commentBody += `<details><summary><strong>File: ${filePath}</strong></summary>\n\n\`\`\`\n`;
      try {
        const { data: contentResponse } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: headSha,
        });

        let fileContent = '';
        if ('content' in contentResponse && contentResponse.content) {
          if (contentResponse.encoding === 'base64') {
            fileContent = Buffer.from(contentResponse.content, 'base64').toString('utf-8');
          } else {
            fileContent = contentResponse.content;
          }
        } else if (Array.isArray(contentResponse)) {
          fileContent = 'This is a directory, content not displayed.';
        } else {
          fileContent = 'Could not retrieve content for this file.';
        }
        commentBody += `${fileContent}\n`;
      } catch (error) {
        // @ts-ignore
        core.warning(`Failed to fetch content for ${filePath}: ${error.message}`);
        // @ts-ignore
        commentBody += `Could not retrieve content (Error: ${error.message})\n`;
      }
      commentBody += '\`\`\`\n</details>\n\n';
    }

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