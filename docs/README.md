# Technical documentation

[OmniImageAutoGen architecture](ARCHITECTURE.md) introduces the four runtime components. The [dual-platform specification](specs/dual-platform.md) defines platform URLs, task validation, storage, adapter methods, message contracts and the download algorithm.

## Runtime behavior

- [Sidepanel lifecycle](flow-sidepanel-task-lifecycle.md): setup, queue creation, session capture, retries and cancellation.
- [Content execution](flow-content-execution.md): one task through a Gemini or ChatGPT adapter.
- [Background download pipeline](flow-background-download-pipeline.md): pre-click baseline, detection, stable decoding, transcoding and verified saving.
- [State machines](state-machines.md): views, stages, task outcomes and arm transitions.
- [Timeout and retry model](timeout-and-retry-model.md): budget ownership and retry decisions.

## Contracts and maintenance

- [Runtime messages](protocol-message-contracts.md): requests, responses and stale-message isolation.
- [Configuration and storage](config-and-storage-contracts.md): settings defaults, migration and IDB compatibility.
- [Selectors and DOM contracts](selectors-and-dom-contracts.md): scoped platform interaction and maintenance.
- [Testing and quality](testing-and-quality.md): automated coverage, previews and manual acceptance.
- [Troubleshooting](troubleshooting-playbook.md): readiness, generation, download and recovery checks.

Use Bun for development commands. Release notes are available with `bun run release:notes -- --help`.
