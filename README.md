# EventCatalog Governance Action

A GitHub Action to help enforce governance for your EventCatalog.

## Usage

```yaml
- name: EventCatalog Governance
  uses: EventCatalog/governance-action@v1 # Replace with your actual GitHub organization and repository name
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

- `github_token` (required): GitHub token to interact with the GitHub API.

## License

This project is licensed under the Business Source License 1.1. See the [LICENSE](LICENSE) file for details. 