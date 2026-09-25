import { serve } from "@hono/node-server";
import { z } from "zod";
import { createAgentApp, paymentsFromEnv } from "@lucid-dreams/agent-kit";
import { dedupeLatest, revokeTxData, riskFlags, type Approval } from "./core.js";

const inputSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chains: z.array(z.number().int().positive()).default([1]),
  stale_days: z.number().int().positive().default(90)
});

const { app, addEntrypoint } = createAgentApp(
  {
    name: "approval-risk-auditor",
    version: "0.1.0",
    description: "Flags unlimited or stale ERC-20 / NFT approvals and builds revocation calldata"
  },
  {
    payments: paymentsFromEnv({ defaultPrice: process.env.DEFAULT_PRICE || "1000" })
  }
);

const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f714f50a1f7c3a78adf9b5bca0f27502d6cf62e3c66";
const APPROVAL_FOR_ALL_TOPIC = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";

function topicAddress(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}
function topicToAddress(topic: string) { return `0x${topic.slice(-40)}`; }
function hexBig(v?: string) { return BigInt(v || "0x0"); }

async function etherscanLogs(chainId: number, wallet: string, topic0: string) {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error("ETHERSCAN_API_KEY is required");
  const u = new URL("https://api.etherscan.io/v2/api");
  u.searchParams.set("chainid", String(chainId));
  u.searchParams.set("module", "logs");
  u.searchParams.set("action", "getLogs");
  u.searchParams.set("fromBlock", "0");
  u.searchParams.set("toBlock", "latest");
  u.searchParams.set("topic0", topic0);
  u.searchParams.set("topic1", topicAddress(wallet));
  u.searchParams.set("topic0_1_opr", "and");
  u.searchParams.set("apikey", key);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Etherscan HTTP ${r.status}`);
  const j: any = await r.json();
  if (j.status === "0" && String(j.message).toLowerCase() !== "no records found") {
    throw new Error(`Etherscan: ${j.result || j.message}`);
  }
  return Array.isArray(j.result) ? j.result : [];
}

async function blockTimestamp(chainId: number, blockNumber: bigint): Promise<number | undefined> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return undefined;
  const u = new URL("https://api.etherscan.io/v2/api");
  u.searchParams.set("chainid", String(chainId));
  u.searchParams.set("module", "block");
  u.searchParams.set("action", "getblockreward");
  u.searchParams.set("blockno", blockNumber.toString());
  u.searchParams.set("apikey", key);
  try {
    const j: any = await (await fetch(u)).json();
    const t = Number(j?.result?.timeStamp);
    return Number.isFinite(t) ? t : undefined;
  } catch { return undefined; }
}

async function scanChain(chainId: number, wallet: string): Promise<Approval[]> {
  const [approvalLogs, allLogs] = await Promise.all([
    etherscanLogs(chainId, wallet, APPROVAL_TOPIC),
    etherscanLogs(chainId, wallet, APPROVAL_FOR_ALL_TOPIC)
  ]);

  const out: Approval[] = [];
  for (const l of approvalLogs) {
    const topics: string[] = l.topics || [];
    const blockNumber = hexBig(l.blockNumber);
    const timestamp = await blockTimestamp(chainId, blockNumber);
    if (topics.length === 3) {
      out.push({ chainId, token: l.address, owner: wallet, spender: topicToAddress(topics[2]), kind: "erc20", amount: hexBig(l.data), blockNumber, timestamp });
    }
    if (topics.length >= 4) {
      out.push({ chainId, token: l.address, owner: wallet, spender: topicToAddress(topics[2]), kind: "erc721-single", tokenId: hexBig(topics[3]), approved: topicToAddress(topics[2]) !== "0x0000000000000000000000000000000000000000", blockNumber, timestamp });
    }
  }
  for (const l of allLogs) {
    const topics: string[] = l.topics || [];
    const blockNumber = hexBig(l.blockNumber);
    const timestamp = await blockTimestamp(chainId, blockNumber);
    if (topics.length >= 3) {
      out.push({ chainId, token: l.address, owner: wallet, spender: topicToAddress(topics[2]), kind: "erc721-all", approved: hexBig(l.data) !== 0n, blockNumber, timestamp });
    }
  }
  return dedupeLatest(out).filter(a => {
    if (a.kind === "erc20") return (a.amount ?? 0n) > 0n;
    return a.approved !== false;
  });
}

addEntrypoint({
  key: "audit",
  description: "Audit ERC-20 and NFT approvals and return risk flags plus safe revocation calldata",
  input: inputSchema,
  price: process.env.DEFAULT_PRICE || "1000",
  async handler({ input }) {
    const parsed = inputSchema.parse(input);
    const approvals = (await Promise.all(parsed.chains.map(c => scanChain(c, parsed.wallet)))).flat();
    const rows = approvals.map(a => ({
      chain_id: a.chainId,
      token: a.token,
      owner: a.owner,
      spender: a.spender,
      kind: a.kind,
      amount: a.amount?.toString(),
      token_id: a.tokenId?.toString(),
      block_number: a.blockNumber.toString(),
      timestamp: a.timestamp,
      risk_flags: riskFlags(a, Math.floor(Date.now()/1000), parsed.stale_days),
      revoke_tx: { to: a.token, data: revokeTxData(a), value: "0" }
    }));
    return {
      output: {
        wallet: parsed.wallet,
        chains: parsed.chains,
        approvals: rows,
        risky_count: rows.filter(r => r.risk_flags.length > 0).length,
        notes: ["Revocation calldata is unsigned; caller must review and sign with the audited wallet.", "Stale threshold is configurable and defaults to 90 days."]
      }
    };
  }
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port });
console.log(`approval-risk-auditor listening on :${port}`);