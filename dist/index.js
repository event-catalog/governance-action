"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
async function run() {
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
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
    }
}
run();
