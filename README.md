# Approval Risk Auditor — Daydreams AI Bounty #5

Purpose: audit a wallet for ERC-20 / ERC-721 approvals, flag unlimited/stale approvals, and return unsigned calldata that safely revokes each active approval.

## What is implemented
- Etherscan V2 multi-chain approval log ingestion.
- ERC-20 `Approval(owner,spender,value)` reconstruction.
- ERC-721 single-token `Approval` and collection-wide `ApprovalForAll` reconstruction.
- Latest-state de-duplication so revoked approvals do not remain active.
- Risk flags: unlimited ERC-20 allowance, stale approvals, collection-wide NFT operator approval.
- Correct unsigned revoke calldata for ERC-20 and ERC-721 approval types.
- Daydreams `@lucid-dreams/agent-kit` entrypoint with x402 payments enabled from environment variables.

## Run
1. Copy `.env.example` to `.env` and fill values.
2. `npm install`
3. `npm test`
4. `npm run dev`
5. POST to `/entrypoints/audit/invoke`.

## Deployment checklist
- Deploy on a public domain.
- Set `ETHERSCAN_API_KEY`.
- Set x402 `ADDRESS`, `NETWORK`, `FACILITATOR_URL`, and `DEFAULT_PRICE`.
- Verify `/health`, `/entrypoints`, and `/.well-known/agent.json`.
- Validate real wallets against Etherscan Token Approvals.
- Submit a markdown file under `submissions/` in `daydreamsai/agent-bounties` and open a PR linking issue #5.

## Safety
The service never signs or broadcasts revocation transactions. It only returns unsigned transaction data for review/signature by the wallet owner.
